'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '../scripts/update-routing-guidance.js');
const ORIGINAL = '# Team instructions\n\nKeep the original policy.\n';
const EDITED = '# Team instructions\n\nKeep the concurrent policy.\n';
const FOREIGN = 'This temporary file belongs to another writer.\n';

// Inject faults only in an isolated child process, at deterministic filesystem
// boundaries. No timing assumptions or real user repositories are involved.
function filesystemHook() {
  const fs = require('node:fs');
  const path = require('node:path');
  const {root, scenario, original, edited, foreign, eventsPath} = JSON.parse(process.env.VULPORA_ATOMIC_FIXTURE);
  const agents = path.join(root, 'AGENTS.md');
  const temporary = `${agents}.vulpora-${process.pid}.tmp`;
  const saved = Object.fromEntries(['openSync', 'writeFileSync', 'readdirSync', 'renameSync', 'unlinkSync'].map(key => [key, fs[key]]));
  const events = [];
  function record(event) {
    events.push(event);
    saved.writeFileSync(eventsPath, JSON.stringify({temporary, events}));
  }
  record('hook-loaded');
  if (scenario === 'foreign-file') saved.writeFileSync(temporary, foreign);
  if (scenario === 'foreign-dangling-symlink') fs.symlinkSync(path.join(root, 'missing'), temporary);
  let temporaryFd;
  fs.openSync = function(filename, ...args) {
    const fd = saved.openSync.call(fs, filename, ...args);
    if (filename === temporary) temporaryFd = fd;
    return fd;
  };
  function mutate() {
    if (scenario === 'inspect-delete') saved.unlinkSync(agents);
    else if (scenario === 'inspect-replace') {
      saved.renameSync(agents, path.join(root, 'original-AGENTS.md'));
      saved.writeFileSync(agents, original);
    } else if (scenario === 'inspect-symlink' || scenario === 'inspect-directory') {
      saved.unlinkSync(agents);
      if (scenario === 'inspect-symlink') fs.symlinkSync(path.join(root, 'outside.txt'), agents);
      else fs.mkdirSync(agents);
    } else if (scenario === 'inspect-bytes') {
      saved.writeFileSync(agents, Buffer.from([0x23, 0x20, 0xfe, 0x0a]));
    } else saved.writeFileSync(agents, edited);
    record('document-mutated');
  }
  let inspected = false;
  fs.readdirSync = function(directory, ...args) {
    const result = saved.readdirSync.call(fs, directory, ...args);
    if (!inspected && directory === root) {
      inspected = true;
      if (scenario.startsWith('inspect-')) mutate();
    }
    return result;
  };
  fs.writeFileSync = function(filename, content, ...args) {
    const isTemporary = filename === temporary || (temporaryFd !== undefined && filename === temporaryFd);
    if (isTemporary && scenario === 'partial-write') {
      saved.writeFileSync.call(fs, filename, 'partial write', ...args);
      record('partial-write');
      throw Object.assign(new Error('injected partial write failure'), {code: 'EIO'});
    }
    const result = saved.writeFileSync.call(fs, filename, content, ...args);
    if (isTemporary) {
      record('temporary-written');
      if (scenario === 'after-temp-edit') mutate();
    }
    return result;
  };
  fs.renameSync = function(source, destination) {
    if (source === temporary && scenario === 'rename-failure') {
      record('rename-failed');
      throw Object.assign(new Error('injected rename failure'), {code: 'EIO'});
    }
    const result = saved.renameSync(source, destination);
    if (source === temporary && scenario === 'after-rename-foreign-file') {
      saved.writeFileSync(temporary, foreign);
      record('foreign-file-after-rename');
    }
    return result;
  };
}

function runFixture(t, scenario, options = {}) {
  const sandbox = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'vulpora-init-atomic-')));
  t.after(() => fs.rmSync(sandbox, {recursive: true, force: true}));
  const root = path.join(sandbox, 'repo');
  fs.mkdirSync(root);
  const agents = path.join(root, 'AGENTS.md');
  if (scenario !== 'inspect-create') {
    fs.writeFileSync(agents, scenario === 'inspect-bytes' ? Buffer.from([0x23, 0x20, 0xff, 0x0a]) : ORIGINAL);
    fs.chmodSync(agents, 0o640);
  }
  fs.writeFileSync(path.join(root, 'outside.txt'), FOREIGN);
  if (options.current) {
    const setup = spawnSync(process.execPath, [SCRIPT, '--target', root], {encoding: 'utf8'});
    assert.equal(setup.status, 0, setup.stderr);
  }
  const hook = path.join(sandbox, 'hook.cjs');
  const eventsPath = path.join(sandbox, 'events.json');
  fs.writeFileSync(hook, `(${filesystemHook.toString()})();\n`);
  const result = spawnSync(process.execPath, ['--require', hook, SCRIPT, '--target', root, ...(options.args || [])], {
    encoding: 'utf8',
    env: {...process.env, VULPORA_ATOMIC_FIXTURE: JSON.stringify({root, scenario, original: ORIGINAL, edited: EDITED, foreign: FOREIGN, eventsPath})},
  });
  assert.equal(result.signal, null, result.stderr);
  assert.equal(result.error, undefined);
  const {temporary, events} = JSON.parse(fs.readFileSync(eventsPath, 'utf8'));
  return {root, agents, temporary, events, result};
}

function assertFailed(result) {
  assert.notEqual(result.status, 0, 'must not report success after the injected conflict');
  assert.doesNotMatch(result.stdout, /routing_guidance_updated/);
}

function assertNoTemporary(temporary) {
  assert.equal(fs.lstatSync(temporary, {throwIfNoEntry: false}), undefined, 'owned temporary file must be removed');
}

test('exclusive temporary-file collision preserves the other writer\'s file', t => {
  const {agents, temporary, result} = runFixture(t, 'foreign-file');
  assertFailed(result);
  assert.equal(fs.readFileSync(agents, 'utf8'), ORIGINAL);
  assert.equal(fs.readFileSync(temporary, 'utf8'), FOREIGN);
});

test('exclusive temporary-file collision preserves a dangling symlink', t => {
  const {root, agents, temporary, result} = runFixture(t, 'foreign-dangling-symlink');
  assertFailed(result);
  assert.equal(fs.readFileSync(agents, 'utf8'), ORIGINAL);
  assert.ok(fs.lstatSync(temporary).isSymbolicLink());
  assert.equal(fs.readlinkSync(temporary), path.join(root, 'missing'));
  assert.equal(fs.existsSync(path.join(root, 'missing')), false);
});

test('partial temporary write failure cleans only the newly owned file', t => {
  const {agents, temporary, events, result} = runFixture(t, 'partial-write');
  assertFailed(result);
  assert.ok(events.includes('partial-write'));
  assert.equal(fs.readFileSync(agents, 'utf8'), ORIGINAL);
  assertNoTemporary(temporary);
});

test('rename failure cleans the owned temporary file without changing AGENTS.md', t => {
  const {agents, temporary, events, result} = runFixture(t, 'rename-failure');
  assertFailed(result);
  assert.ok(events.includes('rename-failed'));
  assert.equal(fs.readFileSync(agents, 'utf8'), ORIGINAL);
  assertNoTemporary(temporary);
});

test('successful rename relinquishes the old temporary pathname', t => {
  const {temporary, events, result} = runFixture(t, 'after-rename-foreign-file');
  assert.equal(result.status, 0, result.stderr);
  assert.ok(events.includes('foreign-file-after-rename'));
  assert.equal(fs.readFileSync(temporary, 'utf8'), FOREIGN);
});

for (const scenario of ['inspect-edit', 'inspect-create', 'inspect-delete', 'inspect-replace', 'inspect-symlink', 'inspect-directory', 'inspect-bytes', 'after-temp-edit']) {
  test(`refuses to publish over AGENTS.md drift: ${scenario}`, t => {
    const {root, agents, temporary, events, result} = runFixture(t, scenario);
    assert.ok(events.includes('document-mutated'), 'the concurrent mutation was injected');
    if (scenario === 'after-temp-edit') assert.ok(events.includes('temporary-written'));
    assertFailed(result);
    assert.match(result.stderr, /AGENTS\.md changed while generating routing guidance/);
    if (scenario === 'inspect-delete') assert.equal(fs.existsSync(agents), false);
    else if (scenario === 'inspect-replace') {
      assert.equal(fs.readFileSync(agents, 'utf8'), ORIGINAL);
      assert.equal(fs.readFileSync(path.join(root, 'original-AGENTS.md'), 'utf8'), ORIGINAL);
    } else if (scenario === 'inspect-symlink') assert.ok(fs.lstatSync(agents).isSymbolicLink());
    else if (scenario === 'inspect-directory') assert.ok(fs.lstatSync(agents).isDirectory());
    else if (scenario === 'inspect-bytes') assert.deepEqual(fs.readFileSync(agents), Buffer.from([0x23, 0x20, 0xfe, 0x0a]));
    else assert.equal(fs.readFileSync(agents, 'utf8'), EDITED);
    assert.equal(fs.readFileSync(path.join(root, 'outside.txt'), 'utf8'), FOREIGN);
    assertNoTemporary(temporary);
  });
}

for (const args of [[], ['--check']]) {
  test(`does not report a changed current snapshot as ${args.length ? 'current' : 'unchanged'}`, t => {
    const {agents, temporary, events, result} = runFixture(t, 'inspect-edit', {current: true, args});
    assert.ok(events.includes('document-mutated'));
    assertFailed(result);
    assert.doesNotMatch(result.stdout, /routing_guidance_(?:current|unchanged)/);
    assert.match(result.stderr, /AGENTS\.md changed while generating routing guidance/);
    assert.equal(fs.readFileSync(agents, 'utf8'), EDITED);
    assertNoTemporary(temporary);
  });
}

test('uncontended update preserves manual text and respects mode/umask without a temporary leftover', t => {
  const {agents, temporary, result} = runFixture(t, 'success');
  assert.equal(result.status, 0, result.stderr);
  assert.ok(fs.readFileSync(agents, 'utf8').startsWith(ORIGINAL));
  assert.match(fs.readFileSync(agents, 'utf8'), /<!-- VULPORA:ROUTING:START -->/);
  assert.equal(fs.statSync(agents).mode & 0o777, 0o640 & ~process.umask());
  assertNoTemporary(temporary);
});
