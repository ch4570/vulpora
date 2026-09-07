#!/usr/bin/env node
'use strict';

// Explicit local runner boundary. No model is selected or called automatically.
// Deadlines/output limits are enforced; provider token/USD limits require a broker.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { regularFile, hash, canonical } = require('./eval-evidence.js');

async function run(spec) {
  const invalid = () => { throw new Error('INVALID_RUN_SPEC'); };
  if (!spec || Object.keys(spec).sort().join(',') !== 'args,cwd,executable,files,maxOutputBytes,passEnv,sha256,timeoutMs') invalid();
  if (!path.isAbsolute(spec.executable) || !path.isAbsolute(spec.cwd)
      || !Array.isArray(spec.args) || spec.args.length > 128
      || spec.args.some(a => typeof a !== 'string' || a.length > 4096 || a.includes('\0'))
      || !Number.isInteger(spec.timeoutMs) || spec.timeoutMs < 1 || spec.timeoutMs > 3600000
      || !Number.isInteger(spec.maxOutputBytes) || spec.maxOutputBytes < 1 || spec.maxOutputBytes > 16777216
      || !Array.isArray(spec.files) || spec.files.length > 128
      || !Array.isArray(spec.passEnv) || spec.passEnv.length > 64
      || spec.passEnv.some(k => typeof k !== 'string' || !/^[A-Z][A-Z0-9_]*$/.test(k))) invalid();
  if (fs.realpathSync(spec.cwd) !== spec.cwd || fs.lstatSync(spec.cwd).isSymbolicLink()
      || !fs.statSync(spec.cwd).isDirectory()) invalid();
  const pinned = [{ path: spec.executable, sha256: spec.sha256 }, ...spec.files];
  const validateFiles = () => {
    for (const file of pinned) {
      if (!file || Object.keys(file).sort().join(',') !== 'path,sha256'
          || !path.isAbsolute(file.path) || !/^[a-f0-9]{64}$/.test(file.sha256)) invalid();
      if (hash(regularFile(file.path, 256 * 1024 * 1024)) !== file.sha256) throw new Error('RUNNER_DIGEST_MISMATCH');
    }
  };
  validateFiles();
  // NODE_OPTIONS and other execution injection variables are never inherited
  // accidentally. Operators must explicitly select environment inputs.
  const env = { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' };
  for (const key of spec.passEnv) if (process.env[key] !== undefined) env[key] = process.env[key];
  const started = performance.now();
  const outputHash = crypto.createHash('sha256');
  let outputBytes = 0, reason = null, child, deadline, hardStop, drainDeadline, cleanupDeadline;
  let observedExit = false, observedClose = false, completed = false, complete, cleanupFailure;
  const stopGroup = signal => {
    // The leader's PGID can be reused after reaping. Never signal it after
    // observed exit, including the interval before the exit event is delivered.
    if (!Number.isSafeInteger(child?.pid) || child.pid <= 1 || observedExit || observedClose
        || child.exitCode !== null || child.signalCode !== null) return;
    try { process.kill(-child.pid, signal); } catch (error) {
      if (error.code !== 'ESRCH') {
        reason ||= 'CLEANUP_FAILED';
        cleanupFailure ||= { code: error.code || 'SIGNAL_FAILED', signal };
      }
    }
  };
  const abandonCleanup = () => {
    if (completed) return;
    reason ||= 'CLEANUP_UNVERIFIED';
    cleanupFailure ||= { code: 'CLEANUP_UNVERIFIED', signal: null };
    // Closing our handles bounds this runner, not the descendant lifetime.
    // In particular, an EPERM child may still be alive after we return.
    child.stdout.destroy(); child.stderr.destroy(); child.unref();
    complete({ code: child.exitCode, signal: child.signalCode });
  };
  const stop = code => {
    if (completed) return;
    reason ||= code; stopGroup('SIGTERM');
    if (!hardStop) hardStop = setTimeout(() => stopGroup('SIGKILL'), 100);
    if (!cleanupDeadline) cleanupDeadline = setTimeout(abandonCleanup, 600);
  };
  const cancel = () => stop('CANCELLED');
  process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
  try {
    const completion = await new Promise(resolve => {
      complete = value => { if (!completed) { completed = true; resolve(value); } };
      child = spawn(spec.executable, spec.args, { cwd: spec.cwd, env, shell: false,
        detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
      const consume = data => {
        if (completed) return;
        outputBytes += data.length;
        outputHash.update(data);
        if (outputBytes > spec.maxOutputBytes) stop('OUTPUT_BUDGET_EXCEEDED');
      };
      child.stdout.on('data', consume); child.stderr.on('data', consume);
      child.once('error', () => { reason ||= 'RUNNER_START_FAILED'; });
      child.once('exit', () => {
        observedExit = true;
        if (completed) return;
        clearTimeout(deadline); clearTimeout(hardStop); clearTimeout(cleanupDeadline);
        // A descendant that starts a new process group can keep pipes open.
        // Bound the drain and report incomplete cleanup rather than hanging.
        drainDeadline = setTimeout(abandonCleanup, 500);
      });
      child.once('close', (code, signal) => { observedClose = true; complete({ code, signal }); });
      deadline = setTimeout(() => stop('TIME_BUDGET_EXCEEDED'), spec.timeoutMs);
    });
    if (completion.code !== 0 || completion.signal) reason ||= 'RUNNER_FAILED';
    try { validateFiles(); } catch { reason ||= 'RUNNER_CHANGED'; }
    // A child can escape a POSIX process group. Without an external enforced
    // job boundary, even an exit-zero leader cannot establish complete cleanup.
    return { schema: 'vulpora.budgeted-run/v1', outcome: 'INCONCLUSIVE',
      execution: reason ? 'FAIL' : 'EXIT_ZERO', reason: reason || 'OPERATIONAL_BOUNDARY_UNVERIFIED',
      isolationEnforced: false, cleanupEnforced: false,
      ...(cleanupFailure ? { cleanupFailure } : {}),
      runnerSha256: spec.sha256, invocationSha256: hash(canonical(spec)),
      exitCode: completion.code, elapsedSeconds: (performance.now() - started) / 1000,
      outputBytes, outputSha256: outputHash.digest('hex'), outputScope: 'observed-stream', rawOutputRetained: false,
      tokens: 'unmeasured', costUsd: 'unmeasured', promotion: 'BLOCKED' };
  } finally {
    clearTimeout(deadline); clearTimeout(hardStop); clearTimeout(drainDeadline); clearTimeout(cleanupDeadline);
    // Completed paths already stopped or bounded cleanup before assembling
    // their result. Only an exceptional, unfinished path needs a final signal.
    if (!completed) stopGroup('SIGKILL');
    process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel);
  }
}
if (require.main === module) {
  (async () => {
    try {
      if (process.argv.length !== 3) throw new Error('INVALID_RUN_SPEC');
      const spec = JSON.parse(regularFile(process.argv[2], 65536).toString('utf8'));
      const result = await run(spec); process.stdout.write(JSON.stringify(result) + '\n');
      process.exitCode = result.outcome === 'PASS' ? 0 : 3;
    } catch {
      process.stderr.write('{"outcome":"INCONCLUSIVE","reason":"INVALID_OR_CHANGED_RUNNER","promotion":"BLOCKED"}\n');
      process.exitCode = 3;
    }
  })();
}
module.exports = { run };
