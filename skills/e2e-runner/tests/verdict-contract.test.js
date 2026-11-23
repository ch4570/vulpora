#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const evaluator = path.resolve(__dirname, '../scripts/evaluate-run-verdict.js');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'vulpora-e2e-verdict-'));

function baseRun() {
  return {
    selection: { collectedCount: 1 },
    execution: { supportedStack: true, slowTestExclusions: [] },
    testCases: [{ id: 'E2E-LOGIN', priority: 'P0', selected: true, executed: true, status: 'PASS',
      assertions: [{ kind: 'status', expected: '200', actual: '200', passed: true }] }],
    lifecycle: {
      cleanup: { status: 'PASS' },
      teardown: { status: 'PASS' },
      orphanAudit: { status: 'PASS' },
      absenceProbes: [{ id: 'ABSENCE-LOGIN', status: 'PASS' }],
    },
  };
}

function invoke(name, input, flags = []) {
  const inputPath = path.join(work, `${name}.json`);
  fs.writeFileSync(inputPath, `${JSON.stringify(input)}\n`);
  return spawnSync(process.execPath, [evaluator, inputPath, ...flags], { encoding: 'utf8' });
}

function runCase(name, mutate, flags = []) {
  const input = baseRun();
  mutate(input);
  const result = invoke(name, input, flags);
  assert.doesNotThrow(() => JSON.parse(result.stdout), `${name}: stdout must be JSON`);
  return { ...result, output: JSON.parse(result.stdout) };
}

function expectVerdict(name, mutate, verdict, exitCode, flags = []) {
  const result = runCase(name, mutate, flags);
  assert.equal(result.status, exitCode, `${name}: process exit`);
  assert.equal(result.output.verdict, verdict, `${name}: verdict`);
  assert.equal(result.output.exit_code, exitCode, `${name}: reported exit`);
  assert.equal(result.output.qualifying_pass, verdict === 'PASS', `${name}: qualifying pass`);
  assert.equal(result.stderr, exitCode === 0 ? '' : `ERROR: verdict=${verdict}\n`, `${name}: exact stderr`);
  return result;
}

function expectInvalid(name, mutate) {
  const input = baseRun();
  mutate(input);
  const result = invoke(`invalid-${name}`, input);
  assert.equal(result.status, 64, `${name}: invalid input exit`);
  assert.equal(result.stdout, '', `${name}: invalid input has no verdict JSON`);
  assert.match(result.stderr, /^invalid run result: .+\n$/, `${name}: input error`);
}

try {
  const pass = expectVerdict('pass', () => {}, 'PASS', 0);
  assert.deepEqual(pass.output.selection, { collected: 1, selected: 1, executed: 1, unselected: 0 });
  assert.deepEqual(pass.output.notSelected, []);
  const gaps = expectVerdict('pass-with-reported-gaps', (input) => {
    input.selection.collectedCount += 3;
    input.testCases.push(
      { id: 'E2E-CDN-PURGE', priority: 'P1', selected: false, executed: false, unselectedReason: 'outside requested area' },
      { id: 'E2E-CACHE-REFRESH', priority: 'P1', selected: false, executed: false, unselectedReason: 'outside requested area' },
      { id: 'E2E-SEARCH-GET', priority: 'P2', selected: false, executed: false, unselectedReason: 'requires OpenSearch fixture' },
    );
  }, 'PASS', 0);
  assert.deepEqual(gaps.output.selection, { collected: 4, selected: 1, executed: 1, unselected: 3 });
  assert.deepEqual(gaps.output.notSelected, [
    { reason: 'outside requested area', count: 2, caseIds: ['E2E-CDN-PURGE', 'E2E-CACHE-REFRESH'] },
    { reason: 'requires OpenSearch fixture', count: 1, caseIds: ['E2E-SEARCH-GET'] },
  ]);

  expectVerdict('partial-non-p0', (input) => {
    input.selection.collectedCount += 1;
    input.testCases.push({ id: 'E2E-SEARCH', priority: 'P1', selected: true, executed: true, status: 'FAIL', detail: 'ranking mismatch' });
  }, 'PARTIAL', 2);
  expectVerdict('partial-non-p0-skipped', (input) => {
    input.selection.collectedCount += 1;
    input.testCases.push({ id: 'E2E-SEARCH', priority: 'P1', selected: true, executed: false, status: 'SKIPPED', detail: 'fixture unavailable' });
  }, 'PARTIAL', 2);
  expectVerdict('partial-non-p0-probe-error', (input) => {
    input.selection.collectedCount += 1;
    input.testCases.push({ id: 'E2E-SEARCH', priority: 'P1', selected: true, executed: false, status: 'PROBE-ERROR', detail: 'readiness probe returned malformed JSON' });
  }, 'PARTIAL', 2);
  expectVerdict('partial-slow-exclusion', (input) => {
    input.selection.collectedCount += 1;
    input.testCases.push({ id: 'E2E-SLOW-EXPORT', priority: 'P2', selected: false, executed: false, unselectedReason: 'slow-test exclusion' });
    input.execution.slowTestExclusions.push({ id: 'E2E-SLOW-EXPORT', reason: 'excluded by the 30 minute CI budget' });
  }, 'PARTIAL', 2);

  expectVerdict('blocked-unsupported', (input) => { input.execution.supportedStack = false; }, 'BLOCKED', 3);
  expectVerdict('blocked-zero-collected', (input) => {
    input.selection.collectedCount = 0;
    input.testCases = [];
  }, 'BLOCKED', 3);
  const blockedPrecedence = expectVerdict('blocked-precedence', (input) => {
    input.execution.supportedStack = false;
    input.testCases[0].status = 'FAIL';
    input.lifecycle.cleanup.status = 'FAIL';
  }, 'BLOCKED', 3);
  assert.deepEqual(blockedPrecedence.output.reasons, [{ code: 'UNSUPPORTED_STACK' }]);

  expectVerdict('inconclusive-zero-selected', (input) => {
    input.testCases[0].selected = false;
    input.testCases[0].executed = false;
    input.testCases[0].unselectedReason = 'outside requested area';
    delete input.testCases[0].status;
  }, 'INCONCLUSIVE', 4);
  expectVerdict('inconclusive-zero-executed', (input) => {
    input.testCases[0].executed = false;
    input.testCases[0].status = 'SKIPPED';
  }, 'INCONCLUSIVE', 4);
  expectVerdict('inconclusive-p0-fail', (input) => { input.testCases[0].status = 'FAIL'; }, 'INCONCLUSIVE', 4);
  expectVerdict('inconclusive-p0-probe-error', (input) => {
    input.testCases[0].executed = false;
    input.testCases[0].status = 'PROBE-ERROR';
  }, 'INCONCLUSIVE', 4);
  expectVerdict('payload-mode-cannot-bypass', (input) => {
    input.testCases[0].status = 'FAIL';
    input.mode = 'diagnostic-only';
  }, 'INCONCLUSIVE', 4);
  expectVerdict('inconclusive-undocumented-non-p0', (input) => {
    input.testCases[0].priority = 'P1';
    input.testCases[0].status = 'FAIL';
  }, 'INCONCLUSIVE', 4);
  expectVerdict('inconclusive-cleanup', (input) => { input.lifecycle.cleanup.status = 'FAIL'; }, 'INCONCLUSIVE', 4);
  expectVerdict('inconclusive-teardown', (input) => { input.lifecycle.teardown.status = 'FAIL'; }, 'INCONCLUSIVE', 4);
  expectVerdict('inconclusive-orphan-audit', (input) => { input.lifecycle.orphanAudit.status = 'FAIL'; }, 'INCONCLUSIVE', 4);
  expectVerdict('inconclusive-missing-absence', (input) => { input.lifecycle.absenceProbes = []; }, 'INCONCLUSIVE', 4);
  expectVerdict('inconclusive-failed-absence', (input) => { input.lifecycle.absenceProbes[0].status = 'FAIL'; }, 'INCONCLUSIVE', 4);
  const inconclusivePrecedence = expectVerdict('inconclusive-precedence', (input) => {
    input.selection.collectedCount += 1;
    input.testCases.push({ id: 'E2E-SEARCH', priority: 'P1', selected: true, executed: true, status: 'FAIL', detail: 'ranking mismatch' });
    input.lifecycle.cleanup.status = 'FAIL';
  }, 'INCONCLUSIVE', 4);
  assert(inconclusivePrecedence.output.reasons.some((reason) => reason.code === 'CLEANUP_NOT_PASS'));
  assert(!inconclusivePrecedence.output.reasons.some((reason) => reason.code === 'NON_P0_NOT_PASS'));

  const diagnostic = expectVerdict('diagnostic-p0-fail', (input) => { input.testCases[0].status = 'FAIL'; }, 'INCONCLUSIVE', 0, ['--diagnostic-only']);
  assert.equal(diagnostic.output.mode, 'diagnostic-only');
  assert.equal(diagnostic.output.qualifying_pass, false);

  expectVerdict('diagnostic-zero-selected', (input) => {
    input.testCases[0].selected = false;
    input.testCases[0].executed = false;
    input.testCases[0].unselectedReason = 'outside requested area';
    delete input.testCases[0].status;
  }, 'INCONCLUSIVE', 4, ['--diagnostic-only']);
  expectVerdict('diagnostic-zero-executed', (input) => {
    input.testCases[0].executed = false;
    input.testCases[0].status = 'SKIPPED';
  }, 'INCONCLUSIVE', 4, ['--diagnostic-only']);
  expectVerdict('diagnostic-cleanup', (input) => { input.lifecycle.cleanup.status = 'FAIL'; }, 'INCONCLUSIVE', 4, ['--diagnostic-only']);
  expectVerdict('diagnostic-teardown', (input) => { input.lifecycle.teardown.status = 'FAIL'; }, 'INCONCLUSIVE', 4, ['--diagnostic-only']);
  expectVerdict('diagnostic-orphan-audit', (input) => { input.lifecycle.orphanAudit.status = 'FAIL'; }, 'INCONCLUSIVE', 4, ['--diagnostic-only']);
  expectVerdict('diagnostic-absence', (input) => { input.lifecycle.absenceProbes = []; }, 'INCONCLUSIVE', 4, ['--diagnostic-only']);
  expectVerdict('diagnostic-p0-plus-partial', (input) => {
    input.testCases[0].status = 'FAIL';
    input.selection.collectedCount += 1;
    input.testCases.push({ id: 'E2E-SEARCH', priority: 'P1', selected: true, executed: true, status: 'FAIL', detail: 'ranking mismatch' });
  }, 'INCONCLUSIVE', 4, ['--diagnostic-only']);
  expectVerdict('diagnostic-blocked', (input) => {
    input.execution.supportedStack = false;
    input.testCases[0].status = 'FAIL';
  }, 'BLOCKED', 3, ['--diagnostic-only']);

  expectInvalid('count-mismatch', (input) => { input.selection.collectedCount = 2; });
  expectInvalid('missing-exclusions', (input) => { delete input.execution.slowTestExclusions; });
  expectInvalid('duplicate-case', (input) => {
    input.selection.collectedCount += 1;
    input.testCases.push({ ...input.testCases[0] });
  });
  expectInvalid('invalid-priority', (input) => { input.testCases[0].priority = 'P4'; });
  expectInvalid('invalid-status', (input) => { input.testCases[0].status = 'GREEN'; });
  expectInvalid('executed-skipped', (input) => { input.testCases[0].status = 'SKIPPED'; });
  expectInvalid('unselected-status', (input) => {
    input.testCases[0].selected = false;
    input.testCases[0].executed = false;
  });
  expectInvalid('selected-unexecuted-missing-status', (input) => {
    input.testCases[0].executed = false;
    delete input.testCases[0].status;
  });
  expectInvalid('selected-unexecuted-fail', (input) => {
    input.testCases[0].executed = false;
    input.testCases[0].status = 'FAIL';
  });
  expectInvalid('unknown-cleanup', (input) => { input.lifecycle.cleanup.status = 'UNKNOWN'; });
  expectInvalid('missing-teardown', (input) => { delete input.lifecycle.teardown; });
  expectInvalid('missing-orphan-audit', (input) => { delete input.lifecycle.orphanAudit; });
  expectInvalid('duplicate-probe', (input) => { input.lifecycle.absenceProbes.push({ ...input.lifecycle.absenceProbes[0] }); });
  // The reported false-PASS: Expected was `204`, the harness stripped nothing and skipped the comparison.
  const skipped = expectVerdict('inconclusive-no-assertion', (input) => { input.testCases[0].assertions = []; }, 'INCONCLUSIVE', 4);
  assert.deepEqual(skipped.output.reasons, [{ code: 'NO_ASSERTION', caseId: 'E2E-LOGIN' }]);
  expectVerdict('inconclusive-missing-assertions', (input) => { delete input.testCases[0].assertions; }, 'INCONCLUSIVE', 4);
  const contradiction = expectVerdict('inconclusive-status-contradiction', (input) => {
    input.testCases[0].assertions = [{ kind: 'status', expected: '204', actual: '404', passed: true }];
  }, 'INCONCLUSIVE', 4);
  assert.deepEqual(contradiction.output.reasons, [{ code: 'PASS_CONTRADICTS_ASSERTION', caseId: 'E2E-LOGIN' }]);
  expectVerdict('inconclusive-failed-assertion', (input) => {
    input.testCases[0].assertions.push({ kind: 'body', clause: 'assert $.x exists', passed: false });
  }, 'INCONCLUSIVE', 4);
  expectVerdict('framework-assertions', (input) => {
    delete input.testCases[0].assertions;
    input.testCases[0].assertionSource = 'framework';
  }, 'PASS', 0);
  expectInvalid('bad-assertion-shape', (input) => { input.testCases[0].assertions = [{ kind: 'status' }]; });
  expectInvalid('unselected-without-reason', (input) => {
    input.selection.collectedCount += 1;
    input.testCases.push({ id: 'E2E-CDN-PURGE', priority: 'P1', selected: false, executed: false });
  });
  expectInvalid('exclusion-not-collected', (input) => {
    input.execution.slowTestExclusions.push({ id: 'E2E-MISSING', reason: 'budget' });
  });

  // ---- RUN-7.1d isolation input -------------------------------------------------------------
  const cleanIsolation = () => ({ verified: true, sharedContacts: [], prestartRefusals: [], warnings: [] });
  const breach = () => ({
    ...cleanIsolation(), verified: false,
    sharedContacts: [{ remoteAddress: '127.0.0.1', remotePort: 16379, process: { pid: 42, command: 'java' }, firstSeen: '2026-11-23T00:00:01Z', lastSeen: '2026-11-23T00:00:03Z' }],
  });

  // Without isolation input the verdict is unchanged but the report may not claim isolation.
  const noIsolation = expectVerdict('isolation-absent', () => {}, 'PASS', 0);
  assert.equal(noIsolation.output.isolation_verified, false);
  assert.deepEqual(noIsolation.output.isolation_warnings.map((warning) => warning.code), ['ISOLATION_EVIDENCE_MISSING']);
  assert.equal(noIsolation.output.humanSummary.length, 5);
  assert.equal(noIsolation.output.humanSummary[4], 'isolation: not verified (ISOLATION_EVIDENCE_MISSING)');

  const verified = expectVerdict('isolation-verified', (input) => { input.isolation = cleanIsolation(); }, 'PASS', 0);
  assert.equal(verified.output.isolation_verified, true);
  assert.equal(verified.output.humanSummary[4], 'isolation: verified');

  const unverified = expectVerdict('isolation-unverified-keeps-verdict', (input) => {
    input.isolation = { ...cleanIsolation(), verified: false, unverifiedReasons: ['observer gap: no test JVM in the observed tree'],
      warnings: [{ code: 'OBSERVER_GAP' }] };
  }, 'PASS', 0);
  assert.equal(unverified.output.isolation_verified, false);
  assert.equal(unverified.output.humanSummary[4], 'isolation: not verified (observer gap: no test JVM in the observed tree)');

  // A real contact is a new verdict with its own exit code, and the exit code is never 0.
  const breached = expectVerdict('isolation-breach', (input) => { input.isolation = breach(); }, 'ISOLATION_BREACH', 5);
  assert.deepEqual(breached.output.reasons.map((reason) => `${reason.code} ${reason.remoteAddress}:${reason.remotePort}`), ['SHARED_ENDPOINT_CONTACT 127.0.0.1:16379']);
  assert.equal(breached.output.isolation_verified, false);
  assert.equal(breached.output.humanSummary[4], 'isolation: BREACH (127.0.0.1:16379)');

  // Priority: the breach outranks BLOCKED, INCONCLUSIVE, and PARTIAL, and keeps them visible.
  const outranks = expectVerdict('isolation-breach-outranks', (input) => {
    input.isolation = breach();
    input.execution.supportedStack = false;
    input.lifecycle.cleanup.status = 'FAIL';
    input.selection.collectedCount += 1;
    input.testCases.push({ id: 'E2E-SEARCH', priority: 'P1', selected: true, executed: true, status: 'FAIL', detail: 'ranking mismatch' });
  }, 'ISOLATION_BREACH', 5);
  assert.deepEqual(outranks.output.secondaryReasons.map((reason) => reason.code).sort(),
    ['CLEANUP_NOT_PASS', 'NON_P0_NOT_PASS', 'UNSUPPORTED_STACK']);

  // Neither --diagnostic-only nor a payload field can lower a breach (RUN-18.2).
  const diagnosticBreach = expectVerdict('isolation-breach-diagnostic', (input) => {
    input.isolation = breach();
    input.testCases[0].status = 'FAIL';
  }, 'ISOLATION_BREACH', 5, ['--diagnostic-only']);
  assert.equal(diagnosticBreach.output.qualifying_pass, false);
  expectVerdict('isolation-breach-payload-mode', (input) => { input.isolation = breach(); input.mode = 'diagnostic-only'; }, 'ISOLATION_BREACH', 5);

  // Pre-start refusal (owner decision 3): nothing ran, so it is BLOCKED and outranks INCONCLUSIVE.
  const refused = expectVerdict('isolation-prestart-refused', (input) => {
    input.isolation = { ...cleanIsolation(), verified: false, prestartRefusals: [
      { code: 'PRESTART_ENDPOINT_NOT_OWNED', key: 'spring.data.redis.host', host: 'localhost', port: 16379 }] };
    input.testCases[0].executed = false;
    input.testCases[0].status = 'SKIPPED';
  }, 'BLOCKED', 3);
  assert.deepEqual(refused.output.reasons, [{ code: 'PRESTART_ENDPOINT_NOT_OWNED', key: 'spring.data.redis.host', host: 'localhost', port: 16379 }]);
  assert.equal(refused.output.humanSummary[4], 'isolation: not verified (start refused: localhost:16379)');
  const clientRefused = expectVerdict('isolation-client-refused', (input) => {
    input.isolation = { ...cleanIsolation(), prestartRefusals: [{ code: 'CLIENT_ENDPOINT_NOT_OWNED', host: '127.0.0.1', port: 4566 }] };
  }, 'BLOCKED', 3);
  assert.equal(clientRefused.output.reasons[0].code, 'CLIENT_ENDPOINT_NOT_OWNED');

  // A breach beats a refusal; a diagnostic run cannot lower a refusal either.
  expectVerdict('isolation-breach-beats-refusal', (input) => {
    input.isolation = { ...breach(), prestartRefusals: [{ code: 'PRESTART_ENDPOINT_NOT_OWNED', host: 'localhost', port: 5432 }] };
  }, 'ISOLATION_BREACH', 5);
  expectVerdict('isolation-refusal-diagnostic', (input) => {
    input.isolation = { ...cleanIsolation(), prestartRefusals: [{ code: 'PRESTART_ENDPOINT_NOT_OWNED', host: 'localhost', port: 5432 }] };
    input.testCases[0].status = 'FAIL';
  }, 'BLOCKED', 3, ['--diagnostic-only']);

  // Malformed isolation input is a usage error (64), never a silent pass.
  expectInvalid('isolation-not-object', (input) => { input.isolation = 'clean'; });
  expectInvalid('isolation-verified-missing', (input) => { input.isolation = { sharedContacts: [] }; });
  expectInvalid('isolation-contacts-not-array', (input) => { input.isolation = { verified: true, sharedContacts: {} }; });
  expectInvalid('isolation-contact-no-port', (input) => { input.isolation = { verified: false, sharedContacts: [{ remoteAddress: '127.0.0.1' }] }; });
  expectInvalid('isolation-refusal-unknown-code', (input) => {
    input.isolation = { ...cleanIsolation(), prestartRefusals: [{ code: 'WHATEVER' }] };
  });
  expectInvalid('isolation-warning-without-code', (input) => { input.isolation = { ...cleanIsolation(), warnings: [{}] }; });

  const aliasInput = path.join(work, 'diagnostic-alias.json');
  fs.writeFileSync(aliasInput, `${JSON.stringify(baseRun())}\n`);
  const alias = spawnSync(process.execPath, [evaluator, aliasInput, '--diagnostic'], { encoding: 'utf8' });
  assert.equal(alias.status, 64, 'diagnostic aliases must be rejected');
  const duplicateFlag = spawnSync(process.execPath, [evaluator, aliasInput, '--diagnostic-only', '--diagnostic-only'], { encoding: 'utf8' });
  assert.equal(duplicateFlag.status, 64, 'duplicate diagnostic flag must be rejected');

  console.log('e2e verdict contract: PASS');
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
