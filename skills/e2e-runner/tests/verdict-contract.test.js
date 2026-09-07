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
    testCases: [{ id: 'E2E-LOGIN', priority: 'P0', selected: true, executed: true, status: 'PASS' }],
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
  assert.deepEqual(pass.output.selection, { collected: 1, selected: 1, executed: 1 });

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
    input.testCases.push({ id: 'E2E-SLOW-EXPORT', priority: 'P2', selected: false, executed: false });
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
  expectInvalid('exclusion-not-collected', (input) => {
    input.execution.slowTestExclusions.push({ id: 'E2E-MISSING', reason: 'budget' });
  });

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
