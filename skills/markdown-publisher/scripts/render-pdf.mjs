#!/usr/bin/env node
import { closeSync, existsSync, mkdtempSync, openSync, readSync, rmSync, statSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { parseArgs, resolveBrowser } from './lib.mjs';

function hasCompletePdf(filePath) {
  if (!existsSync(filePath) || statSync(filePath).size < 8) return false;
  const descriptor = openSync(filePath, 'r');
  try {
    const size = statSync(filePath).size;
    const header = Buffer.alloc(5);
    readSync(descriptor, header, 0, header.length, 0);
    if (header.toString('ascii') !== '%PDF-') return false;
    const tailLength = Math.min(size, 4096);
    const tail = Buffer.alloc(tailLength);
    readSync(descriptor, tail, 0, tailLength, size - tailLength);
    return tail.toString('latin1').includes('%%EOF');
  } finally {
    closeSync(descriptor);
  }
}

function groupMembers(pid) {
  // Inspection is read-only, bounded, and deliberately excludes command lines
  // and environment. Never send another signal after the child has exited.
  const result = spawnSync('/bin/ps', ['-axo', 'pid=,pgid='], {
    encoding: 'utf8', timeout: 1000, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024,
  });
  if (result.error || result.status !== 0) throw new Error('process-group inspection failed');
  const members = [];
  for (const line of result.stdout.split('\n')) {
    if (!line.trim()) continue;
    const match = line.match(/^\s*(\d+)\s+(\d+)\s*$/);
    if (!match) throw new Error('process-group inspection was malformed');
    if (Number(match[2]) === pid) members.push(Number(match[1]));
  }
  return members;
}

const hostProcessApi = {
  spawn,
  kill: (pid, signal) => process.kill(pid, signal),
  groupMembers,
  signals: process,
};

function bounded(value, maximum, name) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new Error(`invalid ${name}`);
  return value;
}

// Injectable process operations keep lifecycle/error tests deterministic. The
// production adapter uses only the actual ChildProcess and host observations.
export function superviseBrowser(executable, args, {
  processApi = hostProcessApi, timeoutMs = 30000, closeTimeoutMs = 1500, maxOutputBytes = 1024 * 1024,
} = {}) {
  bounded(timeoutMs, 60000, 'browser deadline');
  bounded(closeTimeoutMs, 5000, 'browser close deadline');
  bounded(maxOutputBytes, 8 * 1024 * 1024, 'browser output limit');
  return new Promise((resolveResult) => {
    let child, exited = false, closed = false, finished = false, stopping = false;
    let status = null, signal = null, timedOut = false, outputBytes = 0, stderr = '', stdout = '';
    let error = null, cleanupError = null, deadline, closeDeadline, cleanupPoll, closeDueAt;
    const signalHandlers = new Map();

    function finish(deadlineExpired = false) {
      if (finished) return;
      let cleanupVerified = false;
      if (!child?.pid) cleanupVerified = true;
      else if (closed && !cleanupError) {
        try {
          const members = processApi.groupMembers(child.pid);
          if (!deadlineExpired && Array.isArray(members) && members.length > 0 && performance.now() < closeDueAt) {
            cleanupPoll = setTimeout(finish, Math.min(25, closeDueAt - performance.now()));
            return;
          }
          if (!Array.isArray(members) || members.length !== 0) {
            cleanupError = new Error('browser process group still has members after exit');
          } else cleanupVerified = true;
        } catch {
          cleanupError = new Error('browser process-group cleanup could not be verified');
        }
      }
      if (!cleanupVerified && !cleanupError) cleanupError = new Error('browser close/cleanup deadline exceeded');
      finished = true;
      clearTimeout(deadline);
      clearTimeout(closeDeadline);
      clearTimeout(cleanupPoll);
      for (const [name, handler] of signalHandlers) processApi.signals.removeListener(name, handler);
      // Unverified ownership is reported, not repaired by signalling a reaped
      // PID. Releasing our streams keeps that failure path bounded.
      child?.stdin?.destroy();
      child?.stdout?.destroy();
      child?.stderr?.destroy();
      child?.unref();
      resolveResult({status, signal, timedOut, stdout, stderr, cleanupVerified, error: cleanupError || error});
    }

    function boundClose() {
      if (!closeDeadline) {
        closeDueAt = performance.now() + closeTimeoutMs;
        closeDeadline = setTimeout(() => finish(true), closeTimeoutMs);
      }
    }

    function stop(reason) {
      if (finished) return;
      if (reason !== 'timeout' && !error) error = new Error(reason);
      if (stopping) return;
      stopping = true;
      if (reason === 'timeout') timedOut = true;
      clearTimeout(deadline);
      // Both the observed exit event and ChildProcess state guard the signal.
      // No process-group signal is ever issued by finish(), exit, or close.
      if (child?.pid > 1 && !exited && child.exitCode === null && child.signalCode === null) {
        try { processApi.kill(-child.pid, 'SIGKILL'); }
        catch (cause) {
          if (cause.code !== 'ESRCH') cleanupError = new Error(`browser process-group cleanup failed: ${cause.code || 'UNKNOWN'}`);
        }
      }
      if (closed) finish(); else boundClose();
    }

    try {
      child = processApi.spawn(executable, args, {detached: true, shell: false, stdio: ['ignore', 'pipe', 'pipe']});
    } catch (cause) {
      error = new Error(`browser launch failed: ${cause.message}`);
      finish();
      return;
    }
    for (const name of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
      const handler = () => stop(`browser rendering interrupted: ${name}`);
      signalHandlers.set(name, handler);
      processApi.signals.on(name, handler);
    }
    deadline = setTimeout(() => stop('timeout'), timeoutMs);
    function capture(chunk, stream) {
      if (finished) return;
      outputBytes += Buffer.byteLength(chunk);
      if (outputBytes > maxOutputBytes) { stop('browser output limit exceeded'); return; }
      if (stream === 'stderr') stderr = `${stderr}${chunk}`.slice(-1000);
      else stdout = `${stdout}${chunk}`.slice(-1000);
    }
    child.stdout.on('data', (chunk) => capture(chunk, 'stdout'));
    child.stderr.on('data', (chunk) => capture(chunk, 'stderr'));
    child.on('error', (cause) => {
      if (!child.pid) {
        error = new Error(`browser launch failed: ${cause.message}`);
        finish();
      } else stop(`browser process failed: ${cause.message}`);
    });
    child.on('exit', (code, exitSignal) => {
      exited = true;
      status = code;
      signal = exitSignal;
      clearTimeout(deadline);
      if (!closed) boundClose();
    });
    child.on('close', (code, exitSignal) => {
      closed = true;
      status = code;
      signal = exitSignal;
      boundClose();
      finish();
    });
  });
}

export async function renderPdf({ input, output, browser, force = false }, executionOptions = {}) {
  if (!input || !output) throw new Error('--input and --output are required');
  if (!['darwin', 'linux'].includes(process.platform)) throw new Error('verified browser cleanup requires macOS or Linux');
  const inputPath = resolve(input);
  const outputPath = resolve(output);
  if (!existsSync(inputPath)) throw new Error(`input not found: ${inputPath}`);
  if (existsSync(outputPath) && !force) throw new Error(`output exists; pass --force to replace: ${outputPath}`);
  const executable = resolveBrowser(browser);
  const profileDir = mkdtempSync(join(tmpdir(), 'markdown-publisher-'));
  let completed = false;
  try {
    if (existsSync(outputPath)) unlinkSync(outputPath);
    const result = await superviseBrowser(executable, [
      '--headless=new', '--allow-file-access-from-files', '--disable-background-networking',
      '--disable-default-apps', '--disable-extensions', '--disable-gpu', '--disable-sync', '--hide-scrollbars',
      '--no-first-run', '--no-default-browser-check', '--noerrdialogs', '--run-all-compositor-stages-before-draw',
      '--virtual-time-budget=2500', `--user-data-dir=${profileDir}`, '--no-pdf-header-footer',
      `--print-to-pdf=${outputPath}`, pathToFileURL(inputPath).href,
    ], executionOptions);
    if (result.error) throw result.error;
    if (!result.cleanupVerified) throw new Error('browser cleanup was not verified');
    if (result.timedOut && !hasCompletePdf(outputPath)) throw new Error('browser timed out before producing a complete PDF');
    if ((result.status !== null && result.status !== 0)
        || (result.status === null && (!result.timedOut || result.signal !== 'SIGKILL'))) {
      const detail = (result.stderr || result.stdout || '').trim();
      throw new Error(`browser exited ${result.status}${detail ? `: ${detail}` : ''}`);
    }
    if (!hasCompletePdf(outputPath)) throw new Error('renderer did not produce a complete PDF envelope');
    completed = true;
    return {output: outputPath, browser: executable,
      exitMode: result.timedOut ? 'bounded-termination-after-complete-pdf' : 'normal'};
  } catch (error) {
    error.profileDir = profileDir;
    error.message = `${error.message}; profile preserved: ${profileDir}`;
    throw error;
  } finally {
    if (completed) rmSync(profileDir, {recursive: true, force: true});
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.preflight) process.stdout.write(`${resolveBrowser(args.browser)}\n`);
    else process.stdout.write(`${(await renderPdf(args)).output}\n`);
  } catch (error) {
    process.stderr.write(`markdown-publisher: ${error.message}\n`);
    process.exitCode = 1;
  }
}
