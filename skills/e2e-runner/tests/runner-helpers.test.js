'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const expectedEvaluator = path.resolve(__dirname, '../scripts/evaluate-expected.js');
const orphanAudit = path.resolve(__dirname, '../scripts/audit-orphans.js');

function workspace(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vulpora-runner-helpers-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  return root;
}

function evaluate(root, expected, status, body, vars) {
  const bodyPath = path.join(root, 'body.json');
  fs.writeFileSync(bodyPath, typeof body === 'string' ? body : JSON.stringify(body));
  const args = [expectedEvaluator, expected, status, bodyPath];
  if (vars) {
    fs.writeFileSync(path.join(root, 'vars.json'), JSON.stringify(vars));
    args.push('--vars', path.join(root, 'vars.json'));
  }
  const result = spawnSync(process.execPath, args, {encoding: 'utf8'});
  return {...result, output: result.status === 64 ? null : JSON.parse(result.stdout)};
}

test('Expected assertions catch a business-rule violation that the status code hides', t => {
  const root = workspace(t);
  const expected = '`200 OK`; assert $.refreshTargets contains "SITE-A"; assert $.refreshTargets excludes "SITE-B"';
  assert.equal(evaluate(root, expected, '200', {refreshTargets: ['SITE-A']}).status, 0);
  const violated = evaluate(root, expected, '200', {refreshTargets: ['SITE-A', 'SITE-B']});
  assert.equal(violated.status, 1);
  assert.equal(violated.output.outcome, 'FAIL');
  assert.deepEqual(violated.output.assertions.map(result => [result.kind, result.passed]), [['status', true], ['body', true], ['body', false]]);
});

test('Expected assertions fail closed on missing values, unparseable bodies, and status mismatches', t => {
  const root = workspace(t);
  assert.equal(evaluate(root, '200; assert $.items excludes "X"', '200', {}).status, 1);
  assert.equal(evaluate(root, '200; assert $.items non-empty', '200', '<html>').output.bodyParsed, false);
  assert.deepEqual(evaluate(root, '`204`', '404', {}).output.assertions, [{kind: 'status', expected: '204', actual: '404', passed: false}]);
  const nothing = evaluate(root, 'response is fast', '200', {});
  assert.equal(nothing.status, 1);
  assert.equal(nothing.output.outcome, 'NO_ASSERTION');
  assert.equal(evaluate(root, '200; assert $.id absent; assert $.items[0].name == "a"', '200', {items: [{name: 'a'}]}).status, 0);
});

test('Projections and array literals assert whole business-rule sets', t => {
  const root = workspace(t);
  const body = {refreshTargets: [{site: 'SITE-A'}, {site: 'ALL'}]};
  assert.equal(evaluate(root, '200; assert $.refreshTargets[*].site == ["SITE-A","ALL"]', '200', body).status, 0);
  assert.equal(evaluate(root, '200; assert $.refreshTargets[*].site excludes "SITE-B"', '200', body).status, 0);
  assert.equal(evaluate(root, '200; assert $.refreshTargets[*].site == ["SITE-A"]', '200', body).status, 1);
  assert.equal(evaluate(root, '200; assert $.refreshTargets[*].missing exists', '200', body).status, 1);
});

test('Runner and author share one assertion grammar', () => {
  const author = fs.readFileSync(path.resolve(__dirname, '../../e2e-scenario-author/scripts/validate-catalog.js'), 'utf8');
  const {ASSERTION} = require('../scripts/expected-assertions');
  const authorPattern = new Function(`${author.match(/const SCALAR = [^\n]+\n/)[0]}${author.match(/const LITERAL = [^\n]+\n/)[0]}${author.match(/const ASSERTION = [^\n]+\n/)[0]}return ASSERTION;`)();
  for (const clause of ['assert $.a == 1', 'assert $.a[*].b == ["x", 2]', 'assert $.a contains {{prev.ID}}', 'assert $.a non-empty',
    'assert $.a ~= 1', 'assert a == 1', 'assert $.a == [[1]]', 'assert $.a == x']) {
    assert.equal(authorPattern.test(clause), ASSERTION.test(clause), clause);
  }
});

test('Expected placeholders resolve from captures and missing captures are input errors', t => {
  const root = workspace(t);
  assert.equal(evaluate(root, '200; assert $.id == {{prev.ID}}', '200', {id: 7}, {'prev.ID': 7}).status, 0);
  const missing = evaluate(root, '200; assert $.id == {{prev.ID}}', '200', {id: 7}, {});
  assert.equal(missing.status, 64);
  assert.match(missing.stderr, /missing-capture: prev\.ID/);
  assert.equal(evaluate(root, '200; assert $.id ~= 7', '200', {id: 7}).status, 64);
});

function fakeDocker(root, sequence) {
  // Each `docker ps` call consumes the next line of container IDs.
  const bin = path.join(root, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(root, 'sequence.json'), JSON.stringify(sequence));
  fs.writeFileSync(path.join(bin, 'docker'), `#!/usr/bin/env node
const fs = require('node:fs');
const file = ${JSON.stringify(path.join(root, 'sequence.json'))};
const sequence = JSON.parse(fs.readFileSync(file, 'utf8'));
const next = sequence.length > 1 ? sequence.shift() : sequence[0];
fs.writeFileSync(file, JSON.stringify(sequence));
if (next === 'error') { process.stderr.write('Cannot connect to the Docker daemon'); process.exit(1); }
process.stdout.write(next.map(id => id + '\\n').join(''));
`, {mode: 0o755});
  return {...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`};
}

function audit(env, ...args) {
  const result = spawnSync(process.execPath, [orphanAudit, ...args], {encoding: 'utf8', env});
  return {...result, output: result.status === 64 ? null : JSON.parse(result.stdout)};
}

test('Orphan audit waits for asynchronous reaping instead of reporting a false orphan', t => {
  const root = workspace(t);
  const env = fakeDocker(root, [['a', 'b'], ['b'], []]);
  const result = audit(env, 'audit', '--label', 'run=1', '--grace-ms', '5000', '--interval-ms', '1');
  assert.equal(result.status, 0);
  assert.deepEqual(result.output.attempts.map(attempt => attempt.remaining), [2, 1, 0]);
});

test('Orphan audit fails after the grace window and never passes on docker errors', t => {
  const root = workspace(t);
  const stuck = audit(fakeDocker(root, [['a']]), 'audit', '--label', 'run=1', '--grace-ms', '20', '--interval-ms', '5');
  assert.equal(stuck.status, 1);
  assert.deepEqual(stuck.output.remaining, ['a']);
  const other = workspace(t);
  const broken = audit(fakeDocker(other, ['error']), 'audit', '--label', 'run=1', '--grace-ms', '0');
  assert.equal(broken.output.status, 'FAIL');
  assert.match(broken.output.error, /Docker daemon/);
});

test('Orphan audit ignores containers that existed before the run', t => {
  const root = workspace(t);
  const env = fakeDocker(root, [['pre'], ['pre']]);
  const snapshot = spawnSync(process.execPath, [orphanAudit, 'snapshot', '--label', 'run=1'], {encoding: 'utf8', env});
  assert.equal(snapshot.status, 0);
  fs.writeFileSync(path.join(root, 'baseline.json'), snapshot.stdout);
  const result = audit(env, 'audit', '--label', 'run=1', '--baseline', path.join(root, 'baseline.json'), '--grace-ms', '0');
  assert.equal(result.status, 0);
  assert.equal(result.output.baselineCount, 1);
  assert.equal(audit(env, 'audit', '--label', 'run=2', '--baseline', path.join(root, 'baseline.json')).status, 64);
});

test('Output roots that overlap tracked files are refused before a run', t => {
  const root = workspace(t);
  spawnSync('git', ['-C', root, 'init', '-q']);
  fs.mkdirSync(path.join(root, 'test-report'));
  fs.writeFileSync(path.join(root, 'test-report', 'build.gradle.kts'), '');
  spawnSync('git', ['-C', root, 'add', '.']);
  const check = (out) => spawnSync(process.execPath, [path.resolve(__dirname, '../scripts/check-output-root.js'), root, out], {encoding: 'utf8'});
  const collision = check('test-report/e2e');
  assert.equal(collision.status, 1);
  assert.deepEqual(JSON.parse(collision.stdout).overlaps, ['test-report/build.gradle.kts']);
  assert.equal(check('build/e2e-report').status, 0);
  assert.equal(check('../outside').status, 1);
});
