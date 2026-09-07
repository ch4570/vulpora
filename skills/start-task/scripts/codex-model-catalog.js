#!/usr/bin/env node
'use strict';

// Read-only discovery: never create a thread/turn, log in, or read credential files.
// Protocol: https://learn.chatgpt.com/docs/app-server#models
const {spawn, spawnSync} = require('node:child_process');
const {StringDecoder} = require('node:string_decoder');

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024;
const MAX_PAGES = 100;
const MAX_MODELS = 10000;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,199}$/;
const EFFORT = /^[a-z][a-z0-9_-]{0,31}$/;
const TERMINATION_GRACE_MS = 150;
const CLEANUP_TIMEOUT_MS = 900;

function groupMembers(pid) {
  // Once the primary is reaped, its numeric PID is not signal authority. Inspect
  // only PID/PGID metadata; never expose command lines, environment, or ps output.
  const result = spawnSync('/bin/ps', ['-axo', 'pid=,pgid='], {
    encoding: 'utf8', timeout: 1000, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024,
  });
  if (result.error || result.status !== 0) throw catalogError('CLEANUP_UNVERIFIED');
  const members = [];
  for (const line of result.stdout.split('\n')) {
    if (!line.trim()) continue;
    const match = line.match(/^\s*(\d+)\s+(\d+)\s*$/);
    if (!match) throw catalogError('CLEANUP_UNVERIFIED');
    if (Number(match[2]) === pid) members.push(Number(match[1]));
  }
  return members;
}

const hostProcessApi = {
  spawn, groupMembers, signals: process,
  kill: (pid, signal) => process.kill(pid, signal),
};

function catalogError(code) {
  return Object.assign(new Error(code), {code});
}

function boundedInteger(value, minimum, maximum, name) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw catalogError(`INVALID_${name}`);
  }
  return value;
}

function normalizePage(result, models) {
  if (!result || typeof result !== 'object' || Array.isArray(result)
    || !Array.isArray(result.data) || !Object.hasOwn(result, 'nextCursor')
    || (result.nextCursor !== null && (typeof result.nextCursor !== 'string'
      || result.nextCursor.length === 0 || result.nextCursor.length > 4096))) {
    throw catalogError('INVALID_MODEL_PAGE');
  }
  for (const entry of result.data) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)
      || (entry.hidden !== undefined && typeof entry.hidden !== 'boolean')) {
      throw catalogError('INVALID_MODEL_ENTRY');
    }
    if (entry.hidden === true) continue;
    // `model` is the dispatch identifier; `id` may be a separate picker identity.
    const id = entry.model ?? entry.id;
    if (typeof id !== 'string' || !IDENTIFIER.test(id)
      || !Array.isArray(entry.supportedReasoningEfforts)) {
      throw catalogError('INVALID_MODEL_ENTRY');
    }
    const efforts = entry.supportedReasoningEfforts.map((option) => {
      const effort = option?.reasoningEffort;
      if (typeof effort !== 'string' || !EFFORT.test(effort)) {
        throw catalogError('INVALID_REASONING_EFFORT');
      }
      return effort;
    });
    if (new Set(efforts).size !== efforts.length || models.has(id)) {
      throw catalogError('DUPLICATE_MODEL_OR_EFFORT');
    }
    models.set(id, {id, reasoningEfforts: efforts.sort()});
    if (models.size > MAX_MODELS) throw catalogError('MODEL_COUNT_LIMIT');
  }
  return result.nextCursor;
}

async function collectCodexModelCatalog(options = {}) {
  const codexBin = options.codexBin ?? 'codex';
  if (typeof codexBin !== 'string' || !codexBin || /[\0\r\n]/.test(codexBin)) {
    throw catalogError('INVALID_CODEX_BIN');
  }
  const timeoutMs = boundedInteger(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, 50, 60000, 'TIMEOUT');
  const maxOutputBytes = boundedInteger(options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES,
    1024, 16 * 1024 * 1024, 'OUTPUT_LIMIT');
  if (process.platform === 'win32') throw catalogError('UNSUPPORTED_PROCESS_CLEANUP');
  // Programmatic injection is for deterministic lifecycle tests; CLI callers
  // always use the actual ChildProcess and read-only host group observations.
  const processApi = options.processApi ?? hostProcessApi;

  return new Promise((resolve, reject) => {
    let child;
    try {
      child = processApi.spawn(codexBin, ['app-server'], {
        cwd: options.cwd,
        env: options.env ?? process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
        detached: true,
      });
    } catch {
      reject(catalogError('SPAWN_FAILED'));
      return;
    }
    const models = new Map(), cursors = new Set(), decoder = new StringDecoder('utf8');
    let outputBytes = 0, buffer = '', nextId = 1, expectedId = 1;
    let phase = 'initialize', pageCount = 0, finished = false, closed = false, exited = false, settled = false;
    let pendingError = null, pendingCatalog = null, killTimer, cleanupTimer, cleanupPoll;

    function validPid() { return Number.isSafeInteger(child.pid) && child.pid > 1; }

    function signalOwnedGroup(signal) {
      // The primary remains our ownership anchor only until reaping. Both the
      // event and ChildProcess state are checked immediately before each signal.
      if (!validPid() || exited || closed || child.exitCode !== null || child.signalCode !== null) return;
      try { processApi.kill(-child.pid, signal); } catch (error) {
        if (error.code !== 'ESRCH') pendingError = catalogError('CLEANUP_FAILED');
      }
    }

    function settle(cleanupVerified) {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      clearTimeout(killTimer);
      clearTimeout(cleanupTimer);
      clearTimeout(cleanupPoll);
      for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) processApi.signals.removeListener(signal, interrupted);
      child.stdin.destroy();
      child.stdout.destroy();
      child.stderr.destroy();
      // A denied kill or an inherited open pipe must not retain the caller's
      // event loop. Releasing our handles is not a claim that the child exited.
      child.unref();
      if (!cleanupVerified) pendingError = catalogError('CLEANUP_UNVERIFIED');
      if (pendingError) reject(pendingError);
      else resolve(pendingCatalog);
    }

    function checkCleanup() {
      if (settled || !finished || !closed) return;
      if (!child.pid) return settle(pendingError?.code === 'SPAWN_FAILED');
      if (!validPid()) return settle(false);
      try {
        const members = processApi.groupMembers(child.pid);
        if (!Array.isArray(members)) return settle(false);
        if (members.length === 0) return settle(true);
      } catch {
        return settle(false);
      }
      // An exited primary cannot authorize signalling leftover descendants.
      // Allow transient reaping to finish, then report unverified cleanup.
      if (!cleanupPoll) cleanupPoll = setTimeout(() => {
        cleanupPoll = null;
        checkCleanup();
      }, 25);
    }

    function finish(error, catalog) {
      if (finished) return;
      finished = true;
      pendingError = error;
      pendingCatalog = catalog;
      clearTimeout(deadline);
      child.stdin.end();
      // The fixed timer always settles, independently of wall-clock changes or
      // subsequent group polls. One bounded ps inspection may extend it by 1s.
      cleanupTimer = setTimeout(() => settle(false), CLEANUP_TIMEOUT_MS);
      killTimer = setTimeout(() => {
        signalOwnedGroup('SIGKILL');
        checkCleanup();
      }, TERMINATION_GRACE_MS);
      signalOwnedGroup('SIGTERM');
      checkCleanup();
    }

    function interrupted() {
      if (settled) return;
      if (finished) pendingError = pendingError || catalogError('INTERRUPTED');
      else finish(catalogError('INTERRUPTED'), null);
    }
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) processApi.signals.on(signal, interrupted);
    const deadline = setTimeout(() => finish(catalogError('DEADLINE_EXCEEDED'), null), timeoutMs);

    function send(message) {
      if (finished) return;
      child.stdin.write(`${JSON.stringify(message)}\n`, (error) => {
        if (error) finish(catalogError('RPC_WRITE_FAILED'), null);
      });
    }

    function requestPage(cursor) {
      pageCount += 1;
      if (pageCount > MAX_PAGES) throw catalogError('PAGE_COUNT_LIMIT');
      expectedId = ++nextId;
      const params = {limit: 100, includeHidden: false};
      if (cursor !== null) params.cursor = cursor;
      send({id: expectedId, method: 'model/list', params});
    }

    function handle(message) {
      if (!message || typeof message !== 'object' || Array.isArray(message)) {
        throw catalogError('INVALID_RPC_MESSAGE');
      }
      // Notifications are harmless metadata; requests for tools/auth are not served.
      if (typeof message.method === 'string') {
        if (Object.hasOwn(message, 'id')) throw catalogError('UNEXPECTED_SERVER_REQUEST');
        return;
      }
      if (message.id !== expectedId || !Object.hasOwn(message, 'result') || message.error) {
        throw catalogError(message.error ? 'RPC_REJECTED' : 'UNEXPECTED_RPC_RESPONSE');
      }
      if (phase === 'initialize') {
        if (!message.result || typeof message.result !== 'object' || Array.isArray(message.result)) {
          throw catalogError('INVALID_INITIALIZE_RESPONSE');
        }
        phase = 'models';
        send({method: 'initialized', params: {}});
        requestPage(null);
        return;
      }
      const cursor = normalizePage(message.result, models);
      if (cursor !== null) {
        if (cursors.has(cursor)) throw catalogError('REPEATED_PAGE_CURSOR');
        cursors.add(cursor);
        requestPage(cursor);
        return;
      }
      if (!models.size) throw catalogError('NO_VISIBLE_MODELS');
      finish(null, {
        schema: 'vulpora.runtime-model-catalog/v1',
        runtime: 'codex',
        source: 'codex-app-server:model/list',
        observedAt: new Date().toISOString(),
        models: [...models.values()].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      });
    }

    function countOutput(chunk) {
      outputBytes += chunk.length;
      if (outputBytes > maxOutputBytes) finish(catalogError('OUTPUT_LIMIT_EXCEEDED'), null);
    }
    child.stdout.on('data', (chunk) => {
      if (finished) return;
      countOutput(chunk);
      if (finished) return;
      buffer += decoder.write(chunk);
      for (;;) {
        const newline = buffer.indexOf('\n');
        if (newline < 0 || finished) break;
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (!line.trim()) continue;
        try { handle(JSON.parse(line)); } catch (error) {
          finish(error.code ? error : catalogError('INVALID_RPC_JSON'), null);
        }
      }
    });
    child.stderr.on('data', (chunk) => { if (!finished) countOutput(chunk); });
    child.stdin.on('error', () => finish(catalogError('RPC_WRITE_FAILED'), null));
    child.stdout.on('error', () => finish(catalogError('RPC_READ_FAILED'), null));
    child.stderr.on('error', () => finish(catalogError('RPC_READ_FAILED'), null));
    child.on('error', () => {
      if (!child.pid) closed = true;
      finish(catalogError('SPAWN_FAILED'), null);
    });
    child.on('exit', () => {
      exited = true;
      clearTimeout(killTimer);
      // stdout may still contain the final page. Only close declares an
      // incomplete protocol; no signal is sent by either exit or close.
    });
    child.on('close', () => {
      closed = true;
      if (!finished) finish(catalogError('INCOMPLETE_MODEL_CATALOG'), null);
      else checkCleanup();
    });
    send({id: expectedId, method: 'initialize', params: {
      clientInfo: {name: 'vulpora-model-catalog', title: 'Vulpora model discovery', version: '1.0.0'},
    }});
  });
}

async function main(argv) {
  if (argv.length === 1 && argv[0] === '--help') {
    process.stdout.write('Usage: codex-model-catalog.js [--codex-bin PATH] [--timeout-ms N] [--max-output-bytes N]\nRead-only model/list discovery; never starts a model turn.\n');
    return;
  }
  const options = {}, names = new Map([
    ['--codex-bin', 'codexBin'], ['--timeout-ms', 'timeoutMs'], ['--max-output-bytes', 'maxOutputBytes'],
  ]);
  for (let index = 0; index < argv.length; index += 2) {
    const key = names.get(argv[index]), value = argv[index + 1];
    if (!key || value === undefined || Object.hasOwn(options, key)) throw catalogError('INVALID_ARGUMENTS');
    if (key !== 'codexBin' && !/^[0-9]+$/.test(value)) throw catalogError('INVALID_ARGUMENTS');
    options[key] = key === 'codexBin' ? value : Number(value);
  }
  process.stdout.write(`${JSON.stringify(await collectCodexModelCatalog(options))}\n`);
}

module.exports = {collectCodexModelCatalog, main};
if (require.main === module) main(process.argv.slice(2)).catch((error) => {
  // Never echo app-server stderr, RPC errors, environment, or credential material.
  process.stderr.write(`CODEX_MODEL_CATALOG_ERROR:${error.code || 'INTERNAL_ERROR'}\n`);
  process.exitCode = 1;
});
