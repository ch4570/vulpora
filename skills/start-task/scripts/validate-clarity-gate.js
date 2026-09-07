#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');

const EXPECTED = [
  ['goal', 20],
  ['scope', 20],
  ['acceptance', 20],
  ['constraints', 15],
  ['authority_risk', 15],
  ['verification', 10],
];
const UNKNOWN_CATEGORIES = new Set([
  'goal',
  'scope',
  'acceptance',
  'constraints',
  'authority',
  'destructive',
  'credential',
  'external_write',
  'public_contract',
  'material_data_model',
  'verification',
  'implementation_detail',
]);
const NON_BYPASSABLE_CATEGORIES = new Set([
  'goal',
  'authority',
  'destructive',
  'credential',
  'external_write',
  'public_contract',
  'material_data_model',
]);

function reject(code, detail) {
  process.stderr.write(`${code}${detail ? `:${detail}` : ''}\n`);
  process.exit(1);
}

function canonicalJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string' || typeof value === 'number') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function stringArray(value, name) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.length === 0)) {
    reject('INVALID_ARRAY', name);
  }
  if (new Set(value).size !== value.length) reject('DUPLICATE_ARRAY_VALUE', name);
  return value;
}

let input;
try {
  input = JSON.parse(fs.readFileSync(0, 'utf8'));
} catch (error) {
  reject('INVALID_JSON', error.message);
}

if (!input || typeof input !== 'object' || Array.isArray(input)) reject('INVALID_INPUT');
if (!['needs_input', 'ready', 'escalated', 'cancelled', 'failed'].includes(input.spec_status)) {
  reject('INVALID_SPEC_STATUS');
}
if (typeof input.approval !== 'boolean') reject('INVALID_APPROVAL');
const gate = input.clarity_gate;
if (!gate || typeof gate !== 'object' || Array.isArray(gate)) reject('MISSING_CLARITY_GATE');
if (!['blocked', 'passed', 'skipped'].includes(gate.status)) reject('INVALID_GATE_STATUS');
if (gate.threshold !== 85) reject('INVALID_THRESHOLD');
if (!Number.isInteger(gate.score) || gate.score < 0 || gate.score > 100) reject('INVALID_SCORE');
if (!Array.isArray(gate.dimensions) || gate.dimensions.length !== EXPECTED.length) {
  reject('INVALID_DIMENSION_COUNT');
}

const byId = new Map();
for (const dimension of gate.dimensions) {
  if (!dimension || typeof dimension !== 'object' || typeof dimension.id !== 'string') {
    reject('INVALID_DIMENSION');
  }
  if (byId.has(dimension.id)) reject('DUPLICATE_DIMENSION', dimension.id);
  byId.set(dimension.id, dimension);
}

let recomputedScore = 0;
for (const [id, weight] of EXPECTED) {
  const dimension = byId.get(id);
  if (!dimension) reject('MISSING_DIMENSION', id);
  if (dimension.weight !== weight) reject('INVALID_WEIGHT', id);
  if (!Number.isInteger(dimension.rating) || dimension.rating < 0 || dimension.rating > 4) {
    reject('INVALID_RATING', id);
  }
  const expectedAwarded = Math.floor((weight * dimension.rating) / 4 + 0.5);
  if (dimension.awarded !== expectedAwarded) reject('INVALID_AWARDED', id);
  const evidenceMatch = typeof dimension.evidence === 'string'
    ? dimension.evidence.trim().match(/^(user|repository|policy|assumption):\s*\S.{10,}$/u)
    : null;
  if (!evidenceMatch) {
    reject('INVALID_EVIDENCE_PROVENANCE', id);
  }
  const evidenceSource = evidenceMatch[1];
  if (evidenceSource === 'assumption' && dimension.rating > 2) reject('ASSUMPTION_EVIDENCE_OVERCLAIM', id);
  if (id === 'goal' && evidenceSource !== 'user') reject('GOAL_REQUIRES_USER_EVIDENCE');
  if (id === 'authority_risk' && !['user', 'policy'].includes(evidenceSource)) {
    reject('AUTHORITY_REQUIRES_USER_OR_POLICY_EVIDENCE');
  }
  recomputedScore += expectedAwarded;
}
if (gate.score !== recomputedScore) reject('SCORE_MISMATCH');

if (!Array.isArray(input.unknowns)) reject('INVALID_UNKNOWNS');
const unknownById = new Map();
for (const unknown of input.unknowns) {
  if (!unknown || typeof unknown !== 'object' || typeof unknown.id !== 'string'
    || !/^U-[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(unknown.id)) {
    reject('INVALID_UNKNOWN');
  }
  if (unknownById.has(unknown.id)) reject('DUPLICATE_UNKNOWN', unknown.id);
  if (!UNKNOWN_CATEGORIES.has(unknown.category)) reject('INVALID_UNKNOWN_CATEGORY', unknown.id);
  if (typeof unknown.summary !== 'string' || unknown.summary.trim().length < 12) {
    reject('INVALID_UNKNOWN_SUMMARY', unknown.id);
  }
  if (typeof unknown.blocking !== 'boolean') reject('INVALID_UNKNOWN_BLOCKING', unknown.id);
  if (!['pending', 'assumed', 'excluded', 'accepted_risk'].includes(unknown.disposition)) {
    reject('INVALID_UNKNOWN_DISPOSITION', unknown.id);
  }
  if (unknown.blocking && unknown.disposition !== 'pending') reject('BLOCKING_UNKNOWN_NOT_PENDING', unknown.id);
  if (!unknown.blocking && unknown.disposition === 'pending'
    && input.spec_status === 'ready') {
    reject('READY_WITH_PENDING_UNKNOWN', unknown.id);
  }
  unknownById.set(unknown.id, unknown);
}
const blockingUnknownIds = [...unknownById.values()].filter((item) => item.blocking).map((item) => item.id);
const skip = gate.skip;
if (!skip || typeof skip !== 'object' || Array.isArray(skip)) reject('MISSING_SKIP_PROVENANCE');
const acceptedRisks = stringArray(skip.accepted_risk_unknown_ids, 'accepted_risk_unknown_ids');
const nonBypassable = stringArray(skip.non_bypassable_blocker_ids, 'non_bypassable_blocker_ids');
if (nonBypassable.some((id) => !blockingUnknownIds.includes(id))) reject('NON_BYPASSABLE_NOT_BLOCKING');
const structuralNonBypassableIds = [...unknownById.values()]
  .filter((item) => NON_BYPASSABLE_CATEGORIES.has(item.category))
  .map((item) => item.id);
if (structuralNonBypassableIds.some((id) => !blockingUnknownIds.includes(id))) {
  reject('NON_BYPASSABLE_UNKNOWN_NOT_BLOCKING');
}
if (structuralNonBypassableIds.some((id) => !nonBypassable.includes(id))) {
  reject('NON_BYPASSABLE_UNKNOWN_NOT_DECLARED');
}
const dispositionAcceptedRisks = [...unknownById.values()]
  .filter((item) => item.disposition === 'accepted_risk')
  .map((item) => item.id)
  .sort();
if (acceptedRisks.slice().sort().join('\n') !== dispositionAcceptedRisks.join('\n')) {
  reject('ACCEPTED_RISK_DISPOSITION_MISMATCH');
}

if (gate.status === 'passed') {
  if (gate.score < gate.threshold) reject('PASSED_BELOW_THRESHOLD');
  if (nonBypassable.length > 0) reject('PASSED_WITH_NON_BYPASSABLE_BLOCKER');
  if (skip.requested !== false) reject('PASSED_WITH_SKIP_REQUEST');
  if (skip.basis !== null || skip.reason !== null) reject('PASSED_WITH_STALE_SKIP_PROVENANCE');
  if (skip.decision_context !== undefined && skip.decision_context !== null) reject('PASSED_WITH_DECISION_CONTEXT');
  if (skip.decision_ref !== undefined && skip.decision_ref !== null) reject('PASSED_WITH_SKIP_DECISION_REF');
  if (acceptedRisks.length > 0) reject('PASSED_WITH_ACCEPTED_RISK');
}

if (gate.status === 'skipped') {
  if (skip.requested !== true || skip.basis !== 'explicit_user_request') reject('INVALID_SKIP_BASIS');
  if (typeof skip.reason !== 'string' || skip.reason.trim().length < 12) reject('MISSING_SKIP_REASON');
  if (!/^answer-sha256:[a-f0-9]{64}$/.test(skip.decision_ref || '')) reject('MISSING_SKIP_DECISION_REF');
  if (gate.score >= gate.threshold) reject('UNNECESSARY_SKIP');
  if (nonBypassable.length > 0) reject('SKIPPED_WITH_NON_BYPASSABLE_BLOCKER');
  if (acceptedRisks.length === 0) reject('SKIPPED_WITHOUT_ACCEPTED_RISK');
  if (acceptedRisks.some((id) => !unknownById.has(id))) reject('UNKNOWN_ACCEPTED_RISK_ID');
  if (acceptedRisks.some((id) => blockingUnknownIds.includes(id))) reject('ACCEPTED_RISK_STILL_BLOCKING');
  if (acceptedRisks.some((id) => NON_BYPASSABLE_CATEGORIES.has(unknownById.get(id)?.category))) {
    reject('NON_BYPASSABLE_ACCEPTED_RISK');
  }
  if ([...unknownById.values()].some((unknown) => !['accepted_risk', 'excluded'].includes(unknown.disposition))) {
    reject('SKIPPED_WITH_HIDDEN_UNKNOWN');
  }
  const context = skip.decision_context;
  const contextFields = ['answer_sha256', 'offer_ref', 'offer_sha256', 'offered_ambiguity_score', 'offered_clarity_score', 'offered_unknown_ids', 'offered_unknowns_sha256', 'question_signature', 'run_id'];
  if (!context || typeof context !== 'object' || Array.isArray(context)
    || Object.keys(context).sort().join('\n') !== contextFields.sort().join('\n')) {
    reject('INVALID_SKIP_DECISION_CONTEXT');
  }
  const offeredUnknownIds = stringArray(context.offered_unknown_ids, 'offered_unknown_ids').slice().sort();
  const currentUnknownIds = [...unknownById.keys()].sort();
  const currentUnknownsSha = crypto.createHash('sha256')
    .update(canonicalJson([...unknownById.values()].sort((left, right) => left.id.localeCompare(right.id))))
    .digest('hex');
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(context.run_id || '')
    || !/^[a-f0-9]{64}$/.test(context.answer_sha256 || '')
    || skip.decision_ref !== `answer-sha256:${context.answer_sha256}`
    || context.offered_clarity_score !== gate.score
    || context.offered_ambiguity_score !== 100 - gate.score
    || offeredUnknownIds.join('\n') !== currentUnknownIds.join('\n')
    || context.offered_unknowns_sha256 !== currentUnknownsSha
    || !/^blocker:[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(context.question_signature || '')) {
    reject('SKIP_DECISION_CONTEXT_DRIFT');
  }
  const offerPayload = {
    run_id: context.run_id,
    offered_clarity_score: context.offered_clarity_score,
    offered_ambiguity_score: context.offered_ambiguity_score,
    offered_unknown_ids: context.offered_unknown_ids,
    offered_unknowns_sha256: context.offered_unknowns_sha256,
    question_signature: context.question_signature,
  };
  const expectedOfferSha = crypto.createHash('sha256').update(canonicalJson(offerPayload)).digest('hex');
  const expectedOfferRef = `file-sha256:${expectedOfferSha}:.vulpora/tasks/${context.run_id}/clarification-offer-${expectedOfferSha}.json`;
  if (context.offer_sha256 !== expectedOfferSha || context.offer_ref !== expectedOfferRef) {
    reject('SKIP_DECISION_OFFER_DRIFT');
  }
  if ((byId.get('goal')?.rating ?? 0) === 0 || (byId.get('authority_risk')?.rating ?? 0) === 0) {
    reject('SKIP_WITHOUT_ACTIONABLE_GOAL_OR_AUTHORITY');
  }
}

if (gate.status === 'skipped' && (input.spec_status !== 'ready' || input.approval !== true)) {
  reject('SKIPPED_WITHOUT_READY_APPROVAL');
}

if (gate.status === 'blocked' && input.spec_status === 'ready') {
  reject('READY_WITH_BLOCKED_GATE');
}
const pendingUnknownIds = [...unknownById.values()]
  .filter((item) => item.disposition === 'pending')
  .map((item) => item.id);
if (input.spec_status === 'needs_input'
  && ['passed', 'skipped'].includes(gate.status)
  && blockingUnknownIds.length === 0
  && nonBypassable.length === 0
  && pendingUnknownIds.length === 0) {
  reject('OPEN_GATE_NOT_READY');
}
if (input.spec_status !== 'ready' && input.approval !== false) reject('APPROVAL_OUTSIDE_READY');
if (input.spec_status === 'ready') {
  if (input.approval !== true) reject('READY_WITHOUT_APPROVAL');
  if (blockingUnknownIds.length > 0) reject('READY_WITH_BLOCKING_UNKNOWN');
  if (!['passed', 'skipped'].includes(gate.status)) reject('READY_WITHOUT_OPEN_GATE');
}

process.stdout.write(JSON.stringify({
  outcome: 'pass',
  gate_status: gate.status,
  score: gate.score,
  threshold: gate.threshold,
  accepted_risk_count: acceptedRisks.length,
  decision_ref: skip.decision_ref ?? null,
}) + '\n');
