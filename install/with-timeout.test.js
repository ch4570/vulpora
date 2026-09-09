'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const runner = path.join(__dirname, 'with-timeout.sh');
const resistant = 'process.on("SIGTERM", () => {}); console.log("ready:" + process.pid); setInterval(() => {}, 100);';

function run(t, seconds, script, interrupt, options = {}) {
  const args = [runner, String(seconds), ...(options.command || [process.execPath, '-e', script])];
  const child = spawn('/bin/bash', options.siblingScript
    ? ['-c', '"$1" -e "$2" >/dev/null 2>&1 & sibling=$!; printf "sibling:%s\\n" "$sibling"; shift 2; exec /bin/bash "$@"',
      '_', process.execPath, options.siblingScript, ...args] : args, {
    detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: {...process.env, ...options.env}
  });
  const owned = new Set();
  const rememberOwned = () => {
    const rows = spawnSync('ps', ['-axo', 'pid=,ppid='], {encoding: 'utf8'}).stdout || '';
    const entries = rows.trim().split('\n').map(line => line.trim().split(/\s+/).map(Number));
    const pending = [child.pid];
    const visited = new Set(pending);
    while (pending.length) {
      const parent = pending.pop();
      for (const [pid, ppid] of entries) if (ppid === parent && !visited.has(pid)) {
        visited.add(pid); owned.add(pid); pending.push(pid);
      }
    }
  };
  const killGroup = () => {
    rememberOwned();
    for (const pid of owned) {
      try { process.kill(pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  };
  t.after(killGroup);
  return new Promise((resolve, reject) => {
    let stdout = '', stderr = '', interrupted = false;
    const signalTimers = [];
    const watchdog = setTimeout(() => {
      killGroup();
      reject(new Error('timeout wrapper did not finish within its deadline and cleanup grace'));
    }, 7000);
    child.stdout.on('data', chunk => {
      stdout += chunk;
      for (const match of stdout.matchAll(/(?:ready|sibling):(\d+)/g)) owned.add(Number(match[1]));
      rememberOwned();
      if (interrupt && !interrupted && stdout.includes(interrupt.after)) {
        interrupted = true;
        for (const [index, signal] of (interrupt.signals || ['SIGTERM']).entries())
          signalTimers.push(setTimeout(() => child.kill(signal), (interrupt.delay || 0) + index * 100));
      }
    });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => { clearTimeout(watchdog); reject(error); });
    child.on('exit', code => { if (options.expectUnverifiedCleanup && code === 125) killGroup(); });
    child.on('close', (code, signal) => {
      clearTimeout(watchdog);
      signalTimers.forEach(clearTimeout);
      resolve({ code, signal, stdout, stderr });
    });
  });
}

function assertStopped(pid) {
  const state = spawnSync('ps', ['-o', 'stat=', '-p', String(pid)], { encoding: 'utf8' });
  assert.ok(state.status !== 0 || !state.stdout.trim() || /^Z/.test(state.stdout.trim()),
    `owned process ${pid} is still running: ${state.stdout.trim()}`);
}

test('normal completion preserves output and exit status without waiting for the timer', async t => {
  for (const code of [0, 7]) {
    const result = await run(t, 30, `console.log("ordinary output"); console.error("ordinary error"); process.exitCode = ${code};`);
    assert.equal(result.code, code);
    assert.equal(result.signal, null);
    assert.equal(result.stdout, 'ordinary output\n');
    assert.equal(result.stderr, 'ordinary error\n');
  }
});

test('normal parent exit stops background writes and closes inherited output pipes', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vulpora-timeout-write-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  for (const [output, code] of [['inherit', 7], ['ignore', 0]]) {
    const filename = path.join(directory, output);
    const writer = `const fs=require('node:fs'); process.on('SIGTERM',()=>{});
      fs.writeFileSync(${JSON.stringify(filename)},'start'); process.send('ready');
      setInterval(()=>fs.appendFileSync(${JSON.stringify(filename)},'.'),25);`;
    const script = `const child=require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(writer)}],
      {stdio:['ignore',${JSON.stringify(output)},${JSON.stringify(output)},'ipc']});
      child.once('message',()=>{console.log('ready:'+child.pid);process.exit(${code});});`;
    const result = await run(t, 30, script);
    assert.equal(result.code, code); assert.equal(result.signal, null);
    assertStopped(Number(result.stdout.match(/ready:(\d+)/)[1]));
    const completed = fs.readFileSync(filename, 'utf8');
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(fs.readFileSync(filename, 'utf8'), completed);
  }
});

test('cleanup preserves an unrelated sibling in the caller process group', async t => {
  const result = await run(t, 30, 'console.log("command done");', null,
    {siblingScript: 'setInterval(()=>{},100);'});
  assert.equal(result.code, 0);
  const pid = Number(result.stdout.match(/sibling:(\d+)/)[1]);
  const state = spawnSync('ps', ['-o', 'stat=', '-p', String(pid)], {encoding: 'utf8'});
  assert.equal(state.status, 0); assert.ok(state.stdout.trim() && !/^Z/.test(state.stdout.trim()));
});

test('lost supervisor ownership cannot become a successful cleanup', async t => {
  const script = `console.log('ready:'+process.pid); setTimeout(()=>process.kill(process.ppid,'SIGKILL'),100);
    setInterval(()=>{},100);`;
  const result = await run(t, 30, script, null, {expectUnverifiedCleanup: true});
  assert.equal(result.code, 125);
  assert.match(result.stderr, /cleanup_unverified/);
});

test('worker-written completion files cannot turn a running command into exit zero', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vulpora-timeout-forge-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  const script = `const fs=require('node:fs'),path=require('node:path');process.on('SIGTERM',()=>{});
    const base=process.env.TMPDIR;
    const found=fs.readdirSync(base).find(name=>name.startsWith('vulpora-timeout.'));
    const state=found?path.join(base,found):fs.mkdtempSync(path.join(base,'vulpora-timeout.'));
    fs.writeFileSync(path.join(state,'status'),'0\\n');console.log('ready:'+process.pid);
    setInterval(()=>{},100);`;
  const result = await run(t, 1, script, null, {env: {TMPDIR: directory}});
  assert.equal(result.code, 124);
  assert.match(result.stderr, /"outcome":"timeout"/);
  assertStopped(Number(result.stdout.match(/ready:(\d+)/)[1]));
});

test('worker command cannot inherit internal completion or hold descriptors', async t => {
  const command = ['/bin/bash', '-c',
    'if (printf "0\\n" >&3) 2>/dev/null; then exit 99; fi; if (printf "0\\n" >&4) 2>/dev/null; then exit 98; fi; printf "descriptors closed\\n"'];
  const result = await run(t, 3, '', null, {command});
  assert.equal(result.code, 0); assert.equal(result.stdout, 'descriptors closed\n');
});

test('exit and exec builtins cannot terminate or replace the supervisor', async t => {
  for (const command of [['exit', '7'], ['exec', process.execPath, '-e', 'process.exitCode=7;']]) {
    const result = await run(t, 3, '', null, {command});
    assert.equal(result.code, 7); assert.equal(result.signal, null);
  }
});

test('a child that ignores TERM is forcibly stopped within the timeout grace', async t => {
  const result = await run(t, 1, resistant);
  assert.equal(result.code, 124);
  assert.equal(result.signal, null);
  assert.match(result.stderr, /timeout_result=\{"outcome":"timeout","timeout_seconds":1\}/);
  assertStopped(Number(result.stdout.match(/ready:(\d+)/)[1]));
});

test('timeout retains ownership of a resistant descendant after its parent exits', async t => {
  const script = `const {spawn} = require('node:child_process');
    process.on('SIGTERM', () => process.exit(0));
    spawn(process.execPath, ['-e', ${JSON.stringify(resistant)}], {stdio: ['ignore', 'inherit', 'inherit']});
    setInterval(() => {}, 100);`;
  const result = await run(t, 1, script);
  assert.equal(result.code, 124);
  assertStopped(Number(result.stdout.match(/ready:(\d+)/)[1]));
});

test('caller interruption cleans up the command and its timer', async t => {
  const result = await run(t, 30, resistant, { after: 'ready:' });
  assert.equal(result.code, 130);
  assert.equal(result.signal, null);
  assertStopped(Number(result.stdout.match(/ready:(\d+)/)[1]));
});

test('caller interruption during timeout cleanup still stops reparented descendants', async t => {
  const script = `const {spawn} = require('node:child_process');
    process.on('SIGTERM', () => { console.log('parent-term'); process.exit(0); });
    spawn(process.execPath, ['-e', ${JSON.stringify(resistant)}], {stdio: ['ignore', 'inherit', 'inherit']});
    setInterval(() => {}, 100);`;
  const result = await run(t, 1, script, { after: 'parent-term', delay: 100,
    signals: ['SIGTERM', 'SIGTERM', 'SIGHUP', 'SIGINT'] });
  assert.equal(result.code, 130);
  assertStopped(Number(result.stdout.match(/ready:(\d+)/)[1]));
});

test('invalid timeout arguments never launch a command', () => {
  for (const limit of ['', '0', '-1', '1.5', 'invalid']) {
    const result = spawnSync('bash', [runner, limit, process.execPath, '-e', 'console.log("launched")'], { encoding: 'utf8' });
    assert.equal(result.status, 2, limit);
    assert.equal(result.stdout, '', limit);
  }
});
