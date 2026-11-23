#!/usr/bin/env node
'use strict';

// Build the CONTRACT.md §5 run result (with RUN-16.7 verdict input) from an execution
// plan and a repository harness's raw observations. The harness only executes requests
// and records what it saw; this script owns every judgement that a hand-written harness
// historically got wrong: status/body comparison, masking, priorities, coverage gaps,
// and writing the `.done` marker last.
//
// usage: assemble-run-result.js <plan.json> <observations.json> <out-dir> [--orphan-audit <audit.json>] [--isolation <isolation.json>] [--mask-key <key>]...
//
// --isolation embeds the check-isolation.js output as `isolation` (RUN-7.1d) and copies the wrapper's receipt next to the
// run result so the validator can re-hash it. A harness `environment` with schemaVersion 2 is normalized to the known endpoint fields.

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {ExpectedError, evaluateExpected} = require('./expected-assertions');
const {maskBody, maskValue} = require('./mask-evidence');

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(64);
}

const args = process.argv.slice(2);
const maskKeys = [];
const positional = [];
let orphanAuditPath = null;
let isolationPath = null;
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === '--mask-key') maskKeys.push(args[++index] || fail('--mask-key requires a value'));
  else if (args[index] === '--orphan-audit') orphanAuditPath = args[++index] || fail('--orphan-audit requires a value');
  else if (args[index] === '--isolation') isolationPath = args[++index] || fail('--isolation requires a value');
  else positional.push(args[index]);
}
if (positional.length !== 3) fail('usage: assemble-run-result.js <plan.json> <observations.json> <out-dir> [--orphan-audit <audit.json>] [--isolation <isolation.json>] [--mask-key <key>]...');
const [planPath, observationsPath, outDir] = positional;
const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fail(`unreadable JSON: ${file}`); } };
const plan = readJson(planPath);
const observed = readJson(observationsPath);
if (plan.schema !== 'vulpora.e2e-run-plan/v1') fail('plan must come from export-catalog-plan.js');
if (observed.schema !== 'vulpora.e2e-harness-observations/v1') fail('observations require schema vulpora.e2e-harness-observations/v1');
for (const key of ['runId', 'startedAt', 'finishedAt', 'environment', 'lifecycle', 'results']) {
  if (observed[key] === undefined) fail(`observations.${key} is required`);
}
if (!/^[A-Za-z0-9._-]+$/.test(observed.runId)) fail('observations.runId must be a safe file name');
const planned = new Set(plan.scenarios.map((scenario) => scenario.id));
for (const id of Object.keys(observed.results)) if (!planned.has(id)) fail(`observation for unplanned scenario: ${id}`);

fs.mkdirSync(path.join(outDir, 'raw'), {recursive: true});
const results = [];
const testCases = [];
const statusById = new Map();
for (const scenario of plan.scenarios) {
  const observation = observed.results[scenario.id];
  if (!scenario.selected) {
    if (observation?.executed) fail(`harness executed unselected scenario: ${scenario.id}`);
    testCases.push({id: scenario.id, priority: scenario.priority, selected: false, executed: false, unselectedReason: scenario.unselectedReason});
    continue;
  }
  const base = {
    id: scenario.id, target: scenario.target, purpose: scenario.purpose, priority: scenario.priority,
    dataset: scenario.dataset, preconditions: scenario.preconditions, dependsOn: scenario.dependsOn, expected: scenario.expected,
  };
  const failedParent = scenario.dependsOn.find((dependency) => ['FAIL', 'FAILED-DEPENDENCY'].includes(statusById.get(dependency)));
  let result;
  // RUN-11: a dependent of a failed parent is FAILED-DEPENDENCY even if the harness ran it.
  if (!observation?.executed || failedParent) {
    const status = failedParent ? 'FAILED-DEPENDENCY' : observation?.probeError ? 'PROBE-ERROR' : 'SKIPPED';
    const reason = failedParent ? `parent-failed: ${failedParent}` : observation?.skippedReason || observation?.probeError || 'not executed by harness';
    result = {...base, status, actual: null, latencyMs: null, skippedReason: reason, assertions: [],
      evidence: {rawBodyPath: null, logTailPath: null}};
  } else {
    const bodyText = observation.bodyFile ? fs.readFileSync(path.resolve(path.dirname(observationsPath), observation.bodyFile), 'utf8') : '';
    let verdict;
    if (scenario.request.type === 'http') {
      try {
        verdict = evaluateExpected(scenario.expected, observation.httpStatus, bodyText, observation.vars || {});
      } catch (error) {
        if (!(error instanceof ExpectedError)) throw error;
        verdict = {outcome: 'FAIL', assertions: [{kind: 'input', expected: null, actual: error.message, passed: false}]};
      }
    } else {
      // sql/shell/async scenarios: the harness must report what it compared.
      const assertions = Array.isArray(observation.assertions) ? observation.assertions : [];
      verdict = {outcome: assertions.length === 0 ? 'NO_ASSERTION' : assertions.every((item) => item.passed === true) ? 'PASS' : 'FAIL', assertions};
    }
    const teardownFailed = observation.teardown?.status === 'FAIL';
    const rawBodyPath = path.join('raw', `${scenario.id}.json`);
    fs.writeFileSync(path.join(outDir, rawBodyPath), `${maskBody(bodyText, maskKeys)}\n`);
    // NO_ASSERTION stays PASS-shaped here on purpose: the verdict evaluator turns a PASS
    // that compared nothing into INCONCLUSIVE instead of letting it count as proof.
    const status = verdict.outcome === 'FAIL' || teardownFailed ? 'FAIL' : 'PASS';
    result = {...base, status, actual: observation.httpStatus == null ? null : String(observation.httpStatus),
      latencyMs: observation.latencyMs ?? 0, skippedReason: null, assertions: maskValue(verdict.assertions, maskKeys),
      teardown: observation.teardown ?? null, evidence: {rawBodyPath, logTailPath: observation.logTailPath ?? null}};
    if (status === 'FAIL' && !result.evidence.logTailPath) result.evidence.logUnavailableReason = observation.logUnavailableReason || 'unknown';
  }
  statusById.set(scenario.id, result.status);
  results.push(result);
  const executed = Boolean(observation?.executed) && !failedParent;
  const testCase = {id: scenario.id, priority: scenario.priority, selected: true, executed, status: result.status, assertions: result.assertions};
  if (result.status !== 'PASS') testCase.detail = result.skippedReason || result.assertions.filter((item) => !item.passed).map((item) => item.clause || item.kind).join(', ') || 'teardown failed';
  testCases.push(testCase);
}

// environment schemaVersion 2: keep only the known endpoint fields, in a stable order.
function normalizeEnvironment(environment) {
  if (!environment || environment.schemaVersion !== 2) return environment;
  if (!Array.isArray(environment.endpoints)) fail('observations.environment.endpoints must be an array when schemaVersion is 2');
  const endpoints = environment.endpoints.map((endpoint) => {
    if (!endpoint || typeof endpoint !== 'object') fail('every observations.environment.endpoints entry must be an object');
    return {kind: endpoint.kind, host: endpoint.host, port: endpoint.port, containerId: endpoint.containerId,
      propertyKeys: Array.isArray(endpoint.propertyKeys) ? [...endpoint.propertyKeys].sort() : endpoint.propertyKeys,
      ...(endpoint.positiveContactProbe !== undefined ? {positiveContactProbe: endpoint.positiveContactProbe} : {})};
  }).sort((a, b) => String(a.kind).localeCompare(String(b.kind)) || Number(a.port) - Number(b.port));
  return {...environment, endpoints};
}

// The isolation record comes from check-isolation.js, never from the harness. Its receipt is copied beside the run
// result and re-hashed, so a swapped receipt or an edited record is caught by the validator.
function embedIsolation(file) {
  const isolation = readJson(file);
  if (isolation.schema !== 'vulpora.isolation/v1') fail('isolation must come from check-isolation.js');
  for (const key of ['sharedContacts', 'ownershipViolations', 'prestartRefusals', 'warnings']) {
    if (isolation[key] !== undefined && !Array.isArray(isolation[key])) fail(`isolation.${key} must be an array`);
  }
  if (!Array.isArray(isolation.sharedContacts) || typeof isolation.verified !== 'boolean') fail('isolation needs verified (boolean) and sharedContacts (array)');
  const base = path.resolve(path.dirname(file));
  const source = path.resolve(base, isolation.receipt?.path || '');
  if (!isolation.receipt?.path || !source.startsWith(`${base}${path.sep}`)) fail('isolation receipt must be a file inside the isolation record directory');
  if (!fs.existsSync(source)) fail('isolation receipt is missing');
  const receiptText = fs.readFileSync(source);
  if (crypto.createHash('sha256').update(receiptText).digest('hex') !== isolation.receipt.sha256) fail('isolation receipt does not match its recorded sha256');
  fs.mkdirSync(path.join(outDir, 'isolation'), {recursive: true});
  fs.writeFileSync(path.join(outDir, 'isolation', 'isolation-receipt.json'), receiptText);
  try {
    const receipt = JSON.parse(receiptText.toString('utf8'));
    const name = receipt.listenerSnapshot?.path ? path.basename(receipt.listenerSnapshot.path) : null;
    const snapshot = name ? path.join(path.dirname(source), name) : null;
    if (snapshot && fs.existsSync(snapshot) && crypto.createHash('sha256').update(fs.readFileSync(snapshot)).digest('hex') === receipt.listenerSnapshot.sha256) {
      fs.copyFileSync(snapshot, path.join(outDir, 'isolation', name));
    }
  } catch { /* an unreadable receipt was already rejected by the hash check above only if altered; the validator re-reads it */ }
  return maskValue({...isolation, receipt: {path: 'isolation/isolation-receipt.json', sha256: isolation.receipt.sha256}}, maskKeys);
}
const isolation = isolationPath ? embedIsolation(isolationPath) : null;

const count = (status) => results.filter((result) => result.status === status).length;
const checked = results.reduce((total, result) => total + result.assertions.length, 0);
const notSelected = new Map();
for (const testCase of testCases.filter((candidate) => !candidate.selected)) {
  notSelected.set(testCase.unselectedReason, [...(notSelected.get(testCase.unselectedReason) || []), testCase.id]);
}
const run = {
  schemaVersion: 1, contractVersion: 1, runId: observed.runId, mode: 'catalog-harness',
  startedAt: observed.startedAt, finishedAt: observed.finishedAt, generatedAt: observed.finishedAt,
  wallTimeMs: Math.max(0, Date.parse(observed.finishedAt) - Date.parse(observed.startedAt)) || 0,
  git: observed.git ?? null,
  environment: maskValue({owner: 'repository-harness', ...normalizeEnvironment(observed.environment)}, maskKeys),
  catalog: {path: plan.catalog.path, sha: plan.catalog.fingerprint, stale: Boolean(observed.catalogStale),
    knownDeviations: plan.knownDeviations},
  scope: plan.scope,
  summary: {
    total: results.length, pass: count('PASS'), fail: count('FAIL'), skipped: count('SKIPPED'),
    failedDependency: count('FAILED-DEPENDENCY'), probeError: count('PROBE-ERROR'),
    notSelected: testCases.length - results.length, assertionsChecked: checked,
    scenariosWithAssertions: results.filter((result) => result.assertions.length > 0).length,
  },
  notSelected: [...notSelected].map(([reason, caseIds]) => ({reason, count: caseIds.length, caseIds})),
  results,
  remainingRisks: observed.remainingRisks ?? [],
  selection: {collectedCount: testCases.length},
  execution: {supportedStack: true, slowTestExclusions: []},
  testCases,
  lifecycle: orphanAuditPath ? {...observed.lifecycle, orphanAudit: readJson(orphanAuditPath)} : observed.lifecycle,
  ...(isolation ? {isolation} : {}),
};
const base = path.join(outDir, observed.runId);
fs.writeFileSync(`${base}.json`, `${JSON.stringify(run, null, 2)}\n`);
const line = (label, value) => `- ${label}: ${value}`;
fs.writeFileSync(`${base}.md`, [
  `# E2E ${observed.runId}`, '',
  line('통과', run.summary.pass),
  line('실패', run.summary.fail + run.summary.failedDependency + run.summary.probeError),
  line('제외', `${run.summary.notSelected} (${run.notSelected.map((item) => `${item.reason} ${item.count}`).join('; ') || '없음'})`),
  line('확인하지 못한 것', `${run.summary.skipped}건 미실행, 비교 ${checked}개 / 시나리오 ${results.length}개`),
  line('격리', !isolation ? '확인 안 됨 (격리 증거 없음)' : isolation.sharedContacts.length > 0
    ? `위반 (${isolation.sharedContacts.map((contact) => `${contact.remoteAddress}:${contact.remotePort}`).join(', ')})`
    : isolation.verified ? '확인됨 (관찰 범위 안에서 공유 접촉 없음)' : `확인 안 됨 (${(isolation.unverifiedReasons || [])[0] || '이유 없음'})`), '',
].join('\n'));
fs.writeFileSync(`${base}.done`, ''); // Written last: renderers treat the run as settled only after this.
process.stdout.write(`${JSON.stringify({run: `${base}.json`, summary: run.summary})}\n`);
