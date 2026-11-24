'use strict';

// review-veto-gate tests: synthetic ledgers only. Nothing here runs a reviewer, a build, or an application.
// S-numbers follow the design's R1 test table.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const scripts = path.resolve(__dirname, '../scripts');
const run = (name, ...args) => spawnSync(process.execPath, [path.join(scripts, name), ...args], {encoding: 'utf8'});
const {buildLedger} = require(path.join(scripts, 'record-review-ledger.js'));
const {evaluate} = require(path.join(scripts, 'evaluate-consensus-veto.js'));
const {selectTasks} = require(path.join(scripts, 'select-repro-tasks.js'));
const {scoreRun} = require(path.join(scripts, 'score-calibration.js'));
const seededRoot = path.resolve(__dirname, '../../../evals/calibration/seeded-defects');

const tmp = (t) => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vulpora-veto-')); t.after(() => fs.rmSync(dir, {recursive: true, force: true})); return dir; };
const write = (dir, name, value) => { const file = path.join(dir, name); fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2)); return file; };

const RISKY_DIFF = `diff --git a/src/main/java/example/StockService.java b/src/main/java/example/StockService.java
--- a/src/main/java/example/StockService.java
+++ b/src/main/java/example/StockService.java
@@ -1,3 +1,4 @@
-    @Transactional(isolation = Isolation.SERIALIZABLE)
+    @Transactional(isolation = Isolation.READ_COMMITTED)
+    // changed
`;
const diffOfSize = (lines) => `diff --git a/src/main/java/example/Big.java b/src/main/java/example/Big.java\n--- a/src/main/java/example/Big.java\n+++ b/src/main/java/example/Big.java\n@@ -0,0 +1 @@\n+    @Transactional\n${'+int x;\n'.repeat(lines)}`;

const VALID_CALIBRATION = {schema: 'vulpora.calibration-status/v1', tiers: {concurrency: {state: 'valid'}, authorization: {state: 'valid'}}};

function lane(id, name, extra = {}) {
  return {id, name, status: 'COMPLETED', requestedModel: 'standard', observedModel: 'standard', evidenceBundleSha256: `sha-${id}`, forkTurns: 'none', ...extra};
}
const where = {path: 'src/main/java/example/StockService.java', line: 12, symbol: 'reserve'};
function finding(id, laneId, extra = {}) {
  return {id, lane: laneId, location: where, cause_key: 'lost-update', severity: 'HIGH', confidence: 'inferred', claim: 'read-modify-write without a lock',
    contract_source: {kind: 'acceptance', ref: 'AC-4 stock never goes negative'}, repro_attempt: 'NOT_RUN: not-executable-kind', ...extra};
}
function result({lanes, findings, refutations = [], verdict = 'WARNING'}) {
  return {schema: 'vulpora.review-workflow-result/v1', workflow: 'backend-code-review-workflow', revision: 'abc123', baseline: 'main', verdict, lanes, findings, refutations};
}
const threeLaneResult = () => result({
  lanes: [lane('L1', 'java-reviewer'), lane('L2', 'security-auditor'), lane('L3', 'repro-refuter')],
  findings: [finding('F1', 'L1'), finding('F2', 'L2')],
  refutations: [{lane: 'L3', finding: 'F1', outcome: 'NOT_REFUTED', basis: 'the lock was removed in the diff at line 12'}],
});
const ledgerOf = (input, diff = RISKY_DIFF) => buildLedger(input, diff);
const evalLedger = (ledger, calibration = VALID_CALIBRATION) => evaluate(ledger, calibration);

test('S1: three distinct lanes with a standing refuter, contract source, honest repro record, and a valid tier make a shadow candidate; the verdict is untouched', () => {
  const out = evalLedger(ledgerOf(threeLaneResult()));
  assert.equal(out.verdictImpact, 'none');
  assert.equal(out.reviewVerdictUnchanged, 'WARNING');
  assert.deepEqual(out.buckets.consensusCandidates, ['G1']);
  assert.equal(out.groups[0].wouldBeVerdictFloor, 'CHANGES_REQUIRED');
  assert.deepEqual(out.groups[0].failedConditions, []);
  assert.deepEqual(out.groups[0].countedLanes.sort(), ['java-reviewer', 'repro-refuter', 'security-auditor']);
});

test('S2: a repeated run or a second persona of one lane is one vote', () => {
  const input = threeLaneResult();
  input.lanes[1] = lane('L2', 'java-reviewer');           // second run of the same lane
  const group = evalLedger(ledgerOf(input)).groups[0];
  assert.equal(group.bucket, 'signals');
  assert.deepEqual(group.failedConditions, ['CV-2']);
});

test('S3: style lanes agreeing do not count as defect lanes', () => {
  const input = result({
    lanes: [lane('L1', 'java-reviewer'), lane('L2', 'oop-design-review'), lane('L3', 'design-pattern-apply'), lane('L4', 'repro-refuter')],
    findings: [finding('F1', 'L1'), finding('F2', 'L2'), finding('F3', 'L3')],
    refutations: [{lane: 'L4', finding: 'F1', outcome: 'NOT_REFUTED', basis: 'confirmed in the diff'}],
  });
  const group = evalLedger(ledgerOf(input)).groups[0];
  assert.deepEqual(group.countedLanes.sort(), ['java-reviewer', 'repro-refuter']);
  assert.deepEqual(group.failedConditions, ['CV-2']);
});

test('S4: a best-practice or missing contract source is not a contract', () => {
  for (const contract of [{kind: 'best-practice', ref: 'effective practice'}, null]) {
    const input = threeLaneResult();
    input.findings[0].contract_source = contract;
    assert.deepEqual(evalLedger(ledgerOf(input)).groups[0].failedConditions, ['CV-5']);
  }
  const low = threeLaneResult();
  low.findings.forEach((entry) => { entry.severity = 'MEDIUM'; });
  assert.deepEqual(evalLedger(ledgerOf(low)).groups[0].failedConditions, ['CV-5']);
});

test('S5: an executable defect that was run and not reproduced, or never attempted, is a signal', () => {
  const notReproduced = threeLaneResult();
  notReproduced.findings.forEach((entry) => { entry.repro_attempt = 'NOT_REPRODUCED'; });
  const group = evalLedger(ledgerOf(notReproduced)).groups[0];
  assert.equal(group.bucket, 'notReproduced');
  assert.deepEqual(group.failedConditions, ['CV-6']);
  const attempted = threeLaneResult();
  attempted.findings.forEach((entry) => { entry.repro_attempt = 'NOT_ATTEMPTED'; });
  assert.deepEqual(evalLedger(ledgerOf(attempted)).groups[0].failedConditions, ['CV-6']);
  const badReason = threeLaneResult();
  badReason.findings.forEach((entry) => { entry.repro_attempt = 'NOT_RUN: too slow'; });
  assert.deepEqual(evalLedger(ledgerOf(badReason)).groups[0].failedConditions, ['CV-6']);
  // a non-executable kind (for example a missing permission check) may be NOT_REPRODUCED without disqualifying
  const authz = threeLaneResult();
  authz.findings.forEach((entry) => { entry.cause_key = 'missing-authz-check'; entry.repro_attempt = 'NOT_REPRODUCED'; });
  const authzDiff = `diff --git a/src/main/java/example/Ctl.java b/src/main/java/example/Ctl.java\n--- a/src/main/java/example/Ctl.java\n+++ b/src/main/java/example/Ctl.java\n@@ -1 +1 @@\n-    @PreAuthorize("hasRole('ADMIN')")\n`;
  assert.deepEqual(evalLedger(ledgerOf(authz, authzDiff), VALID_CALIBRATION).groups[0].failedConditions, []);
});

test('S6: identical evidence bundles, or a forked context, fail CV-4', () => {
  const same = threeLaneResult();
  same.lanes[1].evidenceBundleSha256 = same.lanes[0].evidenceBundleSha256;
  assert.deepEqual(evalLedger(ledgerOf(same)).groups[0].failedConditions, ['CV-4']);
  const forked = threeLaneResult();
  forked.lanes[0].forkTurns = 'all';
  assert.deepEqual(evalLedger(ledgerOf(forked)).groups[0].failedConditions, ['CV-4']);
  const missing = threeLaneResult();
  delete missing.lanes[2].evidenceBundleSha256;
  assert.deepEqual(evalLedger(ledgerOf(missing)).groups[0].failedConditions, ['CV-4']);
});

test('S7: a 900-line production change gets a split-or-human-review signal and no candidate', () => {
  const out = evalLedger(ledgerOf(threeLaneResult(), diffOfSize(900)));
  assert.equal(out.sizeSignal.code, 'SPLIT_OR_HUMAN_REVIEW');
  assert.deepEqual(out.groups[0].failedConditions, ['CV-1']);
  assert.match(evaluate(ledgerOf(threeLaneResult(), diffOfSize(900)), VALID_CALIBRATION).groups[0].conditions['CV-1'].detail, /exceeds 800/);
  // docs-only, test-only, and generated-only changes carry no production lines
  const docsOnly = 'diff --git a/docs/guide.md b/docs/guide.md\n--- a/docs/guide.md\n+++ b/docs/guide.md\n@@ -1 +1 @@\n+@Transactional mention in prose\n';
  assert.deepEqual(evalLedger(ledgerOf(threeLaneResult(), docsOnly)).groups[0].failedConditions.includes('CV-1'), true);
  const noDiff = evalLedger(buildLedger(threeLaneResult(), null));
  assert.ok(noDiff.notes.some((note) => note.startsWith('NO_DIFF')));
});

test('S8: --mode veto is refused, and an unknown mode is a usage error', (t) => {
  const dir = tmp(t);
  const ledger = path.join(dir, 'ledger.json');
  fs.writeFileSync(ledger, JSON.stringify(ledgerOf(threeLaneResult())));
  for (const mode of ['veto', 'enforce']) assert.equal(run('evaluate-consensus-veto.js', '--ledger', ledger, '--mode', mode).status, 64, mode);
  assert.match(run('evaluate-consensus-veto.js', '--ledger', ledger, '--mode', 'veto').stderr, /not available in this version/);
  assert.equal(run('evaluate-consensus-veto.js', '--ledger', ledger).status, 64);
});

test('A refuter that refutes keeps the claim out of the candidates; a refuter without a basis does not stand', () => {
  const refuted = threeLaneResult();
  refuted.refutations[0].outcome = 'REFUTED';
  assert.equal(evalLedger(ledgerOf(refuted)).groups[0].bucket, 'refuted');
  const noBasis = threeLaneResult();
  noBasis.refutations[0].basis = '  ';
  assert.deepEqual(evalLedger(ledgerOf(noBasis)).groups[0].failedConditions.sort(), ['CV-2', 'CV-3']);
});

test('A reproduced finding goes to the reproduction bucket and is never a consensus candidate', () => {
  const input = threeLaneResult();
  input.findings[0].repro_attempt = 'REPRODUCED';
  const out = evalLedger(ledgerOf(input));
  assert.deepEqual(out.buckets.reproduced, ['G1']);
  assert.deepEqual(out.buckets.consensusCandidates, []);
});

test('Calibration state gates CV-7: missing, unmeasured, and demoted tiers are signals', () => {
  assert.deepEqual(evaluate(ledgerOf(threeLaneResult()), null).groups[0].failedConditions, ['CV-7']);
  for (const state of ['unmeasured', 'demoted', 'expired']) {
    assert.deepEqual(evaluate(ledgerOf(threeLaneResult()), {tiers: {concurrency: {state}}}).groups[0].failedConditions, ['CV-7'], state);
  }
});

test('A single reporter in a risk tier is kept as a reproduction-task candidate, never merged into another claim', () => {
  const input = result({lanes: [lane('L1', 'java-reviewer')], findings: [finding('F1', 'L1')]});
  const group = evalLedger(ledgerOf(input)).groups[0];
  assert.equal(group.minority, true);
  assert.equal(group.reproTaskCandidate, true);
  assert.notEqual(group.bucket, 'consensusCandidates');
});

test('A frontier lane that was not available adds no lane to any count and is noted for a person', () => {
  const input = threeLaneResult();
  input.lanes.push({id: 'L9', name: 'security-frontier', status: 'ROUTE_UNAVAILABLE'});
  const out = evalLedger(ledgerOf(input));
  assert.ok(out.notes.some((note) => note.startsWith('ROUTE_UNAVAILABLE: security-frontier')));
  assert.equal(out.groups[0].countedLanes.includes('security-frontier'), false);
});

test('Findings with no cause key never join a consensus group and are listed', () => {
  const input = threeLaneResult();
  delete input.findings[1].cause_key;
  const out = evalLedger(ledgerOf(input));
  assert.ok(out.notes.some((note) => note.startsWith('NO_CAUSE_KEY: F2')));
});

test('Signal mode adds a Markdown bundle that says the verdict is unchanged; shadow mode does not', (t) => {
  const dir = tmp(t);
  const ledger = write(dir, 'ledger.json', ledgerOf(threeLaneResult()));
  const calibration = write(dir, 'calibration.json', VALID_CALIBRATION);
  const signal = run('evaluate-consensus-veto.js', '--ledger', ledger, '--mode', 'signal', '--calibration', calibration, '--markdown-out', path.join(dir, 'signals.md'));
  assert.equal(signal.status, 0, signal.stderr);
  const parsed = JSON.parse(signal.stdout);
  assert.match(parsed.markdown, /observation only; the verdict above is unchanged/);
  assert.match(parsed.markdown, /### Consensus-veto candidates \(shadow\)\n- G1 \[HIGH\]/);
  assert.match(fs.readFileSync(path.join(dir, 'signals.md'), 'utf8'), /"no finding" is not approval/);
  const shadow = JSON.parse(run('evaluate-consensus-veto.js', '--ledger', ledger, '--mode', 'shadow').stdout);
  assert.equal(shadow.markdown, undefined);
  assert.equal(shadow.verdictImpact, 'none');
  // exit code is independent of the review verdict
  for (const verdict of ['BLOCK', 'APPROVE', 'INCOMPLETE']) {
    const l = write(dir, `l-${verdict}.json`, ledgerOf(threeLaneResult()) && {...ledgerOf(threeLaneResult()), reviewVerdict: verdict});
    assert.equal(run('evaluate-consensus-veto.js', '--ledger', l, '--mode', 'shadow').status, 0, verdict);
  }
});

test('The ledger recorder rejects malformed workflow results and records lanes, risk, and size from the diff', (t) => {
  const dir = tmp(t);
  const okInput = write(dir, 'result.json', threeLaneResult());
  const diff = write(dir, 'change.patch', RISKY_DIFF);
  const out = path.join(dir, 'ledger.json');
  assert.equal(run('record-review-ledger.js', '--workflow-result', okInput, '--diff', diff, '--out', out).status, 0);
  const ledger = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal(ledger.verdictImpact, 'none');
  assert.deepEqual(ledger.changes.riskCategories, ['concurrency']);
  assert.deepEqual(ledger.lanes.map((item) => item.kind), ['full-context', 'area', 'refuter']);
  for (const [label, mutate] of [['unknown lane', (r) => { r.findings[0].lane = 'LX'; }], ['bad severity', (r) => { r.findings[0].severity = 'SEVERE'; }],
    ['bad repro', (r) => { r.findings[0].repro_attempt = 'maybe'; }], ['refuter that is not a refuter', (r) => { r.refutations[0].lane = 'L1'; }],
    ['duplicate lane', (r) => { r.lanes.push(lane('L1', 'java-reviewer')); }], ['wrong schema', (r) => { r.schema = 'x'; }]]) {
    const bad = threeLaneResult();
    mutate(bad);
    const result = run('record-review-ledger.js', '--workflow-result', write(dir, 'bad.json', bad), '--out', path.join(dir, 'bad-ledger.json'));
    assert.equal(result.status, 64, label);
  }
});

test('Repro tasks are chosen by rule, capped deterministically, and the overflow is reported as NOT_RUN', () => {
  const input = result({
    lanes: [lane('L1', 'java-reviewer'), lane('L2', 'security-auditor')],
    findings: [
      finding('F1', 'L1', {cause_key: 'lost-update', severity: 'MEDIUM', confidence: 'confirmed', repro_attempt: 'NOT_ATTEMPTED', location: {path: 'A.java', line: 1}}),   // concurrency MEDIUM
      finding('F2', 'L1', {cause_key: 'missing-authz-check', severity: 'CRITICAL', confidence: 'inferred', repro_attempt: 'NOT_ATTEMPTED', location: {path: 'B.java', line: 1}}), // inferred-high
      finding('F3', 'L2', {cause_key: 'deadlock', severity: 'HIGH', confidence: 'inferred', repro_attempt: 'NOT_ATTEMPTED', location: {path: 'C.java', line: 1}}),
      finding('F4', 'L2', {cause_key: 'naming', severity: 'LOW', confidence: 'confirmed', repro_attempt: 'NOT_ATTEMPTED', location: {path: 'D.java', line: 1}}),           // no trigger (and not risky)
      finding('F5', 'L2', {cause_key: 'race-condition', severity: 'HIGH', confidence: 'inferred', repro_attempt: 'REPRODUCED', location: {path: 'E.java', line: 1}}),       // already reproduced
      finding('F6', 'L2', {cause_key: 'race-condition', severity: 'HIGH', confidence: 'inferred', repro_attempt: 'NOT_RUN: budget-cap', location: {path: 'F.java', line: 1}}),
    ],
  });
  const ledger = ledgerOf(input);
  const options = {maxTasks: 2, timeLimitMin: 20, repetitions: 50, threads: 8, approvedCriteria: false, requested: ['F4']};
  const out = selectTasks(ledger, options);
  assert.equal(out.verdictImpact, 'none');
  assert.deepEqual(out.tasks.map((task) => [task.findingIds[0], task.status]), [['F2', 'QUEUED'], ['F3', 'QUEUED'], ['F1', 'NOT_RUN'], ['F4', 'NOT_RUN']]);
  assert.deepEqual(out.tasks.filter((task) => task.status === 'NOT_RUN').map((task) => task.reason), ['budget-cap', 'budget-cap']);
  assert.deepEqual(out.tasks.find((task) => task.findingIds[0] === 'F3').limits, {timeLimitMin: 20, repetitions: 50, threads: 8});
  assert.deepEqual(out.tasks.find((task) => task.findingIds[0] === 'F2').limits.repetitions, 1);
  assert.deepEqual(selectTasks(ledger, options), out, 'deterministic');
  assert.equal(out.tasks[0].roles.specTester, false);
  assert.equal(selectTasks(ledger, {...options, approvedCriteria: true}).tasks[0].roles.specTester, true, 'spec tester only with approved criteria');
});

// ---- calibration ---------------------------------------------------------------------------------------------------------

function calibrationRun({seeded = 20, controls = 40, falseVetoes = 0, missed = 0, wrongTarget = 0, runAt = '2026-11-01T00:00:00Z', versions = {skill: '1'}, recentVetoes}) {
  const cases = [];
  for (let i = 0; i < seeded; i += 1) {
    const candidate = i >= missed;
    cases.push({id: `S${i}`, tier: 'concurrency', kind: 'seeded', candidate, targetsSeeded: candidate && i >= missed + wrongTarget, laneFound: {a: i % 2 === 0, b: i % 2 === 0}});
  }
  for (let i = 0; i < controls; i += 1) cases.push({id: `C${i}`, tier: 'concurrency', kind: 'control', candidate: i < falseVetoes});
  return {schema: 'vulpora.calibration-run/v1', runAt, versions, cases, ...(recentVetoes ? {operations: {recentVetoes}} : {})};
}
const NOW = Date.parse('2026-11-23T00:00:00Z');
const score = (runInput, extra = {}) => scoreRun(runInput, {now: NOW, ...extra}).tiers.concurrency;

test('S9: three false vetoes in 40 controls demote the tier, and the status does not touch a verdict', () => {
  const tier = score(calibrationRun({falseVetoes: 3}));
  assert.equal(tier.state, 'demoted');
  assert.ok(tier.reasons.some((reason) => /false veto rate 7\.5% > 5%/.test(reason)));
  assert.equal(scoreRun(calibrationRun({falseVetoes: 3}), {now: NOW}).appliesToVerdict, false);
  assert.equal(score(calibrationRun({falseVetoes: 2})).state, 'valid', '2 of 40 is exactly 5%, not above it');
});

test('S10: too few samples is unmeasured, never valid', () => {
  assert.equal(score(calibrationRun({seeded: 19})).state, 'unmeasured');
  assert.equal(score(calibrationRun({controls: 39})).state, 'unmeasured');
  assert.equal(score(calibrationRun({seeded: 6, controls: 6})).state, 'unmeasured');
});

test('Precision, miss rate, operational release rate, expiry, and version drift each take a tier out of valid', () => {
  assert.equal(score(calibrationRun({wrongTarget: 5})).state, 'demoted');        // 15 of 20 candidates target the planted defect = 75% < 80%
  assert.match(score(calibrationRun({wrongTarget: 5})).reasons.join(), /veto precision 75\.0% < 80%/);
  assert.equal(score(calibrationRun({missed: 15})).state, 'demoted');             // miss rate 75%
  const released = Array.from({length: 20}, (_, i) => ({releasedAsFalsePositive: i < 7}));
  assert.match(score(calibrationRun({recentVetoes: released})).reasons.join(), /operational release rate 35\.0% > 30%/);
  assert.equal(score(calibrationRun({recentVetoes: released.slice(0, 5)})).state, 'valid', 'fewer than 10 operational vetoes are not enough to judge');
  assert.equal(score(calibrationRun({runAt: '2026-07-01T00:00:00Z'})).state, 'expired');
  assert.equal(score(calibrationRun({}), {currentVersions: {skill: '2'}}).state, 'expired');
  assert.equal(score(calibrationRun({}), {currentVersions: {skill: '1'}}).state, 'valid');
});

test('A demoted tier is restored by a person, not by a good score alone', () => {
  const previous = {tiers: {concurrency: {state: 'demoted'}}};
  const stays = score(calibrationRun({}), {previous});
  assert.equal(stays.state, 'demoted');
  assert.match(stays.reasons.join(), /needs a person's confirmation/);
  const restored = score(calibrationRun({}), {previous, humanConfirmedRestore: true});
  assert.equal(restored.state, 'valid');
  assert.equal(restored.changedFrom, 'demoted');
  assert.equal(score(calibrationRun({falseVetoes: 3}), {previous, humanConfirmedRestore: true}).state, 'demoted', 'confirmation does not override the metrics');
});

test('Pairs of lanes that miss the same planted defects are reported, so they are not counted as independent', () => {
  const tier = score(calibrationRun({}));
  const pair = tier.metrics.commonMisses.find((entry) => entry.lanes.join() === 'a,b');
  assert.equal(pair.commonMissShare, 1);
});

test('score-calibration.js writes the status file and refuses a run of the wrong schema', (t) => {
  const dir = tmp(t);
  const out = path.join(dir, 'status.json');
  const ok = run('score-calibration.js', '--run', write(dir, 'run.json', calibrationRun({})), '--out', out, '--now', '2026-11-23T00:00:00Z');
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(JSON.parse(fs.readFileSync(out, 'utf8')).tiers.concurrency.state, 'valid');
  assert.equal(run('score-calibration.js', '--run', write(dir, 'bad.json', {schema: 'x'}), '--out', out).status, 64);
});

// ---- seeded set v0 -----------------------------------------------------------------------------------------------------

test('The v0 seeded set applies cleanly to its base, and each seeded patch lands in the risk tier it claims', (t) => {
  const manifest = JSON.parse(fs.readFileSync(path.join(seededRoot, 'manifest.json'), 'utf8'));
  assert.equal(manifest.schema, 'vulpora.calibration-set/v0');
  const dir = tmp(t);
  const {parseDiff, riskCategories} = require(path.join(scripts, 'lib.js'));
  const counts = {seeded: 0, control: 0};
  for (const entry of manifest.cases) {
    counts[entry.kind] += 1;
    const work = path.join(dir, entry.id);
    fs.cpSync(path.join(seededRoot, manifest.base), work, {recursive: true});
    const applied = spawnSync('git', ['apply', '--check', path.resolve(seededRoot, entry.patch)], {cwd: work, encoding: 'utf8'});
    assert.equal(applied.status, 0, `${entry.id}: ${applied.stderr}`);
    const categories = riskCategories(parseDiff(fs.readFileSync(path.join(seededRoot, entry.patch), 'utf8')));
    if (entry.kind === 'seeded') {
      assert.ok(categories.includes(entry.tier), `${entry.id} should touch ${entry.tier}, got ${categories}`);
      assert.ok(entry.plantedDefect && entry.plantedDefect.causeKey, `${entry.id} names the planted defect`);
    } else {
      assert.equal(entry.plantedDefect, null);
    }
  }
  // v0 is intentionally below the sample thresholds; the status must say so instead of pretending.
  assert.ok(counts.seeded < 20 && counts.control < 40);
  assert.deepEqual(counts, {seeded: 6, control: 6});
});
