#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const {assessDimensions} = require('./assess-clarity.js');

const THRESHOLD = 85;
const UNKNOWN_CATEGORIES = new Set([
  'goal', 'scope', 'acceptance', 'constraints', 'authority', 'destructive', 'credential',
  'external_write', 'public_contract', 'material_data_model', 'verification', 'implementation_detail',
]);
const NON_BYPASSABLE_CATEGORIES = new Set([
  'goal', 'authority', 'destructive', 'credential', 'external_write', 'public_contract', 'material_data_model',
]);

function fail(code, detail) {
  process.stderr.write(`${code}${detail ? `:${detail}` : ''}\n`);
  process.exit(1);
}

function readInput() {
  try {
    const value = JSON.parse(fs.readFileSync(0, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_INPUT');
    return value;
  } catch (error) {
    fail('INVALID_JSON', error.message);
  }
}

function validateUnknowns(input) {
  if (!Array.isArray(input.unknowns)) fail('INVALID_UNKNOWNS');
  const ids = new Set();
  return input.unknowns.map((unknown) => {
    if (!unknown || typeof unknown !== 'object'
      || typeof unknown.id !== 'string'
      || !/^U-[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(unknown.id)) fail('INVALID_UNKNOWN');
    if (ids.has(unknown.id)) fail('DUPLICATE_UNKNOWN', unknown.id);
    ids.add(unknown.id);
    if (!UNKNOWN_CATEGORIES.has(unknown.category)) fail('INVALID_UNKNOWN_CATEGORY', unknown.id);
    if (typeof unknown.summary !== 'string' || unknown.summary.trim().length < 12) {
      fail('INVALID_UNKNOWN_SUMMARY', unknown.id);
    }
    if (typeof unknown.blocking !== 'boolean') fail('INVALID_UNKNOWN_BLOCKING', unknown.id);
    if (!['pending', 'assumed', 'excluded', 'accepted_risk'].includes(unknown.disposition)) {
      fail('INVALID_UNKNOWN_DISPOSITION', unknown.id);
    }
    if (unknown.blocking && unknown.disposition !== 'pending') fail('BLOCKING_UNKNOWN_NOT_PENDING', unknown.id);
    if (NON_BYPASSABLE_CATEGORIES.has(unknown.category) && (!unknown.blocking || unknown.disposition !== 'pending')) {
      fail('NON_BYPASSABLE_UNKNOWN_NOT_BLOCKING', unknown.id);
    }
    return {
      id: unknown.id,
      category: unknown.category,
      summary: unknown.summary.trim(),
      blocking: unknown.blocking,
      disposition: unknown.disposition,
    };
  });
}

function validateProceed(input, unknowns, score) {
  const proceed = input.proceed;
  if (!proceed || typeof proceed !== 'object' || Array.isArray(proceed)
    || typeof proceed.requested !== 'boolean') fail('INVALID_PROCEED_DECISION');
  const nonBypassableIds = unknowns
    .filter((unknown) => NON_BYPASSABLE_CATEGORIES.has(unknown.category))
    .map((unknown) => unknown.id);
  const acceptedRiskIds = unknowns
    .filter((unknown) => unknown.disposition === 'accepted_risk')
    .map((unknown) => unknown.id);
  if (!proceed.requested) {
    if (proceed.basis !== null || proceed.reason !== null || proceed.decision_ref !== null
      || proceed.decision_context !== null) fail('STALE_PROCEED_DECISION');
    return {
      requested: false,
      basis: null,
      reason: null,
      accepted_risk_unknown_ids: acceptedRiskIds,
      non_bypassable_blocker_ids: nonBypassableIds,
    };
  }
  if (score >= THRESHOLD) fail('UNNECESSARY_PROCEED_DECISION');
  if (nonBypassableIds.length > 0 || unknowns.some((unknown) => unknown.blocking)) {
    fail('PROCEED_WITH_NON_BYPASSABLE_BLOCKER');
  }
  if (acceptedRiskIds.length === 0
    || unknowns.some((unknown) => !['accepted_risk', 'excluded'].includes(unknown.disposition))) {
    fail('PROCEED_WITH_UNRESOLVED_UNKNOWN');
  }
  if (proceed.basis !== 'explicit_user_request'
    || typeof proceed.reason !== 'string' || proceed.reason.trim().length < 12
    || !/^answer-sha256:[a-f0-9]{64}$/.test(proceed.decision_ref || '')
    || !proceed.decision_context || typeof proceed.decision_context !== 'object'
    || Array.isArray(proceed.decision_context)) fail('INVALID_PROCEED_PROVENANCE');
  return {
    requested: true,
    basis: proceed.basis,
    reason: proceed.reason.trim(),
    decision_ref: proceed.decision_ref,
    decision_context: proceed.decision_context,
    accepted_risk_unknown_ids: acceptedRiskIds,
    non_bypassable_blocker_ids: [],
  };
}

const input = readInput();
if (Object.keys(input).sort().join('\n') !== ['assessment', 'proceed', 'unknowns'].join('\n')) {
  fail('INVALID_INPUT_FIELDS');
}
const unknowns = validateUnknowns(input);
let assessed;
try { assessed = assessDimensions(input.assessment, unknowns); } catch (error) { fail(error.code || error.message); }
const {dimensions, score} = assessed;
const skip = validateProceed(input, unknowns, score);
const pending = unknowns.filter((unknown) => unknown.disposition === 'pending');
const canPass = score >= THRESHOLD && pending.length === 0
  && skip.non_bypassable_blocker_ids.length === 0 && skip.accepted_risk_unknown_ids.length === 0;
const canSkip = skip.requested === true;
const status = canPass ? 'passed' : canSkip ? 'skipped' : 'blocked';

process.stdout.write(JSON.stringify({
  spec_status: status === 'blocked' ? 'needs_input' : 'ready',
  approval: status !== 'blocked',
  unknowns,
  clarity_gate: {score, threshold: THRESHOLD, status, dimensions, skip},
}) + '\n');
