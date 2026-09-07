#!/usr/bin/env bash
set -eu
set -f

DIR="$(cd "$(dirname "$0")" && pwd -P)"
node - "$DIR" <<'NODE'
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const {spawn, spawnSync} = require('node:child_process');
const {setTimeout: delay} = require('node:timers/promises');
const dir = process.argv[2];
const collector = path.join(dir, 'codex-model-catalog.js');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'vulpora-model-catalog-'));
const fake = path.join(work, 'fake codex');
fs.copyFileSync(path.join(dir, 'fixtures/codex-model-catalog/fake-codex.js'), fake);
fs.chmodSync(fake, 0o700);
let checks = 0;
const releaseFiles = [];
const controlledPids = new Set();
function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; }
}
function run(mode, expectedError = null, extraArgs = []) {
  const log = path.join(work, `${mode}.jsonl`);
  const result = spawnSync(process.execPath,
    [collector, '--codex-bin', fake, '--timeout-ms', '1200', '--max-output-bytes', '16384', ...extraArgs], {
      cwd: work,
      env: {...process.env, VULPORA_CATALOG_TEST_MODE: mode, VULPORA_CATALOG_TEST_LOG: log},
      encoding: 'utf8', timeout: 5000, maxBuffer: 128 * 1024,
    });
  assert.equal(result.error, undefined, `${mode}: subprocess must terminate within test deadline`);
  const messages = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse) : [];
  assert(messages.length > 0, `${mode}: fake CLI executed`);
  assert.deepEqual(messages[0].argv, ['app-server']);
  assert(messages.filter((entry) => entry.method).every((entry) =>
    ['initialize', 'initialized', 'model/list'].includes(entry.method)), 'no model turn/auth/config RPC');
  for (const entry of messages) {
    if (entry.pid) assert.equal(alive(entry.pid), false, `${mode}: app-server cleaned up`);
    if (entry.descendant) assert.equal(alive(entry.descendant), false, `${mode}: owned descendant cleaned up`);
  }
  assert(!result.stderr.includes('PRIVATE_SERVER_ERROR'), 'server stderr/error details are never exposed');
  if (expectedError) {
    assert.equal(result.status, 1, `${mode}: ${result.stdout} ${result.stderr}`);
    assert.equal(result.stdout, '', `${mode}: no partial catalog on failure`);
    assert.equal(result.stderr.trim(), `CODEX_MODEL_CATALOG_ERROR:${expectedError}`);
  } else {
    assert.equal(result.status, 0, `${mode}: ${result.stderr}`);
    assert.equal(result.stderr, '');
    const catalog = JSON.parse(result.stdout);
    assert.equal(catalog.schema, 'vulpora.runtime-model-catalog/v1');
    assert.equal(catalog.runtime, 'codex');
    assert.equal(catalog.source, 'codex-app-server:model/list');
    assert.equal(new Date(catalog.observedAt).toISOString(), catalog.observedAt);
    if (mode === 'no-reasoning') assert.deepEqual(catalog.models, [{id: 'model-a', reasoningEfforts: []}]);
    else {
      assert.deepEqual(catalog.models, [
        {id: 'model-a', reasoningEfforts: ['high']},
        {id: 'model-b', reasoningEfforts: ['low', 'medium']},
      ]);
      assert.equal(messages.filter((entry) => entry.method === 'model/list').length, 2);
    }
  }
  checks += 1;
}
async function controlledCleanupFailure(mode) {
  const log = path.join(work, `${mode}.jsonl`);
  const release = path.join(work, `${mode}.release`);
  releaseFiles.push(release);
  const env = {...process.env, VULPORA_CATALOG_TEST_MODE:mode,
    VULPORA_CATALOG_TEST_LOG:log, VULPORA_CATALOG_TEST_RELEASE:release};
  let messages = [];
  try {
    const injected = `
      const {spawn}=require('node:child_process');
      const {collectCodexModelCatalog}=require(process.argv[1]);
      collectCodexModelCatalog({codexBin:process.argv[2], timeoutMs:1200,
        processApi:{spawn,signals:process,groupMembers:()=>[],
          kill(){throw Object.assign(new Error('denied'),{code:'EPERM'});}}})
        .then(()=>{process.stdout.write('UNEXPECTED_PASS\\n');process.exitCode=2;},
          error=>{process.stderr.write('CODEX_MODEL_CATALOG_ERROR:'+error.code+'\\n');process.exitCode=1;});`;
    const args = mode === 'denied-kill' ? ['-e', injected, collector, fake]
      : [collector, '--codex-bin', fake, '--timeout-ms', '1200'];
    const result = spawnSync(process.execPath, args, {
      cwd:work, env, encoding:'utf8', timeout:4000, maxBuffer:128*1024,
    });
    assert.equal(result.error, undefined, `${mode}: denied cleanup must not keep the caller alive`);
    assert.equal(result.status, 1, `${mode}: no success when ownership/cleanup cannot be proved`);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr.trim(), 'CODEX_MODEL_CATALOG_ERROR:CLEANUP_UNVERIFIED');
    messages = fs.readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse);
    assert(messages.filter(entry => entry.method).every(entry => ['initialize','initialized','model/list'].includes(entry.method)));
    const remaining = messages.flatMap(entry => [entry.pid, entry.descendant]).filter(Boolean).filter(alive);
    assert(remaining.length > 0, `${mode}: fixture must genuinely exercise surviving owned processes`);
    if (mode !== 'denied-kill') assert.equal(alive(messages[0].pid), false, 'primary has been reaped');
    // The test owns this private release capability. Production must not repair
    // an orphan by signalling its reaped parent's numeric process-group ID.
    checks += 1;
  } finally {
    fs.writeFileSync(release, 'release synthetic fixture\n');
    if (!messages.length && fs.existsSync(log)) messages = fs.readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse);
    const pids = messages.flatMap(entry => [entry.pid, entry.descendant]).filter(Boolean);
    for (const pid of pids) controlledPids.add(pid);
    for (let attempt = 0; attempt < 120 && pids.some(alive); attempt += 1) await delay(25);
    assert(pids.every(pid => !alive(pid)), `${mode}: test-owned release must clean synthetic survivors`);
  }
}
async function main() {
try {
  run('valid');
  run('descendant');
  run('no-reasoning');
  for (const [mode, error] of [
    ['timeout', 'DEADLINE_EXCEEDED'], ['ignore-term', 'DEADLINE_EXCEEDED'],
    ['after-initialize-timeout', 'DEADLINE_EXCEEDED'],
    ['stdout-limit', 'OUTPUT_LIMIT_EXCEEDED'], ['stderr-limit', 'OUTPUT_LIMIT_EXCEEDED'],
    ['malformed-json', 'INVALID_RPC_JSON'], ['rpc-error', 'RPC_REJECTED'],
    ['server-request', 'UNEXPECTED_SERVER_REQUEST'], ['wrong-response-id', 'UNEXPECTED_RPC_RESPONSE'],
    ['early-exit', 'INCOMPLETE_MODEL_CATALOG'], ['missing-cursor', 'INVALID_MODEL_PAGE'],
    ['looping-cursor', 'REPEATED_PAGE_CURSOR'], ['page-limit', 'PAGE_COUNT_LIMIT'],
    ['invalid-effort', 'INVALID_REASONING_EFFORT'], ['missing-efforts', 'INVALID_MODEL_ENTRY'],
    ['duplicate-effort', 'DUPLICATE_MODEL_OR_EFFORT'], ['duplicate-model', 'DUPLICATE_MODEL_OR_EFFORT'],
    ['only-hidden', 'NO_VISIBLE_MODELS'], ['empty', 'NO_VISIBLE_MODELS'],
  ]) run(mode, error);
  for (const args of [
    ['--unknown'], ['--timeout-ms', 'NaN'], ['--timeout-ms', '0'], ['--timeout-ms', '9007199254740993'],
    ['--timeout-ms', '500', '--timeout-ms', '500'], ['--max-output-bytes', '0'],
    ['--codex-bin', path.join(work, 'does-not-exist')],
  ]) {
    const result = spawnSync(process.execPath, [collector, ...args], {encoding: 'utf8', timeout: 3000});
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    checks += 1;
  }
  const installedCollector = require(path.join(dir, '../skills/start-task/scripts/codex-model-catalog.js'));
  assert.equal(require(collector).collectCodexModelCatalog, installedCollector.collectCodexModelCatalog);
  assert.equal(typeof installedCollector.main, 'function');
  checks += await require(path.join(dir, 'fixtures/codex-model-catalog/lifecycle-contract.js'))(installedCollector.collectCodexModelCatalog);
  await controlledCleanupFailure('orphan');
  await controlledCleanupFailure('orphan-valid');
  await controlledCleanupFailure('denied-kill');
  const moduleLog = path.join(work, 'module.jsonl');
  const moduleCatalog = await installedCollector.collectCodexModelCatalog({
    codexBin: fake, timeoutMs: 1200, cwd: work,
    env: {...process.env, VULPORA_CATALOG_TEST_MODE: 'valid', VULPORA_CATALOG_TEST_LOG: moduleLog},
  });
  assert.equal(moduleCatalog.models.length, 2);
  const modulePid = JSON.parse(fs.readFileSync(moduleLog, 'utf8').split('\n')[0]).pid;
  assert.equal(alive(modulePid), false, 'module API also waits for cleanup');
  checks += 1;

  const interruptLog = path.join(work, 'interrupt.jsonl');
  const interrupted = spawn(process.execPath, [collector, '--codex-bin', fake, '--timeout-ms', '3000'], {
    cwd: work, env: {...process.env, VULPORA_CATALOG_TEST_MODE: 'after-initialize-timeout',
      VULPORA_CATALOG_TEST_LOG: interruptLog}, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let interruptOut = '', interruptError = '';
  interrupted.stdout.on('data', (chunk) => { interruptOut += chunk; });
  interrupted.stderr.on('data', (chunk) => { interruptError += chunk; });
  const interruptExit = new Promise((resolve, reject) => {
    interrupted.on('error', reject);
    interrupted.on('close', (code, signal) => resolve({code, signal}));
  });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (fs.existsSync(interruptLog) && fs.readFileSync(interruptLog, 'utf8').includes('model/list')) break;
    await delay(25);
  }
  interrupted.kill('SIGTERM');
  assert.deepEqual(await interruptExit, {code: 1, signal: null});
  assert.equal(interruptOut, '');
  assert.equal(interruptError.trim(), 'CODEX_MODEL_CATALOG_ERROR:INTERRUPTED');
  const interruptedPid = JSON.parse(fs.readFileSync(interruptLog, 'utf8').split('\n')[0]).pid;
  assert.equal(alive(interruptedPid), false, 'caller interruption stops the app-server');
  checks += 1;
  process.stdout.write(`${JSON.stringify({semantic_ac_key: 'codex_model_catalog_discovery', outcome: 'pass', checks,
    model_turns: 0, pagination_complete: true, hidden_filtered: true, output_bounded: true, cleanup_verified: true})}\n`);
} finally {
  for (const release of releaseFiles) if (fs.existsSync(path.dirname(release))) fs.writeFileSync(release, 'release synthetic fixture\n');
  if ([...controlledPids].some(alive)) {
    // Keep the release capability available even if a fixture is slow to exit.
    process.stderr.write(`synthetic cleanup pending; test fixtures preserved: ${work}\n`);
  } else fs.rmSync(work, {recursive: true, force: true});
}
}
main().catch((error) => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
NODE
