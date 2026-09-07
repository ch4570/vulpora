#!/usr/bin/env node
'use strict';

const fs = require('node:fs');

const CASE_ID = /^TC-[A-Z0-9]+(?:-[A-Z0-9]+)*-\d{3}$/;
const REQUIREMENT_ID = /^REQ-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
const RISK_ID = /^RISK-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
const SCENARIO_ID = /^E2E-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
const PRIORITIES = new Set(['P0', 'P1', 'P2']);
const LEVELS = new Set(['unit', 'integration', 'e2e']);
const EXECUTORS = new Set(['e2e-test-runner', 'playwright-e2e']);
const ROOT_FIELDS = ['schemaVersion', 'title', 'target', 'requirements', 'risks', 'testCases', 'traceability', 'handoffs'];

const errors = [];

function error(code, detail) {
  errors.push(`${code}: ${detail}`);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function requireString(value, code, path) {
  if (!nonEmptyString(value)) error(code, `${path} must be a non-empty string`);
}

function requireStringArray(value, code, path) {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => !nonEmptyString(item))) {
    error(code, `${path} must be a non-empty string array`);
    return false;
  }
  return true;
}

function duplicates(values) {
  const seen = new Set();
  return [...new Set(values.filter((value) => seen.has(value) || !seen.add(value)))];
}

function loadPlan(file) {
  let stat;
  try {
    stat = fs.lstatSync(file);
  } catch {
    process.stderr.write(`QAP-INPUT: cannot read ${file}\n`);
    process.exit(2);
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    process.stderr.write(`QAP-INPUT: input must be a regular non-symlink file: ${file}\n`);
    process.exit(2);
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (reason) {
    process.stderr.write(`QAP-JSON: ${reason.message}\n`);
    process.exit(1);
  }
}

function validateSources(plan, key, idPattern, code) {
  const values = plan[key];
  if (!Array.isArray(values) || values.length === 0) {
    error(code, `${key} must be a non-empty array`);
    return new Map();
  }
  const ids = [];
  const result = new Map();
  values.forEach((item, index) => {
    const path = `${key}[${index}]`;
    if (!isObject(item)) {
      error(code, `${path} must be an object`);
      return;
    }
    if (!idPattern.test(item.id || '')) error(code, `${path}.id has an invalid format`);
    requireString(item.description, code, `${path}.description`);
    requireString(item.sourceRef, 'QAP-GROUND-SOURCE', `${path}.sourceRef`);
    if (!PRIORITIES.has(item.priority)) error(code, `${path}.priority must be P0, P1, or P2`);
    if (nonEmptyString(item.id)) {
      ids.push(item.id);
      result.set(item.id, item);
    }
  });
  const repeated = duplicates(ids);
  if (repeated.length) error('QAP-DUPLICATE-ID', `${key}: ${repeated.join(', ')}`);
  return result;
}

function validateCaseShape(item, index, requirementMap, riskMap) {
  const path = `testCases[${index}]`;
  if (!isObject(item)) {
    error('QAP-CASE', `${path} must be an object`);
    return;
  }
  if (!CASE_ID.test(item.id || '')) error('QAP-CASE-ID', `${path}.id has an invalid format`);
  const hasRequirements = requireStringArray(item.requirementIds, 'QAP-TRACE-REQUIREMENT', `${path}.requirementIds`);
  const hasRisks = requireStringArray(item.riskIds, 'QAP-TRACE-RISK', `${path}.riskIds`);
  if (hasRequirements) {
    for (const id of item.requirementIds) if (!requirementMap.has(id)) {
      error('QAP-TRACE-UNKNOWN', `${item.id || path} references unknown requirement ${id}`);
    }
  }
  if (hasRisks) {
    for (const id of item.riskIds) if (!riskMap.has(id)) {
      error('QAP-TRACE-UNKNOWN', `${item.id || path} references unknown risk ${id}`);
    }
  }
  requireStringArray(item.preconditions, 'QAP-CASE', `${path}.preconditions`);
  requireStringArray(item.steps, 'QAP-CASE', `${path}.steps`);
  if (requireStringArray(item.expected, 'QAP-EXPECTED', `${path}.expected`)) {
    const vague = item.expected.filter((value) => /^(?:정상(?:적으로)?\s*동작|에러\s*(?:가\s*)?(?:없음|나지\s*않음)|works|no errors?)\.?$/i.test(value.trim()));
    if (vague.length) error('QAP-EXPECTED', `${item.id || path} has a non-observable expected result`);
  }
  if (!PRIORITIES.has(item.priority)) error('QAP-CASE', `${path}.priority must be P0, P1, or P2`);
  requireString(item.type, 'QAP-CASE', `${path}.type`);
  if (!LEVELS.has(item.level)) error('QAP-CASE', `${path}.level must be unit, integration, or e2e`);
  if (!isObject(item.input) || item.input.classification !== 'synthetic' || !isObject(item.input.values)) {
    error('QAP-NON-SYNTHETIC', `${path}.input must declare synthetic classification and object values`);
  }

  if (item.priority === 'P0') {
    if (!Array.isArray(item.grounding) || item.grounding.length === 0) {
      error('QAP-P0-UNGROUNDED', `${item.id || path} has no grounding`);
    } else {
      const grounded = new Set();
      item.grounding.forEach((entry, groundingIndex) => {
        if (!isObject(entry) || !nonEmptyString(entry.sourceId) || !nonEmptyString(entry.evidence)) {
          error('QAP-P0-UNGROUNDED', `${path}.grounding[${groundingIndex}] is incomplete`);
        } else {
          grounded.add(entry.sourceId);
        }
      });
      for (const id of [...(item.requirementIds || []), ...(item.riskIds || [])]) {
        if (!grounded.has(id)) error('QAP-P0-UNGROUNDED', `${item.id || path} lacks grounding for ${id}`);
      }
    }
  }
}

function validateTraceability(plan, sourceMap, caseMap) {
  if (!Array.isArray(plan.traceability)) {
    error('QAP-TRACE-MATRIX', 'traceability must be an array');
    return;
  }
  const rows = new Map();
  for (const [index, row] of plan.traceability.entries()) {
    const path = `traceability[${index}]`;
    if (!isObject(row) || !nonEmptyString(row.sourceId)) {
      error('QAP-TRACE-MATRIX', `${path} must declare sourceId`);
      continue;
    }
    if (rows.has(row.sourceId)) error('QAP-DUPLICATE-ID', `traceability source ${row.sourceId}`);
    rows.set(row.sourceId, row);
    if (!sourceMap.has(row.sourceId)) error('QAP-TRACE-UNKNOWN', `${path} references unknown source ${row.sourceId}`);
    if (!Array.isArray(row.testCaseIds)) {
      error('QAP-TRACE-MATRIX', `${path}.testCaseIds must be an array`);
      continue;
    }
    for (const caseId of row.testCaseIds) if (!caseMap.has(caseId)) {
      error('QAP-TRACE-UNKNOWN', `${path} references unknown case ${caseId}`);
    }
    if (row.status === 'covered') {
      if (row.testCaseIds.length === 0) error('QAP-TRACE-MATRIX', `${row.sourceId} is covered without cases`);
    } else if (row.status === 'accepted-gap') {
      if (row.testCaseIds.length !== 0 || !nonEmptyString(row.rationale)) {
        error('QAP-TRACE-MATRIX', `${row.sourceId} accepted-gap requires no cases and a rationale`);
      }
    } else {
      error('QAP-TRACE-MATRIX', `${path}.status must be covered or accepted-gap`);
    }
  }

  for (const [sourceId, source] of sourceMap) {
    const linkedCases = [...caseMap.values()].filter((testCase) => (
      (testCase.requirementIds || []).includes(sourceId) || (testCase.riskIds || []).includes(sourceId)
    )).map((testCase) => testCase.id).sort();
    const row = rows.get(sourceId);
    if (!row) {
      error('QAP-TRACE-MATRIX', `missing traceability row for ${sourceId}`);
      continue;
    }
    const declared = Array.isArray(row.testCaseIds) ? [...row.testCaseIds].sort() : [];
    if (JSON.stringify(linkedCases) !== JSON.stringify(declared)) {
      error('QAP-TRACE-MISMATCH', `${sourceId}: cases and traceability row disagree`);
    }
    if (source.priority === 'P0') {
      const p0Cases = linkedCases.filter((caseId) => caseMap.get(caseId)?.priority === 'P0');
      if (row.status !== 'covered' || p0Cases.length === 0) {
        error('QAP-P0-UNCOVERED', `${sourceId} is not covered by a P0 case`);
      }
    }
  }
}

function requireLifecycleObject(value, code, path, fields) {
  if (!isObject(value)) {
    error(code, `${path} must be an object`);
    return;
  }
  for (const field of fields) requireString(value[field], code, `${path}.${field}`);
}

function validateHandoffs(plan, caseMap) {
  if (!Array.isArray(plan.handoffs)) {
    error('QAP-HANDOFF', 'handoffs must be an array');
    return;
  }
  const scenarioIds = [];
  const handedOffCaseIds = new Set();
  plan.handoffs.forEach((handoff, index) => {
    const path = `handoffs[${index}]`;
    if (!isObject(handoff)) {
      error('QAP-HANDOFF', `${path} must be an object`);
      return;
    }
    if (!SCENARIO_ID.test(handoff.scenarioId || '')) error('QAP-HANDOFF', `${path}.scenarioId has an invalid format`);
    else scenarioIds.push(handoff.scenarioId);
    if (!EXECUTORS.has(handoff.executor)) error('QAP-HANDOFF', `${path}.executor is unsupported`);
    if (requireStringArray(handoff.testCaseIds, 'QAP-HANDOFF', `${path}.testCaseIds`)) {
      const repeatedCaseIds = duplicates(handoff.testCaseIds);
      if (repeatedCaseIds.length) error('QAP-DUPLICATE-ID', `${path}.testCaseIds: ${repeatedCaseIds.join(', ')}`);
      for (const id of handoff.testCaseIds) if (!caseMap.has(id)) error('QAP-TRACE-UNKNOWN', `${path} references unknown case ${id}`);
      for (const id of handoff.testCaseIds) handedOffCaseIds.add(id);
    }
    if (!PRIORITIES.has(handoff.priority)) error('QAP-HANDOFF', `${path}.priority must be P0, P1, or P2`);
    if (handoff.priority !== 'P0' && (handoff.testCaseIds || []).some((id) => caseMap.get(id)?.priority === 'P0')) {
      error('QAP-HANDOFF-PRIORITY', `${path} lowers a P0 case to ${handoff.priority}`);
    }
    requireStringArray(handoff.expected, 'QAP-EXPECTED', `${path}.expected`);
    if (!isObject(handoff.syntheticData) || handoff.syntheticData.classification !== 'synthetic') {
      error('QAP-NON-SYNTHETIC', `${path}.syntheticData.classification must be synthetic`);
    } else {
      requireString(handoff.syntheticData.seedRef, 'QAP-NON-SYNTHETIC', `${path}.syntheticData.seedRef`);
    }
    requireLifecycleObject(handoff.seed, 'QAP-LIFECYCLE-SEED', `${path}.seed`, ['owner', 'method']);
    requireLifecycleObject(handoff.cleanup, 'QAP-LIFECYCLE-CLEANUP', `${path}.cleanup`, ['owner', 'method']);
    requireLifecycleObject(handoff.absenceProbe, 'QAP-LIFECYCLE-ABSENCE-PROBE', `${path}.absenceProbe`, ['method', 'expected']);
    if (handoff.executor === 'playwright-e2e') requireString(handoff.locatorEvidence, 'QAP-LOCATOR-EVIDENCE', `${path}.locatorEvidence`);
  });
  const repeated = duplicates(scenarioIds);
  if (repeated.length) error('QAP-DUPLICATE-ID', `handoffs: ${repeated.join(', ')}`);
  for (const testCase of caseMap.values()) {
    if (testCase.level === 'e2e' && !handedOffCaseIds.has(testCase.id)) {
      error('QAP-HANDOFF-MISSING', `${testCase.id} is an E2E case without an execution handoff`);
    }
  }
}

function validateSensitiveData(value, path = '$') {
  if (typeof value === 'string') {
    const patterns = [
      ['email', /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
      ['phone', /(?:\+?82[- ]?)?0?1[016789][-. ]?\d{3,4}[-. ]?\d{4}\b/],
      ['resident-registration-number', /\b\d{6}[- ]?[1-4]\d{6}\b/],
    ];
    for (const [kind, pattern] of patterns) if (pattern.test(value)) error('QAP-PII', `${path} contains ${kind}-shaped data`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateSensitiveData(item, `${path}[${index}]`));
    return;
  }
  if (!isObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (/(?:password|passwd|secret|token|cookie|authorization|access.?key|refresh.?key)/i.test(key)
      && child !== null && child !== '' && child !== '[REDACTED]') {
      error('QAP-PII', `${path}.${key} is a populated credential-like field`);
    }
    validateSensitiveData(child, `${path}.${key}`);
  }
}

function validate(plan) {
  if (!isObject(plan)) {
    error('QAP-ROOT', 'root must be an object');
    return;
  }
  for (const field of ROOT_FIELDS) if (!(field in plan)) error('QAP-ROOT', `missing ${field}`);
  if (plan.schemaVersion !== 'vulpora.qa-test-plan/v1') error('QAP-VERSION', 'unsupported schemaVersion');
  requireString(plan.title, 'QAP-ROOT', 'title');
  requireString(plan.target, 'QAP-ROOT', 'target');

  const requirementMap = validateSources(plan, 'requirements', REQUIREMENT_ID, 'QAP-REQUIREMENT');
  const riskMap = validateSources(plan, 'risks', RISK_ID, 'QAP-RISK');
  const cases = Array.isArray(plan.testCases) ? plan.testCases : [];
  if (cases.length === 0) error('QAP-CASE', 'testCases must be a non-empty array');
  cases.forEach((item, index) => validateCaseShape(item, index, requirementMap, riskMap));
  const caseIds = cases.filter(isObject).map((item) => item.id).filter(nonEmptyString);
  const repeated = duplicates(caseIds);
  if (repeated.length) error('QAP-DUPLICATE-ID', `testCases: ${repeated.join(', ')}`);
  const caseMap = new Map(cases.filter(isObject).map((item) => [item.id, item]));
  const sourceMap = new Map([...requirementMap, ...riskMap]);
  validateTraceability(plan, sourceMap, caseMap);
  validateHandoffs(plan, caseMap);
  validateSensitiveData(plan);
}

if (process.argv.length !== 3) {
  process.stderr.write('Usage: validate-test-plan.js <plan.qa-plan.json>\n');
  process.exit(2);
}

const plan = loadPlan(process.argv[2]);
validate(plan);
if (errors.length) {
  process.stderr.write(`${errors.join('\n')}\n`);
  process.exit(1);
}
process.stdout.write(`QA plan valid: ${process.argv[2]}\n`);
