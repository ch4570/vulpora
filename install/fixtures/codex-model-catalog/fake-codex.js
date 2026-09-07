#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const {spawn} = require('node:child_process');
const mode = process.env.VULPORA_CATALOG_TEST_MODE || 'valid';
const log = process.env.VULPORA_CATALOG_TEST_LOG;
const releaseFile = process.env.VULPORA_CATALOG_TEST_RELEASE;
if (process.argv[2] === '--catalog-test-child') {
  process.on('SIGTERM', () => {});
  setInterval(() => { if (fs.existsSync(releaseFile)) process.exit(0); }, 10);
  process.send('ready');
  return;
}
function record(value) { fs.appendFileSync(log, `${JSON.stringify(value)}\n`); }
record({pid: process.pid, argv: process.argv.slice(2)});
if (process.argv.length !== 3 || process.argv[2] !== 'app-server') process.exit(90);
if (mode === 'ignore-term') {
  process.on('SIGTERM', () => {});
  setInterval(() => {}, 1000);
}
if (mode === 'denied-kill') {
  setInterval(() => { if (fs.existsSync(releaseFile)) process.exit(0); }, 10);
}
if (mode === 'descendant') {
  const descendant = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {stdio: 'ignore'});
  record({descendant: descendant.pid});
  process.on('SIGTERM', () => descendant.on('exit', () => process.exit(0)));
}
const reply = (id, result) => process.stdout.write(`${JSON.stringify({id, result})}\n`);
const visible = (id, efforts = ['medium', 'low']) => ({
  id: `picker-${id}`, model: id, hidden: false,
  supportedReasoningEfforts: efforts.map((reasoningEffort) => ({reasoningEffort})),
});
let initialized = false, page = 0;
function startProtocol() {
require('node:readline').createInterface({input: process.stdin}).on('line', (line) => {
  const request = JSON.parse(line);
  record(request);
  if (!['initialize', 'initialized', 'model/list'].includes(request.method)) process.exit(91);
  if (request.method === 'initialize') {
    if (mode === 'timeout' || mode === 'ignore-term') return;
    reply(request.id, {userAgent: 'fixture'});
    return;
  }
  if (request.method === 'initialized') { initialized = true; return; }
  if (!initialized || request.params.includeHidden !== false || request.params.limit !== 100) process.exit(92);
  page += 1;
  if (mode === 'after-initialize-timeout') return;
  if (mode === 'stdout-limit') { process.stdout.write('x'.repeat(100000)); return; }
  if (mode === 'stderr-limit') { process.stderr.write('PRIVATE_SERVER_ERROR'.repeat(10000)); return; }
  if (mode === 'malformed-json') { process.stdout.write('{invalid}\n'); return; }
  if (mode === 'rpc-error') {
    process.stdout.write(`${JSON.stringify({id: request.id, error: {message: 'PRIVATE_SERVER_ERROR'}})}\n`);
    return;
  }
  if (mode === 'server-request') {
    process.stdout.write(`${JSON.stringify({id: 99, method: 'account/chatgptAuthTokens/refresh'})}\n`);
    return;
  }
  if (mode === 'wrong-response-id') { reply(request.id + 100, {}); return; }
  if (mode === 'early-exit') { process.exit(0); }
  if (mode === 'orphan') { process.exit(0); }
  if (mode === 'missing-cursor') { reply(request.id, {data: [visible('model-a')]}); return; }
  if (mode === 'looping-cursor') { reply(request.id, {data: [], nextCursor: 'same-page'}); return; }
  if (mode === 'page-limit') { reply(request.id, {data: [], nextCursor: `page-${page}`}); return; }
  if (mode === 'invalid-effort') { reply(request.id, {data: [visible('model-a', ['low\nprivate'])], nextCursor: null}); return; }
  if (mode === 'missing-efforts') { reply(request.id, {data: [{id: 'model-a'}], nextCursor: null}); return; }
  if (mode === 'duplicate-effort') { reply(request.id, {data: [visible('model-a', ['low', 'low'])], nextCursor: null}); return; }
  if (mode === 'duplicate-model') { reply(request.id, {data: [visible('model-a'), visible('model-a')], nextCursor: null}); return; }
  if (mode === 'only-hidden') { reply(request.id, {data: [{hidden: true}], nextCursor: null}); return; }
  if (mode === 'empty') { reply(request.id, {data: [], nextCursor: null}); return; }
  if (mode === 'no-reasoning') { reply(request.id, {data: [visible('model-a', [])], nextCursor: null}); return; }
  if (page === 1) {
    if (Object.hasOwn(request.params, 'cursor')) process.exit(93);
    reply(request.id, {data: [visible('model-b'), {hidden: true}], nextCursor: 'page-two'});
  } else {
    if (page !== 2 || request.params.cursor !== 'page-two') process.exit(94);
    reply(request.id, {data: [visible('model-a', ['high'])], nextCursor: null});
  }
});
}
if (mode === 'orphan' || mode === 'orphan-valid') {
  const descendant = spawn(process.execPath, [__filename, '--catalog-test-child'], {
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'], env: process.env,
  });
  record({descendant: descendant.pid});
  // Wait until the child has installed its TERM handler. It is deliberately
  // orphaned and must be released by the test's private control file, not by
  // production signals after the primary is reaped.
  descendant.once('message', startProtocol);
} else startProtocol();
