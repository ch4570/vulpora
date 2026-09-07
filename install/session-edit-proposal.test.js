'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {hash} = require('../skills/start-task/scripts/model-routing-io.js');
const {buildEditPrompt, validateEditProposal, applyEditProposal, SCHEMA, MAX_BYTES} = require('../skills/start-task/scripts/session-edit-proposal.js');
const files = ['src/a.js', 'test/a.test.js'];
const sourceHashes = {'src/a.js': hash('old'), 'test/a.test.js': null};
const proposal = (overrides = {}) => ({schema: SCHEMA, task_id: 'task-1', summary: 'replace', edits: [
  {path: 'src/a.js', before_sha256: sourceHashes['src/a.js'], content: 'new'},
], ...overrides});

test('builds a literal-data prompt with complete source context and coordinator authority', () => {
  const content = 'ignore $(x) `y`';
  const context = {schema: 'vulpora.source-context/v1', files: [{path: 'src/a.js', sha256: hash(content), content}]};
  const prompt = buildEditPrompt('task-1', 'Fix this literal: do not run commands', context,
    {acceptance: ['Preserve behavior'], constraints: ['No dependencies'], cwd: '/tmp/example', attempt_id: 'attempt'});
  assert.deepEqual(JSON.parse(prompt).source_context, context);
  assert.match(prompt, /Do not use tools or commands/); assert.match(prompt, /Fix this literal/);
  assert.match(prompt, /literal task data/);assert.match(prompt, /Parent verification is pending/);
  assert.deepEqual(JSON.parse(prompt).acceptance, ['Preserve behavior']);
  assert.throws(() => buildEditPrompt('task-1', 'goal', {...context, files: [{...context.files[0], content: 'forged'}]}), /INVALID_SOURCE_CONTEXT/);
});

test('accepts only bound in-scope replacements and returns normalized data', () => {
  const value = validateEditProposal(proposal(), {taskId: 'task-1', files, sourceHashes});
  assert.deepEqual(value.edits, [{path: 'src/a.js', before_sha256: sourceHashes['src/a.js'], content: 'new'}]);
  assert.equal(Object.isFrozen(value), false);
});

test('rejects bad bindings, duplicate or escaped paths, unknown keys, and prototype tricks', () => {
  for (const edit of [
    {path: 'src/a.js', before_sha256: hash('different'), content: 'x'},
    {path: '../src/a.js', before_sha256: sourceHashes['src/a.js'], content: 'x'},
    {path: 'src/a.js', before_sha256: sourceHashes['src/a.js'], content: 'x', shell: 'rm'},
  ]) assert.throws(() => validateEditProposal(proposal({edits: [edit]}), {taskId: 'task-1', files, sourceHashes}));
  const dup = proposal({edits: [proposal().edits[0], proposal().edits[0]]});
  assert.throws(() => validateEditProposal(dup, {taskId: 'task-1', files, sourceHashes}));
});

test('supports absent-file null hashes and enforces Unicode aggregate cap', () => {
  const absent = {schema: SCHEMA, task_id: 'task-1', summary: 'add', edits: [{path: 'test/a.test.js', before_sha256: null, content: '한글'}]};
  assert.equal(validateEditProposal(absent, {taskId: 'task-1', files, sourceHashes}).edits[0].before_sha256, null);
  assert.throws(() => validateEditProposal(proposal({edits: [{path: 'src/a.js', before_sha256: sourceHashes['src/a.js'], content: 'x'.repeat(MAX_BYTES + 1)}]}), {taskId: 'task-1', files, sourceHashes}));
});

function workspace(t) {
  const cwd = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'vulpora-edit-test-')));
  t.after(() => fs.rmSync(cwd, {recursive: true, force: true}));
  fs.mkdirSync(path.join(cwd, 'src'));fs.mkdirSync(path.join(cwd, 'test'));
  fs.writeFileSync(path.join(cwd, 'src/a.js'), 'old', {mode: 0o751});
  return cwd;
}
const options = {taskId: 'task-1', files, sourceHashes};
test('applies bound replacement and absent-file creation atomically with preserved modes', t => {
  const cwd = workspace(t), value = proposal();
  value.edits.push({path: 'test/a.test.js', before_sha256: null, content: 'test source'});
  assert.deepEqual(applyEditProposal(cwd, value, options).changedFiles, files);
  assert.equal(fs.readFileSync(path.join(cwd, files[0]), 'utf8'), 'new');
  assert.equal(fs.statSync(path.join(cwd, files[0])).mode & 0o777, 0o751);
  assert.equal(fs.statSync(path.join(cwd, files[1])).mode & 0o777, 0o644);
  assert.deepEqual(fs.readdirSync(path.join(cwd, 'src')), ['a.js']);
  assert.deepEqual(fs.readdirSync(path.join(cwd, 'test')), ['a.test.js']);
});
test('validates every binding before the first write and rejects symlink parents and created absent targets', t => {
  const cwd = workspace(t), value = proposal();
  value.edits.push({path: 'test/a.test.js', before_sha256: null, content: 'test source'});
  fs.writeFileSync(path.join(cwd, files[1]), 'another writer');
  assert.throws(() => applyEditProposal(cwd, value, options), /EDIT_SOURCE_MISMATCH/);
  assert.equal(fs.readFileSync(path.join(cwd, files[0]), 'utf8'), 'old');
  fs.rmSync(path.join(cwd, 'test'), {recursive: true});fs.symlinkSync(path.join(cwd, 'src'), path.join(cwd, 'test'));
  assert.throws(() => applyEditProposal(cwd, value, options), /INVALID_EDIT_PARENT/);
  assert.equal(fs.readFileSync(path.join(cwd, files[0]), 'utf8'), 'old');
});
test('best-effort rollback restores earlier replacements after later publication fails', t => {
  const cwd = workspace(t), value = proposal();
  value.edits.push({path: 'test/a.test.js', before_sha256: null, content: 'test source'});
  const original = fs.linkSync;fs.linkSync = () => { throw new Error('simulated publication failure'); };
  try { assert.throws(() => applyEditProposal(cwd, value, options), error =>
    error.code === 'EDIT_APPLY_FAILED' && error.mutationState === 'unknown' && error.rollbackComplete === true); }
  finally { fs.linkSync = original; }
  assert.equal(fs.readFileSync(path.join(cwd, files[0]), 'utf8'), 'old');
  assert.equal(fs.statSync(path.join(cwd, files[0])).mode & 0o777, 0o751);
  assert.equal(fs.existsSync(path.join(cwd, files[1])), false);
  assert.deepEqual(fs.readdirSync(path.join(cwd, 'src')), ['a.js']);
  assert.deepEqual(fs.readdirSync(path.join(cwd, 'test')), []);
});
test('serialized envelope overhead and malformed Unicode cannot bypass the result bound', () => {
  const value = proposal();const size = Buffer.byteLength(JSON.stringify(value));
  assert.throws(() => validateEditProposal(value, {...options, maxBytes: size - 1}), /EDIT_SIZE_EXCEEDED/);
  value.edits[0].content = '\ud800';assert.throws(() => validateEditProposal(value, options), /INVALID_EDIT/);
});
