#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const diagnosticOnly = args.includes('--diagnostic-only');
const positional = args.filter((arg) => arg !== '--diagnostic-only');

if (positional.length !== 1
  || args.filter((arg) => arg === '--diagnostic-only').length > 1
  || args.some((arg) => arg.startsWith('--') && arg !== '--diagnostic-only')) {
  console.error('usage: evaluate-run-verdict.js <run-result.json> [--diagnostic-only]');
  process.exit(64);
}

function failInput(message) {
  console.error(`invalid run result: ${message}`);
  process.exit(64);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) failInput(`${label} must be a non-empty string`);
}

let run;
try {
  run = JSON.parse(fs.readFileSync(path.resolve(positional[0]), 'utf8'));
} catch (error) {
  failInput(error.message);
}

if (!isObject(run)) failInput('root must be an object');
if (!isObject(run.selection) || !Number.isInteger(run.selection.collectedCount) || run.selection.collectedCount < 0) {
  failInput('selection.collectedCount must be a non-negative integer');
}
if (!isObject(run.execution) || typeof run.execution.supportedStack !== 'boolean') {
  failInput('execution.supportedStack must be a boolean');
}
if (!Array.isArray(run.execution.slowTestExclusions)) {
  failInput('execution.slowTestExclusions must be an array');
}
if (!Array.isArray(run.testCases)) failInput('testCases must be an array');
if (run.selection.collectedCount !== run.testCases.length) {
  failInput('selection.collectedCount must equal testCases.length');
}
if (!isObject(run.lifecycle)
  || !isObject(run.lifecycle.cleanup)
  || !isObject(run.lifecycle.teardown)
  || !isObject(run.lifecycle.orphanAudit)
  || !Array.isArray(run.lifecycle.absenceProbes)) {
  failInput('lifecycle.cleanup, teardown, orphanAudit, and absenceProbes are required');
}

const allowedPriorities = new Set(['P0', 'P1', 'P2', 'P3']);
const allowedCaseStatuses = new Set(['PASS', 'FAIL', 'SKIPPED', 'FAILED-DEPENDENCY', 'PROBE-ERROR']);
const allowedLifecycleStatuses = new Set(['PASS', 'FAIL', 'NOT_RUN']);
const ids = new Set();

for (const testCase of run.testCases) {
  if (!isObject(testCase)) failInput('each test case must be an object');
  requireNonEmptyString(testCase.id, 'each test case id');
  if (ids.has(testCase.id)) failInput(`duplicate test case id: ${testCase.id}`);
  ids.add(testCase.id);
  if (!allowedPriorities.has(testCase.priority)) failInput(`invalid priority for ${testCase.id}`);
  if (typeof testCase.selected !== 'boolean' || typeof testCase.executed !== 'boolean') {
    failInput(`selected and executed must be booleans for ${testCase.id}`);
  }
  if (testCase.executed && !testCase.selected) failInput(`executed case was not selected: ${testCase.id}`);

  const hasStatus = testCase.status !== undefined && testCase.status !== null;
  if (hasStatus && !allowedCaseStatuses.has(testCase.status)) failInput(`invalid status for ${testCase.id}`);
  if (testCase.executed && !['PASS', 'FAIL'].includes(testCase.status)) {
    failInput(`executed case requires PASS or FAIL status: ${testCase.id}`);
  }
  if (!testCase.selected && hasStatus) failInput(`unselected case must not have status: ${testCase.id}`);
  if (testCase.selected && !testCase.executed && !['SKIPPED', 'FAILED-DEPENDENCY', 'PROBE-ERROR'].includes(testCase.status)) {
    failInput(`selected unexecuted case requires SKIPPED, FAILED-DEPENDENCY, or PROBE-ERROR status: ${testCase.id}`);
  }
}

const exclusionIds = new Set();
for (const exclusion of run.execution.slowTestExclusions) {
  if (!isObject(exclusion)) failInput('each slow-test exclusion must be an object');
  requireNonEmptyString(exclusion.id, 'each slow-test exclusion id');
  requireNonEmptyString(exclusion.reason, `slow-test exclusion reason for ${exclusion.id}`);
  if (exclusionIds.has(exclusion.id)) failInput(`duplicate slow-test exclusion id: ${exclusion.id}`);
  if (!ids.has(exclusion.id)) failInput(`slow-test exclusion does not name a collected case: ${exclusion.id}`);
  const excludedCase = run.testCases.find((testCase) => testCase.id === exclusion.id);
  if (excludedCase.executed) failInput(`slow-test exclusion names an executed case: ${exclusion.id}`);
  exclusionIds.add(exclusion.id);
}

for (const field of ['cleanup', 'teardown', 'orphanAudit']) {
  if (!allowedLifecycleStatuses.has(run.lifecycle[field].status)) {
    failInput(`lifecycle.${field}.status must be PASS, FAIL, or NOT_RUN`);
  }
}
const probeIds = new Set();
for (const probe of run.lifecycle.absenceProbes) {
  if (!isObject(probe)) failInput('each absence probe must be an object');
  requireNonEmptyString(probe.id, 'each absence probe id');
  if (probeIds.has(probe.id)) failInput(`duplicate absence probe id: ${probe.id}`);
  if (!allowedLifecycleStatuses.has(probe.status)) failInput(`invalid absence probe status for ${probe.id}`);
  probeIds.add(probe.id);
}

const selectedCases = run.testCases.filter((testCase) => testCase.selected);
const executedCases = selectedCases.filter((testCase) => testCase.executed);
const blockedReasons = [];
const inconclusiveReasons = [];
const partialReasons = [];

if (!run.execution.supportedStack) blockedReasons.push({ code: 'UNSUPPORTED_STACK' });
if (run.selection.collectedCount === 0) blockedReasons.push({ code: 'ZERO_COLLECTED_TESTS' });
if (selectedCases.length === 0) inconclusiveReasons.push({ code: 'ZERO_SELECTED_CASES' });
if (selectedCases.length > 0 && executedCases.length === 0) inconclusiveReasons.push({ code: 'ZERO_EXECUTED_CASES' });

for (const testCase of selectedCases) {
  if (testCase.executed && testCase.status === 'PASS') continue;

  if (testCase.priority === 'P0') {
    inconclusiveReasons.push({
      code: testCase.executed ? 'SELECTED_P0_NOT_PASS' : 'SELECTED_P0_NOT_EXECUTED',
      caseId: testCase.id,
      status: testCase.status || null,
    });
  } else if (typeof testCase.detail !== 'string' || testCase.detail.trim().length === 0) {
    inconclusiveReasons.push({ code: 'UNDOCUMENTED_NON_P0_RESULT', caseId: testCase.id, status: testCase.status || null });
  } else {
    partialReasons.push({ code: 'NON_P0_NOT_PASS', caseId: testCase.id, status: testCase.status || null });
  }
}

for (const exclusion of run.execution.slowTestExclusions) {
  partialReasons.push({ code: 'SLOW_TEST_EXCLUSION', caseId: exclusion.id });
}

if (run.lifecycle.cleanup.status !== 'PASS') {
  inconclusiveReasons.push({ code: 'CLEANUP_NOT_PASS', status: run.lifecycle.cleanup.status });
}
if (run.lifecycle.teardown.status !== 'PASS') {
  inconclusiveReasons.push({ code: 'TEARDOWN_NOT_PASS', status: run.lifecycle.teardown.status });
}
if (run.lifecycle.orphanAudit.status !== 'PASS') {
  inconclusiveReasons.push({ code: 'ORPHAN_AUDIT_NOT_PASS', status: run.lifecycle.orphanAudit.status });
}
if (run.lifecycle.absenceProbes.length === 0) {
  inconclusiveReasons.push({ code: 'ABSENCE_PROBES_MISSING' });
} else {
  for (const probe of run.lifecycle.absenceProbes) {
    if (probe.status !== 'PASS') {
      inconclusiveReasons.push({ code: 'ABSENCE_PROBE_NOT_PASS', probeId: probe.id, status: probe.status });
    }
  }
}

let verdict = 'PASS';
let exitCode = 0;
let reasons = [];
if (blockedReasons.length > 0) {
  verdict = 'BLOCKED';
  exitCode = 3;
  reasons = blockedReasons;
} else if (inconclusiveReasons.length > 0) {
  verdict = 'INCONCLUSIVE';
  exitCode = 4;
  reasons = inconclusiveReasons;
} else if (partialReasons.length > 0) {
  verdict = 'PARTIAL';
  exitCode = 2;
  reasons = partialReasons;
}

const diagnosticP0Bypass = diagnosticOnly
  && blockedReasons.length === 0
  && partialReasons.length === 0
  && inconclusiveReasons.length > 0
  && inconclusiveReasons.every((reason) => reason.code === 'SELECTED_P0_NOT_PASS');

const output = {
  verdict,
  exit_code: diagnosticP0Bypass ? 0 : exitCode,
  mode: diagnosticOnly ? 'diagnostic-only' : 'normal',
  qualifying_pass: verdict === 'PASS',
  selection: {
    collected: run.selection.collectedCount,
    selected: selectedCases.length,
    executed: executedCases.length,
  },
  reasons,
};

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
if (output.exit_code !== 0) process.stderr.write(`ERROR: verdict=${verdict}\n`);
process.exit(output.exit_code);
