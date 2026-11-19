'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '../../..');
const runner = path.join(__dirname, 'run-codex-app-server.js');
const schema = path.join(root, 'skills/start-task/reference/kb/orchestration-report.schema.json');
const fakeServer = `#!/usr/bin/env node
'use strict';
const fs = require('node:fs'), path = require('node:path');
const mode = process.env.VULPORA_FAKE_SERVER_MODE;
const file = name => path.join(process.cwd(), name);
fs.writeFileSync(file('server.pid'), String(process.pid));
process.on('SIGTERM', () => {
  if (['graceful', 'late-write-error', 'stalled-write'].includes(mode)) setTimeout(() => {
    fs.writeFileSync(file('server-stopped'), 'stopped'); process.exit(0);
  }, 150);
});
setInterval(() => fs.writeFileSync(file('heartbeat'), String(Date.now())), 20);
const send = message => process.stdout.write(JSON.stringify(message) + '\\n');
let input = '';
process.stdin.on('data', chunk => {
  input += chunk;
  for (;;) {
    const newline = input.indexOf('\\n'); if (newline < 0) break;
    const message = JSON.parse(input.slice(0, newline)); input = input.slice(newline + 1);
    if (message.id === 1) send({id: 1, result: {}});
    if (message.id === 90) send({id: 90, result: {type: 'chatgptAuthTokens'}});
    if (message.id === 2) send({id: 2, result: {thread: {id: 'synthetic-thread'}}});
    if (message.id === 3) {
      fs.writeFileSync(file('turn-started'), 'ready');
      if (mode === 'interrupt') continue;
      if (mode === 'protocol-error') { send({id: 3, error: {message: 'synthetic rejection'}}); continue; }
      if (mode !== 'missing-report') send({method: 'item/completed', params: {
        threadId: 'synthetic-thread', item: {type: 'agentMessage', text: '{"synthetic":true}'}}});
      send({method: 'turn/completed', params: {threadId: 'synthetic-thread'}});
      if (mode === 'late-events') send({id: 91, method: 'account/chatgptAuthTokens/refresh', params: {}});
    }
  }
});
`;

async function run(t, mode) {
  const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'vulpora-app-server-lifecycle-')));
  const bin = path.join(work, 'bin'); fs.mkdirSync(bin);
  if (mode !== 'spawn-error') fs.writeFileSync(path.join(bin, 'codex'), fakeServer, {mode: 0o755});
  const prompt = path.join(work, 'prompt.txt'), events = path.join(work, 'events.jsonl');
  const report = path.join(work, 'report.json'), auth = path.join(work, 'auth.json');
  fs.writeFileSync(prompt, '$start-task "synthetic lifecycle fixture"');
  fs.writeFileSync(auth, JSON.stringify({tokens: {access_token: 'synthetic-access-token', account_id: 'synthetic-account-id'}}));
  if (mode === 'existing-report') fs.writeFileSync(report, 'existing report must be preserved');
  const args = [];
  if (mode === 'late-write-error' || mode === 'stalled-write') {
    const preload = path.join(work, 'fail-terminal-write.cjs');
    fs.writeFileSync(preload, `const fs = require('node:fs');
      const create = fs.createWriteStream;
      fs.createWriteStream = function(...args) {
        const stream = create.apply(this, args);
        for (const name of ['_write', '_writev']) {
          const write = stream[name];
          stream[name] = function(...values) {
            const chunks = name === '_writev' ? values[0].map(item => item.chunk) : [values[0]];
            if (chunks.some(chunk => chunk.toString().includes('turn/completed'))) {
              if (process.env.VULPORA_FAKE_SERVER_MODE === 'stalled-write') return;
              const error = Object.assign(new Error('synthetic terminal write failure'), {code: 'EIO'});
              setTimeout(() => values.at(-1)(error), 500);
            } else write.apply(this, values);
          };
        }
        return stream;
      };`);
    args.push('--require', preload);
  }
  args.push(runner, work, prompt, events, report, auth, schema);
  const child = spawn(process.execPath, args, {
    detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: {...process.env, PATH: mode === 'spawn-error' ? bin : bin + path.delimiter + process.env.PATH,
      VULPORA_FAKE_SERVER_MODE: mode}
  });
  const killGroup = () => {
    try { process.kill(-child.pid, 'SIGKILL'); }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
  };
  t.after(async () => { killGroup(); await new Promise(resolve => setTimeout(resolve, 50)); fs.rmSync(work, {recursive: true, force: true}); });
  const result = await new Promise((resolve, reject) => {
    let stdout = '', stderr = '', signalPoll;
    const watchdog = setTimeout(() => { killGroup(); reject(new Error('app server shutdown exceeded the outer deadline')); }, 7000);
    if (mode === 'interrupt') signalPoll = setInterval(() => {
      if (fs.existsSync(path.join(work, 'turn-started'))) { clearInterval(signalPoll); child.kill('SIGTERM'); }
    }, 10);
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => { clearTimeout(watchdog); clearInterval(signalPoll); reject(error); });
    child.on('close', (code, signal) => {
      clearTimeout(watchdog); clearInterval(signalPoll); resolve({code, signal, stdout, stderr});
    });
  });
  if (mode !== 'spawn-error') {
    const pid = Number(fs.readFileSync(path.join(work, 'server.pid'), 'utf8'));
    const state = spawnSync('ps', ['-o', 'stat=', '-p', String(pid)], {encoding: 'utf8'});
    assert.ok(state.status !== 0 || !state.stdout.trim() || /^Z/.test(state.stdout.trim()),
      `adapter returned before server ${pid} stopped (${state.stdout.trim()})`);
  }
  return {...result, work, events, report};
}

test('successful completion waits for graceful runtime shutdown and flushes redacted events', async t => {
  const result = await run(t, 'graceful');
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.signal, null);
  assert.equal(fs.readFileSync(path.join(result.work, 'server-stopped'), 'utf8'), 'stopped');
  assert.deepEqual(JSON.parse(fs.readFileSync(result.report)), {synthetic: true});
  const events = fs.readFileSync(result.events, 'utf8');
  assert.match(events, /turn\/completed/);
  assert.doesNotMatch(events, /synthetic-access-token|synthetic-account-id/);
});

test('successful completion escalates when the runtime ignores TERM', async t => {
  const result = await run(t, 'resistant');
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(result.report)), {synthetic: true});
});

for (const [mode, code, reason] of [
  ['protocol-error', 1, 'turn_start_failed:synthetic rejection'],
  ['missing-report', 65, 'terminal_report_parse_failed'],
  ['interrupt', 130, 'interrupted:SIGTERM']
]) test(`${mode} waits for runtime cleanup before returning failure`, async t => {
  const result = await run(t, mode);
  assert.equal(result.code, code, result.stderr);
  assert.equal(result.signal, null);
  assert.match(result.stderr, new RegExp(reason));
  assert.equal(fs.existsSync(result.report), false);
});

test('missing runtime returns a controlled failure without a report', async t => {
  const result = await run(t, 'spawn-error');
  assert.equal(result.code, 1, result.stderr);
  assert.match(result.stderr, /app_server_spawn_failed:.*ENOENT/);
  assert.doesNotMatch(result.stderr, /Unhandled 'error'/);
  assert.equal(fs.existsSync(result.report), false);
});

test('an existing report is preserved and the runtime still stops after the write fails', async t => {
  const result = await run(t, 'existing-report');
  assert.equal(result.code, 1, result.stderr);
  assert.match(result.stderr, /protocol_parse_failed:.*EEXIST/);
  assert.equal(fs.readFileSync(result.report, 'utf8'), 'existing report must be preserved');
});

test('messages received after completion cannot write to the closing runtime input', async t => {
  const result = await run(t, 'late-events');
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stderr, '');
  const events = fs.readFileSync(result.events, 'utf8').trim().split('\n').map(line => JSON.parse(line));
  assert.equal(events.at(-1).method, 'turn/completed');
});

test('a delayed terminal-event write failure cannot become a successful evaluation', async t => {
  const result = await run(t, 'late-write-error');
  assert.equal(result.code, 1, result.stderr);
  assert.match(result.stderr, /event_write_failed:EIO/);
  assert.doesNotMatch(fs.readFileSync(result.events, 'utf8'), /turn\/completed/);
});

test('an event write that never completes cannot outlive cleanup or return success', async t => {
  const result = await run(t, 'stalled-write');
  assert.equal(result.code, 1, result.stderr);
  assert.match(result.stderr, /app_server_cleanup_unverified/);
  assert.doesNotMatch(fs.readFileSync(result.events, 'utf8'), /turn\/completed/);
});
