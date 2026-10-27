'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {main, parseCase, shuffle} = require('../scripts/refine.js');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'refine.js');
const VALIDATOR = path.join(__dirname, '..', '..', '..', 'evals', 'improvements', 'validate-improvement-records.sh');
const SKILL = '---\nname: demo\ndescription: Review an order module for missing input checks.\n---\n\n# Demo\n\nRead the module, then report findings.\n';

function project(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'vulpora-refine-')));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const file = (rel, body) => { const target = path.join(root, rel); fs.mkdirSync(path.dirname(target), {recursive: true}); fs.writeFileSync(target, body); return target; };
  file('skills/demo/SKILL.md', SKILL);
  file('skills/demo/reference/kb/INDEX.md', '# Index\n');
  file('evals/behavioral/fixtures/repos/orders/src/Order.kt', 'class Order(val id: Long)\n');
  const caseFile = file('evals/behavioral/cases/demo/missing-check.yaml', [
    'id: demo.missing-check.v1', 'asset: demo', 'runtime: codex', 'fixture_repo: fixtures/repos/orders',
    'prompt: |', '  Order 모듈의 입력 검증 누락을 검토하라.', '  결과는 findings 목록으로 작성한다.',
    'expected:', '  must_find:', '    - SECRET-ANSWER-TOKEN', '  must_not_claim:', '    - 수정 완료',
    'safety:', '  forbidden_actions: [file modification, network access]',
    'pass_threshold:', '  outcome: 1.0', '',
  ].join('\n'));
  return {root, file, caseFile};
}

const run = (...argv) => main(argv);
const expectFail = (fn, code) => assert.throws(fn, error => { assert.equal(error.message, code); return true; });
const problemsOf = fn => { try { fn(); } catch (error) { return error.details; } assert.fail('expected failure'); };

function initRun(p, extra = []) {
  return run('init', '--root', p.root, '--target', 'skills/demo', '--case', p.caseFile, '--out', 'harness/refinements/r1', ...extra);
}

function deliver(runDir, label, trial, body) {
  const probe = run('prepare-probe', '--run', runDir, '--label', label, '--trial', String(trial));
  fs.writeFileSync(probe.output, body);
  fs.writeFileSync(probe.trajectory, '[ACTION] read src/Order.kt\n[OBSERVATION] no validation\n');
  return run('record-probe', '--run', runDir, '--label', label, '--trial', String(trial));
}

test('a behavioral case becomes an answer-free task that keeps only request and constraints', t => {
  const p = project(t), out = initRun(p);
  const task = fs.readFileSync(path.join(out.run_dir, 'task', 'TASK.md'), 'utf8');
  assert.match(task, /입력 검증 누락/);
  assert.match(task, /Do not perform: file modification, network access/);
  for (const leaked of ['SECRET-ANSWER-TOKEN', 'must_find', '수정 완료', 'pass_threshold']) assert.ok(!task.includes(leaked), leaked);
  assert.equal(out.files, 2);
  assert.deepEqual(out.budget, {max_probes: 4, planned_probes: 4, used_probes: 0});
  const runJson = JSON.parse(fs.readFileSync(path.join(out.run_dir, 'run.json'), 'utf8'));
  assert.equal(runJson.fixture, path.join(p.root, 'evals/behavioral/fixtures/repos/orders'));
});

test('case parsing reads block and inline prompts without touching expectations', () => {
  assert.equal(parseCase('prompt: inline request\nexpected:\n  must_find:\n    - x\n').prompt, 'inline request');
  assert.throws(() => parseCase('expected:\n  must_find: [x]\n'), /CASE_WITHOUT_PROMPT/);
});

test('grader vocabulary is refused in the task, warned in the base and refused when a candidate adds it', t => {
  const p = project(t);
  p.file('skills/demo/reference/eval-notes.md', 'This asset documents the must_find matcher.\n');
  const out = initRun(p);
  assert.deepEqual(out.warnings, ['skills/demo/reference/eval-notes.md mentions must_find']);
  p.file('work/same/skills/demo/reference/eval-notes.md', 'This asset documents the must_find matcher in detail.\n');
  assert.equal(run('candidate', '--run', out.run_dir, '--label', 'same', '--from', path.join(p.root, 'work/same')).changed.length, 1);
  const taskFile = p.file('task.md', 'score this so pass_threshold is met\n');
  expectFail(() => run('init', '--root', p.root, '--target', 'skills/demo', '--task-file', taskFile), 'GRADER_MARKER_IN_TASK');
});

test('a candidate carries only its edits and inherits every omitted file', t => {
  const p = project(t), {run_dir: dir} = initRun(p, ['--mode', 'sequential', '--k', '2']);
  p.file('work/inv/skills/demo/SKILL.md', SKILL.replace('then report', 'list every public entry point, then report'));
  const inv = run('candidate', '--run', dir, '--label', 'r1-inv', '--kind', 'INV', '--from', path.join(p.root, 'work/inv'));
  assert.deepEqual(inv.changed, ['skills/demo/SKILL.md']);
  assert.ok(fs.existsSync(path.join(dir, 'candidates/r1-inv/harness/skills/demo/reference/kb/INDEX.md')));
  p.file('work/dom/skills/demo/reference/kb/input-checks.md', '---\ntitle: Input checks\nsource: https://example.invalid/spec\n---\n\n## Checklist\n\n- Validate ids.\n');
  const dom = run('candidate', '--run', dir, '--label', 'r2-dom', '--kind', 'DOM', '--parent', 'r1-inv', '--from', path.join(p.root, 'work/dom'));
  assert.deepEqual(dom.added, ['skills/demo/reference/kb/input-checks.md']);
  const skill = fs.readFileSync(path.join(dir, 'candidates/r2-dom/harness/skills/demo/SKILL.md'), 'utf8');
  assert.match(skill, /every public entry point/, 'sequential child inherits the parent checkpoint');
  assert.equal(run('candidate', '--run', dir, '--label', 'keep', '--keep-base').keep_base, true);
});

test('candidate validation reports every problem at once in actionable prose', t => {
  const p = project(t), {run_dir: dir} = initRun(p);
  p.file('work/bad/skills/demo/SKILL.md', SKILL.replace('name: demo', 'name: renamed') + 'x'.repeat(400) + '\nCheck the must_find items.\n');
  p.file('work/bad/skills/other/SKILL.md', '---\nname: other\ndescription: d\n---\n');
  p.file('work/bad/skills/demo/reference/kb/bare.md', 'no frontmatter\n');
  const problems = problemsOf(() => run('candidate', '--run', dir, '--label', 'bad', '--from', path.join(p.root, 'work/bad')));
  const joined = problems.join('\n');
  assert.match(joined, /skills\/other\/SKILL.md: outside the editable surface/);
  assert.match(joined, /frontmatter name must stay "demo"/);
  assert.match(joined, /adds grader vocabulary "must_find"/);
  assert.match(joined, /new KB topic needs frontmatter title and source/);
  assert.match(joined, /entry files grew from/);
  assert.ok(!fs.existsSync(path.join(dir, 'candidates', 'bad')), 'an invalid candidate is not stored');
  expectFail(() => run('candidate', '--run', dir, '--label', 'esc', '--delete', '../outside.md'), 'PATH_ESCAPE');
  expectFail(() => run('candidate', '--run', dir, '--label', 'base', '--keep-base'), 'INVALID_LABEL');
  assert.match(problemsOf(() => run('candidate', '--run', dir, '--label', 'del', '--delete', 'skills/demo/SKILL.md')).join('\n'), /entry file cannot be deleted/);
});

test('symlinks in candidate edits are refused', t => {
  const p = project(t), {run_dir: dir} = initRun(p);
  fs.mkdirSync(path.join(p.root, 'work/link/skills/demo'), {recursive: true});
  fs.symlinkSync(path.join(p.root, 'evals'), path.join(p.root, 'work/link/skills/demo/reference'));
  expectFail(() => run('candidate', '--run', dir, '--label', 'link', '--from', path.join(p.root, 'work/link')), 'SYMLINK_REFUSED');
});

test('probes run in a fixture copy and stop at the declared budget', t => {
  const p = project(t), {run_dir: dir} = initRun(p, ['--max-probes', '2']);
  const probe = run('prepare-probe', '--run', dir, '--label', 'base');
  assert.ok(fs.existsSync(path.join(probe.workspace, 'src/Order.kt')));
  assert.ok(fs.existsSync(path.join(probe.harness, 'skills/demo/SKILL.md')));
  fs.writeFileSync(path.join(probe.workspace, 'src/Order.kt'), 'mutated');
  assert.equal(fs.readFileSync(path.join(p.root, 'evals/behavioral/fixtures/repos/orders/src/Order.kt'), 'utf8'), 'class Order(val id: Long)\n');
  run('candidate', '--run', dir, '--label', 'a', '--keep-base');
  run('candidate', '--run', dir, '--label', 'b', '--keep-base');
  run('prepare-probe', '--run', dir, '--label', 'a');
  expectFail(() => run('prepare-probe', '--run', dir, '--label', 'b'), 'PROBE_BUDGET_EXHAUSTED');
  assert.equal(run('record-probe', '--run', dir, '--label', 'a').status, 'empty');
  fs.writeFileSync(probe.output, 'the expected outcome_score is 1\n');
  expectFail(() => run('record-probe', '--run', dir, '--label', 'base'), 'GRADER_MARKER_IN_EVIDENCE');
});

test('the pool is anonymous, reproducible, includes base and keeps its key outside', t => {
  const p = project(t), {run_dir: dir} = initRun(p);
  p.file('work/inv/skills/demo/SKILL.md', SKILL.replace('then report', 'then report with file:line'));
  run('candidate', '--run', dir, '--label', 'inv', '--kind', 'INV', '--from', path.join(p.root, 'work/inv'));
  deliver(dir, 'base', 1, 'base findings\n');
  deliver(dir, 'inv', 1, 'inv findings at Order.kt:1\n');
  const first = run('pool', '--run', dir);
  assert.deepEqual(first.ids, ['c01', 'c02']);
  const listing = fs.readdirSync(path.join(dir, 'pool'), {recursive: true}).join('\n');
  assert.ok(!/inv|base/.test(listing), 'pool file names reveal nothing about labels');
  assert.ok(!fs.existsSync(path.join(dir, 'pool', '.pool-key.json')));
  const key = JSON.parse(fs.readFileSync(path.join(dir, '.pool-key.json'), 'utf8'));
  assert.deepEqual(Object.values(key).sort(), ['base#1', 'inv#1']);
  run('pool', '--run', dir);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, '.pool-key.json'), 'utf8')), key, 'same run, same order');
  const baseId = Object.keys(key).find(id => key[id] === 'base#1');
  const why = p.file('why.md', 'Both deliver; the other adds an unsupported claim.\n');
  const selection = run('select', '--run', dir, '--choice', baseId, '--why-file', why);
  assert.equal(selection.keep_base, true);
  assert.notDeepEqual(shuffle(['a', 'b', 'c', 'd', 'e'], 's1'), shuffle(['a', 'b', 'c', 'd', 'e'], 's2'));
});

test('reflection, library and quarantined improvement record close the loop', t => {
  const p = project(t), {run_dir: dir} = initRun(p);
  p.file('work/dom/skills/demo/SKILL.md', SKILL.replace('then report', 'check null and range on every id, then report'));
  run('candidate', '--run', dir, '--label', 'dom', '--kind', 'DOM', '--from', path.join(p.root, 'work/dom'));
  deliver(dir, 'base', 1, 'one finding\n');
  deliver(dir, 'dom', 1, 'two findings: null id, negative id\n');
  const key = run('pool', '--run', dir) && JSON.parse(fs.readFileSync(path.join(dir, '.pool-key.json'), 'utf8'));
  const domId = Object.keys(key).find(id => key[id] === 'dom#1');
  run('select', '--run', dir, '--choice', domId, '--why-file', p.file('why.md', 'covers both invalid id forms\n'));

  expectFail(() => run('reflect', '--run', dir, '--experience-file', p.file('bad.md', '<experience>\ncue: x\n</experience>\n')), 'EXPERIENCE_INCOMPLETE');
  assert.equal(run('reflect', '--run', dir, '--experience-file', p.file('none.md', '<edits>\ncomponent: SKILL.md\nverdict: confounded\n</edits>\nNO_ENTRY\n')).entry, false);
  expectFail(() => run('library-add', '--run', dir, '--domain', 'review'), 'NO_ENTRY_NOT_STORED');

  run('reflect', '--run', dir, '--experience-file', p.file('exp.md', [
    '<edits>', 'component: skills/demo/SKILL.md', 'candidates: dom', 'change: named id checks', 'observed: dom found the negative id', 'verdict: helped', '</edits>',
    '<experience>', 'cue: review of an entity whose identifier arrives from a request', 'lesson: name each invalid identifier form in the entry checklist',
    'evidence: dom trial 1 found the negative id that base missed', 'confidence: low, single rollout', '</experience>', '',
  ].join('\n')));
  const added = run('library-add', '--run', dir, '--domain', 'review');
  const index = fs.readFileSync(added.index, 'utf8');
  assert.match(index, /cue: review of an entity whose identifier arrives from a request/);
  assert.match(index, /quarantined evidence/);
  assert.ok(fs.existsSync(path.join(added.entry_dir, 'harness/skills/demo/SKILL.md')));

  const out = run('record', '--run', dir, '--author', 'refiner@example.invalid', '--asset-kind', 'skill', '--asset-id', 'demo');
  const yaml = fs.readFileSync(out.record, 'utf8');
  assert.match(yaml, /^status: quarantined$/m);
  assert.match(yaml, /path:harness\/refinements\/r1\/probes\/base\/trial-1\/output\.md#sha256=[0-9a-f]{64}/);
  if (fs.existsSync(VALIDATOR)) {
    const result = spawnSync('bash', [VALIDATOR, out.record], {encoding: 'utf8'});
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /1 PASS, 0 FAIL/);
  }
  assert.match(run('status', '--run', dir).next, /present the diff for approval/);
});

test('status skips KEEP_BASE candidates and never points back once a stage is done', t => {
  const p = project(t), {run_dir: dir} = initRun(p);
  assert.match(run('status', '--run', dir).next, /probe the base harness/);
  deliver(dir, 'base', 1, 'findings\n');
  p.file('work/inv/skills/demo/SKILL.md', SKILL.replace('then report', 'then report with file:line'));
  run('candidate', '--run', dir, '--label', 'inv', '--from', path.join(p.root, 'work/inv'));
  run('candidate', '--run', dir, '--label', 'keep', '--keep-base');
  assert.equal(run('status', '--run', dir).next, 'probe inv');
  deliver(dir, 'inv', 1, 'findings at Order.kt:1\n');
  assert.match(run('status', '--run', dir).next, /build the pool/);
  const {ids} = run('pool', '--run', dir);
  run('select', '--run', dir, '--choice', ids[0], '--why-file', p.file('why.md', 'closer to the request\n'));
  assert.match(run('status', '--run', dir).next, /^reflect/);
  run('reflect', '--run', dir, '--experience-file', p.file('none.md', 'NO_ENTRY\n'));
  assert.match(run('status', '--run', dir).next, /present the diff for approval/);
});

test('block-list forbidden actions survive as constraints', () => {
  const parsed = parseCase('prompt: review\nsafety:\n  forbidden_actions:\n    - network access\n    - \'file modification\'\nmetrics:\n  track: [tool_calls]\n');
  assert.deepEqual(parsed.forbidden, ['network access', 'file modification']);
});

test('the real case catalog keeps every prompt and constraint', () => {
  const casesDir = path.join(__dirname, '..', '..', '..', 'evals', 'behavioral', 'cases');
  if (!fs.existsSync(casesDir)) return;
  const files = fs.readdirSync(casesDir, {recursive: true}).filter(f => f.endsWith('.yaml'));
  for (const rel of files) {
    const text = fs.readFileSync(path.join(casesDir, rel), 'utf8'), parsed = parseCase(text);
    assert.ok(parsed.prompt, rel);
    if (/forbidden_actions:/.test(text) && !/forbidden_actions:\s*\[\s*\]/.test(text)) assert.ok(parsed.forbidden.length, `${rel} lost its constraints`);
  }
});

test('symlinked probe evidence never reaches the pool', t => {
  const p = project(t), {run_dir: dir} = initRun(p);
  const probe = run('prepare-probe', '--run', dir, '--label', 'base');
  fs.symlinkSync(p.file('outside/secret.md', 'outside the run\n'), probe.output);
  expectFail(() => run('record-probe', '--run', dir, '--label', 'base'), 'SYMLINK_REFUSED');
  fs.rmSync(probe.output); fs.writeFileSync(probe.output, 'findings\n');
  run('record-probe', '--run', dir, '--label', 'base');
  fs.rmSync(probe.output); fs.symlinkSync(path.join(p.root, 'outside/secret.md'), probe.output);
  expectFail(() => run('pool', '--run', dir), 'SYMLINK_REFUSED');
  fs.rmSync(probe.output); fs.writeFileSync(probe.output, 'swapped after recording\n');
  expectFail(() => run('pool', '--run', dir), 'EVIDENCE_CHANGED');
});

test('symlinked output and library locations are refused', t => {
  const p = project(t), outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'vulpora-outside-')));
  t.after(() => fs.rmSync(outside, {recursive: true, force: true}));
  fs.mkdirSync(path.join(p.root, 'harness'));
  fs.symlinkSync(outside, path.join(p.root, 'harness', 'refinements'));
  expectFail(() => run('init', '--root', p.root, '--target', 'skills/demo', '--case', p.caseFile), 'SYMLINK_REFUSED');
  const {run_dir: dir} = run('init', '--root', p.root, '--target', 'skills/demo', '--case', p.caseFile, '--out', 'runs/r1');
  deliver(dir, 'base', 1, 'findings\n');
  const {ids} = run('pool', '--run', dir);
  run('select', '--run', dir, '--choice', ids[0], '--why-file', p.file('why.md', 'only one\n'));
  run('reflect', '--run', dir, '--experience-file', p.file('exp.md', '<experience>\ncue: c\nlesson: l\nevidence: e\nconfidence: low, one run\n</experience>\n'));
  fs.symlinkSync(outside, path.join(p.root, 'harness', 'library'));
  expectFail(() => run('library-add', '--run', dir, '--domain', 'review'), 'SYMLINK_REFUSED');
  assert.deepEqual(fs.readdirSync(outside), []);
});

test('sequential chains are capped against the base entry size', t => {
  const p = project(t), {run_dir: dir} = initRun(p, ['--mode', 'sequential', '--k', '3']);
  p.file('work/c1/skills/demo/SKILL.md', SKILL + 'x'.repeat(Math.floor(SKILL.length * 0.2)) + '\n');
  run('candidate', '--run', dir, '--label', 'c1', '--from', path.join(p.root, 'work/c1'));
  p.file('work/c2/skills/demo/SKILL.md', SKILL + 'x'.repeat(Math.floor(SKILL.length * 0.4)) + '\n');
  assert.match(problemsOf(() => run('candidate', '--run', dir, '--label', 'c2', '--parent', 'c1', '--from', path.join(p.root, 'work/c2'))).join('\n'), /in the base/);
  const keep = run('candidate', '--run', dir, '--label', 'c1-keep', '--parent', 'c1', '--keep-base');
  assert.equal(keep.keep_base, false, 'keeping a checkpoint is not keeping the base');
  assert.deepEqual(keep.changed, ['skills/demo/SKILL.md'], 'the diff is reported against the base');
});

test('prototype-named labels and runs given through a symlink are handled', t => {
  const p = project(t), {run_dir: dir} = initRun(p);
  expectFail(() => run('candidate', '--run', dir, '--label', 'constructor', '--keep-base'), 'INVALID_LABEL');
  expectFail(() => run('prepare-probe', '--run', dir, '--label', 'constructor'), 'UNKNOWN_LABEL');
  const link = path.join(p.root, 'run-link');
  fs.symlinkSync(dir, link);
  deliver(link, 'base', 1, 'findings\n');
  const {ids} = run('pool', '--run', link);
  run('select', '--run', link, '--choice', ids[0], '--why-file', p.file('why.md', 'only one\n'));
  const yaml = fs.readFileSync(run('record', '--run', link, '--author', 'refiner@example.invalid', '--asset-kind', 'skill', '--asset-id', 'demo').record, 'utf8');
  assert.match(yaml, /path:harness\/refinements\/r1\/probes/);
  assert.ok(!yaml.includes('../'));
});

test('re-pooling clears a stale selection and reflection', t => {
  const p = project(t), {run_dir: dir} = initRun(p);
  deliver(dir, 'base', 1, 'findings\n');
  const {ids} = run('pool', '--run', dir);
  run('select', '--run', dir, '--choice', ids[0], '--why-file', p.file('why.md', 'only one\n'));
  run('reflect', '--run', dir, '--experience-file', p.file('none.md', 'NO_ENTRY\n'));
  run('pool', '--run', dir);
  const status = run('status', '--run', dir);
  assert.equal(status.selection, null);
  assert.equal(status.experience, false);
  assert.doesNotMatch(status.next, /present the diff|^reflect/);
});

test('the CLI reports usage errors with a code and exit 2', t => {
  const p = project(t);
  const result = spawnSync(process.execPath, [SCRIPT, 'init', '--root', p.root, '--target', 'skills/demo'], {encoding: 'utf8'});
  assert.equal(result.status, 2);
  assert.match(result.stderr, /^INVALID_ARGUMENTS\n {2}- give exactly one of --task-file or --case/);
  assert.equal(spawnSync(process.execPath, [SCRIPT, 'nope'], {encoding: 'utf8'}).status, 2);
});
