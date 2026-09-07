'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { hash } = require('./eval-evidence.js');
const { run } = require('./run-budgeted-eval.js');
const executable = fs.realpathSync(process.execPath);
const sha256 = hash(fs.readFileSync(executable));
function spec(code, overrides = {}) {
  return { executable, sha256, args: ['-e', code], cwd: fs.realpathSync(__dirname), files: [], passEnv: [],
    timeoutMs: 3000, maxOutputBytes: 65536, ...overrides };
}
// Exercise process lifecycle races without sending signals to real process
// groups. Fake timers make denied cleanup and inherited-pipe cases bounded.
function lifecycleFixture(signalError) {
  const child = new EventEmitter();
  Object.assign(child, { pid: 123456, exitCode: null, signalCode: null, unreferenced: false });
  for (const name of ['stdout', 'stderr']) {
    child[name] = new EventEmitter();
    child[name].destroy = () => { child[name].destroyed = true; };
  }
  child.unref = () => { child.unreferenced = true; };
  const fakeProcess = new EventEmitter();
  const signals = [], timers = [];
  fakeProcess.env = {};
  fakeProcess.kill = (pid, signal) => {
    signals.push({ pid, signal, exitCode: child.exitCode, signalCode: child.signalCode });
    if (signalError) throw Object.assign(new Error('synthetic signal denial'), { code: signalError });
  };
  const sandbox = {
    module: { exports: {} }, process: fakeProcess,
    require: id => id === 'node:child_process' ? { spawn: () => child } : require(id),
    setTimeout: (callback, delay) => {
      const timer = { callback, delay, active: true }; timers.push(timer); return timer;
    },
    clearTimeout: timer => { if (timer) timer.active = false; }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'run-budgeted-eval.js'), 'utf8'), sandbox);
  return {
    run: sandbox.module.exports.run, child, signals, timers,
    timer(delay) {
      const timer = timers.find(value => value.active && value.delay === delay);
      assert.ok(timer, `missing active ${delay}ms timer`); return timer;
    },
    fire(delay) { const timer = this.timer(delay); timer.active = false; timer.callback(); },
    exit(code = 0, signal = null) {
      child.exitCode = code; child.signalCode = signal; child.emit('exit', code, signal);
    },
    close(code = child.exitCode, signal = child.signalCode) { child.emit('close', code, signal); }
  };
}
test('successful execution emits digests without raw output or promotion claims', async () => {
  const result = await run(spec('process.stdout.write("synthetic-sensitive-value")'));
  assert.equal(result.outcome, 'INCONCLUSIVE'); assert.equal(result.execution, 'EXIT_ZERO');
  assert.equal(result.cleanupEnforced, false); assert.equal(result.isolationEnforced, false);
  assert.equal(result.promotion, 'BLOCKED');
  assert.equal(result.outputSha256, hash('synthetic-sensitive-value'));
  assert.equal(result.tokens, 'unmeasured'); assert.equal(result.rawOutputRetained, false);
  assert.ok(!JSON.stringify(result).includes('synthetic-sensitive-value'));
});
test('nonzero exit is inconclusive', async () => {
  const result = await run(spec('process.exit(9)')); assert.equal(result.reason, 'RUNNER_FAILED');
});
test('timeout cannot become PASS even when the runner catches cancellation and exits zero', async () => {
  const result = await run(spec('process.on("SIGTERM", () => process.exit(0)); setInterval(() => {}, 10)', { timeoutMs: 500 }));
  assert.equal(result.outcome, 'INCONCLUSIVE'); assert.equal(result.reason, 'TIME_BUDGET_EXCEEDED');
});
test('combined stderr/stdout output budget is enforced', async () => {
  const result = await run(spec('process.stderr.write("x".repeat(10000));', { maxOutputBytes: 100 }));
  assert.equal(result.reason, 'OUTPUT_BUDGET_EXCEEDED');
  assert.equal(result.outputScope, 'observed-stream');
  assert.equal(result.outputSha256, hash('x'.repeat(result.outputBytes)));
});
test('credentials and execution injection environment are not implicitly inherited', async () => {
  const key = 'VULPORA_TEST_PRIVATE_VALUE'; const previous = process.env[key];
  process.env[key] = 'sensitive';
  try {
    const result = await run(spec('process.stdout.write(String(process.env.VULPORA_TEST_PRIVATE_VALUE))'));
    assert.equal(result.outputSha256, hash('undefined'));
  } finally { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; }
});
test('wrong executable digest rejects before invocation', async () => {
  await assert.rejects(run(spec('process.exit(0)', { sha256: '0'.repeat(64) })), /RUNNER_DIGEST_MISMATCH/);
});
test('pinned input changed during execution is inconclusive', async t => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'vulpora-budget-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const target = path.join(dir, 'runner-input'); fs.writeFileSync(target, 'before');
  const result = await run(spec('require("node:fs").writeFileSync(process.argv[1], "after")', {
    args: ['-e', 'require("node:fs").writeFileSync(process.argv[1], "after")', target],
    files: [{ path: target, sha256: hash('before') }]
  }));
  assert.equal(result.reason, 'RUNNER_CHANGED');
});
test('unknown budget options fail closed', async () => {
  await assert.rejects(run(spec('', { ignoredBudget: 100 })), /INVALID_RUN_SPEC/);
});
test('symlinked cwd ancestry is rejected', async t => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'vulpora-budget-cwd-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const link = path.join(dir, 'alias'); fs.symlinkSync(__dirname, link);
  await assert.rejects(run(spec('', { cwd: link })), /INVALID_RUN_SPEC/);
});
test('reaped leaders receive no group signals on exit or finalization', async () => {
  const fixture = lifecycleFixture(); const pending = fixture.run(spec(''));
  fixture.exit(); fixture.close();
  const result = await pending;
  assert.equal(fixture.signals.length, 0);
  assert.equal(result.execution, 'EXIT_ZERO'); assert.equal(result.outcome, 'INCONCLUSIVE');
  assert.equal(result.promotion, 'BLOCKED'); assert.equal(result.cleanupEnforced, false);
  assert.equal(fixture.timers.filter(timer => timer.active).length, 0);
});
test('an observed exit blocks even a previously queued hard-stop callback', async () => {
  const fixture = lifecycleFixture(); const pending = fixture.run(spec(''));
  fixture.fire(3000); const queuedHardStop = fixture.timer(100);
  // Test the observed-exit guard independently of Node's exit-code fields.
  fixture.child.emit('exit', 0, null); queuedHardStop.callback(); fixture.close(0, null);
  const result = await pending;
  assert.deepEqual(fixture.signals.map(call => call.signal), ['SIGTERM']);
  assert.equal(result.reason, 'TIME_BUDGET_EXCEEDED');
});
test('an observed close also blocks previously queued group signals', async () => {
  const fixture = lifecycleFixture(); const pending = fixture.run(spec(''));
  fixture.fire(3000); const queuedHardStop = fixture.timer(100);
  fixture.close(0, null); queuedHardStop.callback();
  await pending;
  assert.deepEqual(fixture.signals.map(call => call.signal), ['SIGTERM']);
});
test('invalid or reserved process identifiers never become group signal targets', async () => {
  for (const pid of [undefined, 0, 1, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    const fixture = lifecycleFixture(); fixture.child.pid = pid;
    const pending = fixture.run(spec(''));
    fixture.fire(3000); fixture.fire(100); fixture.fire(600);
    await pending;
    assert.equal(fixture.signals.length, 0, `unsafe process identifier: ${pid}`);
  }
});
for (const [field, value] of [['exitCode', 0], ['signalCode', 'SIGTERM']]) {
  test(`${field} blocks signaling before the exit event arrives`, async () => {
    const fixture = lifecycleFixture(); const pending = fixture.run(spec(''));
    fixture.child[field] = value; fixture.fire(3000); fixture.fire(100);
    fixture.child.emit('exit', fixture.child.exitCode, fixture.child.signalCode); fixture.close();
    await pending;
    assert.equal(fixture.signals.length, 0);
  });
}
test('timeout escalates only while the leader remains live and unreaped', async () => {
  const fixture = lifecycleFixture(); const pending = fixture.run(spec(''));
  fixture.fire(3000); fixture.fire(100); fixture.exit(null, 'SIGKILL'); fixture.close();
  const result = await pending;
  assert.deepEqual(fixture.signals.map(call => call.signal), ['SIGTERM', 'SIGKILL']);
  assert.ok(fixture.signals.every(call => call.exitCode === null && call.signalCode === null));
  assert.equal(result.reason, 'TIME_BUDGET_EXCEEDED'); assert.equal(result.execution, 'FAIL');
});
test('post-exit inherited pipes settle without signaling a reaped group', async () => {
  const fixture = lifecycleFixture(); const pending = fixture.run(spec(''));
  fixture.exit(); fixture.fire(500);
  // No close event is delivered: destroying local pipes must still settle.
  const result = await pending;
  assert.equal(fixture.signals.length, 0); assert.equal(result.reason, 'CLEANUP_UNVERIFIED');
  assert.equal(result.execution, 'FAIL'); assert.equal(result.cleanupEnforced, false);
  assert.equal(result.cleanupFailure.code, 'CLEANUP_UNVERIFIED');
  assert.ok(fixture.child.stdout.destroyed && fixture.child.stderr.destroyed);
});
test('output exhaustion remains bounded when no child exit or close arrives', async () => {
  const fixture = lifecycleFixture(); const pending = fixture.run(spec('', { maxOutputBytes: 100 }));
  fixture.child.stdout.emit('data', Buffer.alloc(101, 'x'));
  fixture.fire(100); fixture.fire(600);
  const result = await pending;
  assert.equal(result.reason, 'OUTPUT_BUDGET_EXCEEDED'); assert.equal(result.execution, 'FAIL');
  assert.equal(result.outputBytes, 101); assert.equal(result.outputSha256, hash('x'.repeat(101)));
  assert.equal(result.cleanupFailure.code, 'CLEANUP_UNVERIFIED');
  assert.equal(result.promotion, 'BLOCKED'); assert.ok(fixture.child.unreferenced);
  assert.equal(fixture.timers.filter(timer => timer.active).length, 0);
});
test('live-child EPERM is reported and settles after cleanup grace without claiming termination', async () => {
  const fixture = lifecycleFixture('EPERM'); const pending = fixture.run(spec(''));
  fixture.fire(3000); fixture.fire(100); fixture.fire(600);
  const result = await pending;
  assert.equal(result.reason, 'TIME_BUDGET_EXCEEDED'); assert.equal(result.execution, 'FAIL');
  assert.equal(result.cleanupFailure.code, 'EPERM'); assert.equal(result.cleanupFailure.signal, 'SIGTERM');
  assert.equal(result.exitCode, null); assert.equal(result.outcome, 'INCONCLUSIVE');
  assert.equal(result.cleanupEnforced, false); assert.equal(result.isolationEnforced, false);
  assert.equal(result.promotion, 'BLOCKED'); assert.ok(fixture.child.unreferenced);
  assert.ok(fixture.child.stdout.destroyed && fixture.child.stderr.destroyed);
  assert.ok(fixture.signals.every(call => call.exitCode === null && call.signalCode === null));
  assert.equal(fixture.timers.filter(timer => timer.active).length, 0);
  fixture.exit(); fixture.close();
  assert.equal(fixture.timers.filter(timer => timer.active).length, 0);
});
