import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { renderPdf, superviseBrowser } from '../scripts/render-pdf.mjs';
import { publish } from '../scripts/publish.mjs';

const PDF = '%PDF-1.7\nsynthetic envelope only; not a visually reviewed PDF\n%%EOF\n';
let nextPid = 42000;

// No global process.kill replacement: only this invocation's operations are
// injected. Profiles are real temporary directories; every child is fake.
function fixture(t, {start, kill, members = () => [], launchError} = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'markdown-renderer-test-'));
  const input = join(directory, 'input.html');
  const output = join(directory, 'report.pdf');
  writeFileSync(input, '<!doctype html><title>local fixture</title>');
  const signals = new EventEmitter();
  const timers = new Set();
  const f = {directory, input, output, signals, kills: [], inspections: [], profiles: [], unrefs: 0};
  f.later = (callback, delay = 0) => {
    const timer = setTimeout(() => { timers.delete(timer); callback(); }, delay);
    timers.add(timer);
  };
  f.exit = (code = 0, signal = null) => {
    f.child.exitCode = code;
    f.child.signalCode = signal;
    f.child.emit('exit', code, signal);
  };
  f.close = (code = f.child.exitCode, signal = f.child.signalCode) => {
    f.child.stdout.end();
    f.child.stderr.end();
    f.child.emit('close', code, signal);
  };
  f.complete = (code = 0, signal = null) => { f.exit(code, signal); f.close(code, signal); };
  f.pdf = (contents = PDF) => writeFileSync(output, contents);
  f.api = {
    signals,
    spawn(executable, args, options) {
      f.spawnOptions = options;
      f.executable = executable;
      const profile = args.find((arg) => arg.startsWith('--user-data-dir='));
      if (profile) f.profiles.push(profile.slice('--user-data-dir='.length));
      if (launchError) throw launchError;
      f.child = Object.assign(new EventEmitter(), {
        pid: nextPid++, exitCode: null, signalCode: null,
        stdout: new PassThrough(), stderr: new PassThrough(),
        unref() { f.unrefs++; },
      });
      queueMicrotask(() => start?.(f));
      return f.child;
    },
    kill(pid, signal) {
      f.kills.push({pid, signal, exitCode: f.child.exitCode, signalCode: f.child.signalCode});
      assert.equal(pid, -f.child.pid, 'signals only the owned group');
      assert.equal(f.child.exitCode, null, 'never signals after an exit code is known');
      assert.equal(f.child.signalCode, null, 'never signals after a termination signal is known');
      if (kill) return kill(f);
      f.later(() => f.complete(null, 'SIGKILL'));
      return true;
    },
    groupMembers(pid) { f.inspections.push(pid); return members(f); },
  };
  f.options = {processApi: f.api, timeoutMs: 30, closeTimeoutMs: 35, maxOutputBytes: 64};
  f.render = (overrides = {}) => renderPdf({input, output, browser: process.execPath}, {...f.options, ...overrides});
  f.released = () => {
    for (const name of ['SIGINT', 'SIGTERM', 'SIGHUP']) assert.equal(signals.listenerCount(name), 0);
    if (f.child) {
      assert.equal(f.child.stdout.destroyed, true);
      assert.equal(f.child.stderr.destroyed, true);
      assert.equal(f.unrefs, 1);
    }
  };
  f.fails = async (pattern, overrides) => {
    await assert.rejects(f.render(overrides), (error) => {
      assert.match(error.message, pattern);
      assert.equal(error.profileDir, f.profiles[0]);
      assert.equal(existsSync(error.profileDir), true, 'failed profile is recoverable');
      assert.match(error.message, /profile preserved:/);
      return true;
    });
    f.released();
  };
  t.after(() => {
    for (const timer of timers) clearTimeout(timer);
    // These exact paths were created by this test, and no real browser used them.
    for (const profile of f.profiles) rmSync(profile, {recursive: true, force: true});
    rmSync(directory, {recursive: true, force: true});
  });
  return f;
}

test('normal render awaits child close and group inspection, then removes profile', async (t) => {
  const f = fixture(t, {start(f) { f.pdf(); f.complete(); }});
  const result = await f.render();
  assert.equal(result.exitMode, 'normal');
  assert.equal(readFileSync(result.output, 'utf8'), PDF);
  assert.deepEqual(f.spawnOptions, {detached: true, shell: false, stdio: ['ignore', 'pipe', 'pipe']});
  assert.deepEqual(f.kills, []);
  assert.deepEqual(f.inspections, [f.child.pid]);
  assert.equal(existsSync(f.profiles[0]), false);
  f.released();
});

test('deadline accepts complete PDF only after owned live group termination and cleanup', async (t) => {
  const f = fixture(t, {start(f) { f.pdf(); }});
  const result = await f.render();
  assert.equal(result.exitMode, 'bounded-termination-after-complete-pdf');
  assert.equal(f.kills.length, 1);
  assert.equal(f.kills[0].signal, 'SIGKILL');
  assert.equal(existsSync(f.profiles[0]), false);
  f.released();
});

test('deadline rejects a partial PDF and preserves profile', async (t) => {
  const f = fixture(t, {start(f) { f.pdf('%PDF-1.7\npartial'); }});
  await f.fails(/timed out before producing a complete PDF/);
  assert.equal(f.kills.length, 1);
});

test('combined stdout/stderr limit rejects even a complete PDF', async (t) => {
  const f = fixture(t, {start(f) {
    f.pdf(); f.child.stdout.write('a'.repeat(40)); f.child.stderr.write('b'.repeat(40));
  }});
  await f.fails(/output limit exceeded/);
  assert.equal(f.kills.length, 1);
});

test('EPERM is a bounded failure, never a successful complete-PDF timeout', async (t) => {
  const f = fixture(t, {start(f) { f.pdf(); }, kill() { throw Object.assign(new Error('denied'), {code: 'EPERM'}); }});
  const started = performance.now();
  await f.fails(/cleanup failed: EPERM/);
  assert.ok(performance.now() - started < 1000);
  assert.equal(f.kills.length, 1);
  assert.deepEqual(f.inspections, []);
});

test('EPERM remains failure even when a later close and empty group are observed', async (t) => {
  const f = fixture(t, {start(f) { f.pdf(); }, kill(f) {
    f.later(() => f.complete());
    throw Object.assign(new Error('denied'), {code: 'EPERM'});
  }});
  await f.fails(/cleanup failed: EPERM/);
  assert.equal(f.kills.length, 1);
});

test('exit with inherited pipes still open fails within close deadline, without a stale kill', async (t) => {
  const f = fixture(t, {start(f) { f.pdf(); f.exit(); }});
  await f.fails(/close\/cleanup deadline exceeded/);
  assert.deepEqual(f.kills, []);
});

test('early close with residual group members fails without signalling reaped PID', async (t) => {
  const f = fixture(t, {start(f) { f.pdf(); f.complete(); }, members(f) { return [f.child.pid + 1]; }});
  await f.fails(/group still has members after exit/);
  assert.ok(f.inspections.length >= 2);
  assert.deepEqual(f.kills, []);
});

test('short-lived residual members are observed until empty, without additional signals', async (t) => {
  const f = fixture(t, {start(f) { f.pdf(); f.complete(); }, members(f) {
    return f.inspections.length === 1 ? [f.child.pid + 1] : [];
  }});
  assert.equal((await f.render()).exitMode, 'normal');
  assert.equal(f.inspections.length, 2);
  assert.deepEqual(f.kills, []);
  f.released();
});

test('failed process-group inspection preserves profile and never assumes cleanup', async (t) => {
  const f = fixture(t, {start(f) { f.pdf(); f.complete(); }, members() { throw new Error('ps unavailable'); }});
  await f.fails(/cleanup could not be verified/);
  assert.deepEqual(f.kills, []);
});

test('clock rollback cannot extend the process-group cleanup deadline', async (t) => {
  const originalNow = Date.now;
  Date.now = () => 1000;
  t.after(() => { Date.now = originalNow; });
  const f = fixture(t, {start(f) { f.pdf(); f.complete(); }, members() { return [123]; }});
  const started = performance.now();
  await f.fails(/group still has members after exit/);
  assert.ok(performance.now() - started < 1000);
  assert.deepEqual(f.kills, []);
});

test('interruption rejects a complete PDF and removes only invocation signal listeners', async (t) => {
  const f = fixture(t, {start(f) { f.pdf(); f.signals.emit('SIGINT'); }});
  const existing = () => {};
  f.signals.on('unrelated', existing);
  await f.fails(/interrupted: SIGINT/);
  assert.equal(f.signals.listenerCount('unrelated'), 1);
  assert.equal(f.kills.length, 1);
});

test('launch error preserves created profile without attempting any group signal', async (t) => {
  const f = fixture(t, {launchError: new Error('not executable')});
  await f.fails(/browser launch failed: not executable/);
  assert.deepEqual(f.kills, []);
});

test('normal nonzero exit is not hidden by an existing complete PDF', async (t) => {
  const f = fixture(t, {start(f) { f.pdf(); f.complete(1); }});
  await f.fails(/browser exited 1/);
  assert.deepEqual(f.kills, []);
});

test('timeout racing a genuine nonzero exit is not hidden by a complete PDF', async (t) => {
  const f = fixture(t, {start(f) { f.pdf(); }, kill(f) {
    f.later(() => f.complete(1));
    throw Object.assign(new Error('already exited'), {code: 'ESRCH'});
  }});
  await f.fails(/browser exited 1/);
  assert.equal(f.kills.length, 1);
});

test('known exit code before event delivery prevents a stale timeout signal', async (t) => {
  const f = fixture(t, {start(f) {
    f.pdf(); f.child.exitCode = 0;
    f.later(() => f.complete(), 40);
  }});
  assert.equal((await f.render()).exitMode, 'bounded-termination-after-complete-pdf');
  assert.deepEqual(f.kills, []);
  f.released();
});

test('overflow after timeout still vetoes complete-PDF success', async (t) => {
  const f = fixture(t, {start(f) { f.pdf(); }, kill(f) {
    f.later(() => { f.child.stdout.write('x'.repeat(65)); f.complete(null, 'SIGKILL'); });
  }});
  await f.fails(/output limit exceeded/);
  assert.equal(f.kills.length, 1);
});

test('interruption after timeout still vetoes complete-PDF success', async (t) => {
  const f = fixture(t, {start(f) { f.pdf(); }, kill(f) {
    f.later(() => { f.signals.emit('SIGTERM'); f.complete(null, 'SIGKILL'); });
  }});
  await f.fails(/interrupted: SIGTERM/);
  assert.equal(f.kills.length, 1);
});

test('missing PDF never passes a clean normal browser exit', async (t) => {
  const f = fixture(t, {start(f) { f.complete(); }});
  await f.fails(/did not produce a complete PDF envelope/);
});

test('execution deadlines and output limits reject invalid or unbounded values', () => {
  for (const options of [{timeoutMs: 0}, {timeoutMs: 60001}, {closeTimeoutMs: Infinity},
    {closeTimeoutMs: 5001}, {maxOutputBytes: 8 * 1024 * 1024 + 1}, {maxOutputBytes: 1.5}]) {
    assert.throws(() => superviseBrowser('/bin/true', [], options), /invalid browser/);
  }
});

test('real host adapter observes one harmless Node child exit with no browser/model call', async () => {
  const result = await superviseBrowser(process.execPath, ['-e', 'process.stdout.write("fixture")'], {
    timeoutMs: 2000, closeTimeoutMs: 1000,
  });
  assert.equal(result.error, null);
  assert.equal(result.cleanupVerified, true);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, 'fixture');
});

test('forced PDF preflight failure invalidates stale manifest and preserves recovery copy', async (t) => {
  const f = fixture(t);
  const source = join(f.directory, 'source-input.md');
  const outputDir = join(f.directory, 'published');
  writeFileSync(source, '# Original\n');
  const manifest = await publish({input: source, 'output-dir': outputDir});
  const previous = readFileSync(manifest, 'utf8');
  writeFileSync(source, '# Changed\n');
  await assert.rejects(publish({input: source, 'output-dir': outputDir, force: true,
    pdf: true, browser: join(f.directory, 'missing-browser')}), (error) => {
    assert.equal(existsSync(manifest), false);
    assert.equal(readFileSync(error.previousManifest, 'utf8'), previous);
    assert.match(error.message, /previous manifest preserved:/);
    return true;
  });
  assert.match(readFileSync(join(outputDir, 'report.html'), 'utf8'), /Changed/);
});
