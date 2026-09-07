#!/usr/bin/env node
'use strict';

const fs = require('node:fs');

const FAILURE_CLASSES = new Set([
  'transient_effect_none',
  'route_health',
  'provider_health',
  'capability_insufficient',
  'deterministic_implementation_failure',
  'authentication',
  'quota',
  'missing_tool',
  'authority',
  'budget',
  'unknown_mutation_state',
  'unclassified',
]);
const BLOCKING_CLASSES = new Set(['authentication', 'quota', 'missing_tool', 'authority', 'budget']);

function reject(code, detail) {
  process.stderr.write(`${code}${detail ? `:${detail}` : ''}\n`);
  process.exit(1);
}

function object(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) reject('INVALID_OBJECT', name);
  return value;
}

function exactKeys(value, expected, name) {
  const actual = Object.keys(object(value, name)).sort();
  const wanted = expected.slice().sort();
  if (actual.join('\n') !== wanted.join('\n')) reject('INVALID_FIELDS', name);
}

function nonNegativeInteger(value, name) {
  if (!Number.isInteger(value) || value < 0) reject('INVALID_BOUND', name);
}

function nullableNonNegativeInteger(value, name) {
  if (value !== null) nonNegativeInteger(value, name);
}

function boolean(value, name) {
  if (typeof value !== 'boolean') reject('INVALID_BOOLEAN', name);
}

let input;
try {
  input = JSON.parse(fs.readFileSync(0, 'utf8'));
} catch (error) {
  reject('INVALID_JSON', error.message);
}

exactKeys(input, ['schema', 'failure_class', 'mutation_state', 'bounds', 'budget', 'failover', 'verifier'], 'input');
if (input.schema !== 'vulpora.routing-attempt-outcome/v1') reject('INVALID_SCHEMA');
if (!FAILURE_CLASSES.has(input.failure_class)) reject('INVALID_FAILURE_CLASS');
if (!['effect_none', 'known_effect', 'unknown'].includes(input.mutation_state)) reject('INVALID_MUTATION_STATE');

const bounds = object(input.bounds, 'bounds');
exactKeys(bounds, [
  'same_route_retries_used', 'same_route_retries_max',
  'same_tier_failovers_used', 'same_tier_failovers_max',
  'tier_escalations_used', 'tier_escalations_max',
  'route_hops_used', 'max_route_hops',
  'total_attempts_used', 'max_total_attempts',
  'repair_cycles_used', 'max_repair_cycles',
], 'bounds');
for (const name of [
  'same_route_retries_used', 'same_route_retries_max',
  'same_tier_failovers_used', 'same_tier_failovers_max',
  'tier_escalations_used', 'tier_escalations_max',
  'route_hops_used', 'total_attempts_used', 'repair_cycles_used', 'max_repair_cycles',
]) nonNegativeInteger(bounds[name], name);
nullableNonNegativeInteger(bounds.max_route_hops, 'max_route_hops');
nullableNonNegativeInteger(bounds.max_total_attempts, 'max_total_attempts');
if (bounds.same_route_retries_used > bounds.same_route_retries_max
  || bounds.same_tier_failovers_used > bounds.same_tier_failovers_max
  || bounds.tier_escalations_used > bounds.tier_escalations_max
  || bounds.repair_cycles_used > bounds.max_repair_cycles) reject('USED_EXCEEDS_BOUND');
if (bounds.max_route_hops !== null && bounds.route_hops_used > bounds.max_route_hops) {
  reject('USED_EXCEEDS_BOUND', 'route_hops');
}
if (bounds.max_total_attempts !== null && bounds.total_attempts_used > bounds.max_total_attempts) {
  reject('USED_EXCEEDS_BOUND', 'total_attempts');
}

const budget = object(input.budget, 'budget');
exactKeys(budget, [
  'task_total_relative_units', 'spent_relative_units', 'next_attempt_relative_units',
  'task_total_estimated_tokens', 'spent_estimated_tokens', 'next_attempt_estimated_tokens',
], 'budget');
nullableNonNegativeInteger(budget.task_total_relative_units, 'task_total_relative_units');
nullableNonNegativeInteger(budget.task_total_estimated_tokens, 'task_total_estimated_tokens');
for (const name of [
  'spent_relative_units', 'next_attempt_relative_units', 'spent_estimated_tokens', 'next_attempt_estimated_tokens',
]) nonNegativeInteger(budget[name], name);
if (budget.task_total_relative_units !== null
  && budget.spent_relative_units > budget.task_total_relative_units) reject('SPEND_EXCEEDS_BUDGET', 'relative_units');
if (budget.task_total_estimated_tokens !== null
  && budget.spent_estimated_tokens > budget.task_total_estimated_tokens) reject('SPEND_EXCEEDS_BUDGET', 'tokens');

const failover = object(input.failover, 'failover');
exactKeys(failover, ['same_tier_candidate_available', 'crosses_provider', 'data_policy'], 'failover');
boolean(failover.same_tier_candidate_available, 'same_tier_candidate_available');
boolean(failover.crosses_provider, 'crosses_provider');
const dataPolicy = object(failover.data_policy, 'data_policy');
exactKeys(dataPolicy, ['reference', 'version', 'cross_provider_transfer'], 'data_policy');
if (dataPolicy.reference !== null && (typeof dataPolicy.reference !== 'string' || dataPolicy.reference.length === 0)) {
  reject('INVALID_DATA_POLICY_REFERENCE');
}
if (dataPolicy.version !== null) {
  nonNegativeInteger(dataPolicy.version, 'data_policy.version');
  if (dataPolicy.version === 0) reject('INVALID_DATA_POLICY_VERSION');
}
if (!['allow', 'deny', 'unknown'].includes(dataPolicy.cross_provider_transfer)) reject('INVALID_DATA_POLICY_DECISION');

const verifier = object(input.verifier, 'verifier');
exactKeys(verifier, ['capability_insufficient', 'evidence_ref'], 'verifier');
boolean(verifier.capability_insufficient, 'capability_insufficient');
if (verifier.evidence_ref !== null
  && (typeof verifier.evidence_ref !== 'string' || verifier.evidence_ref.length === 0)) reject('INVALID_VERIFIER_REFERENCE');

function attemptBudgetAvailable() {
  return bounds.max_total_attempts !== null
    && bounds.total_attempts_used < bounds.max_total_attempts
    && budget.task_total_relative_units !== null
    && budget.task_total_estimated_tokens !== null
    && budget.spent_relative_units + budget.next_attempt_relative_units <= budget.task_total_relative_units
    && budget.spent_estimated_tokens + budget.next_attempt_estimated_tokens <= budget.task_total_estimated_tokens;
}

function hopAvailable() {
  return bounds.max_route_hops !== null && bounds.route_hops_used < bounds.max_route_hops;
}

let action;
let reason;
let consumesRouteHop = false;

if (input.mutation_state === 'unknown' || input.failure_class === 'unknown_mutation_state') {
  action = 'reconcile';
  reason = 'UNKNOWN_MUTATION_STATE';
} else if (input.failure_class === 'transient_effect_none') {
  if (input.mutation_state !== 'effect_none') {
    action = 'stop'; reason = 'TRANSIENT_WITH_EFFECT';
  } else if (bounds.same_route_retries_used >= bounds.same_route_retries_max) {
    action = 'block'; reason = 'SAME_ROUTE_RETRY_BOUND_EXHAUSTED';
  } else if (!attemptBudgetAvailable()) {
    action = 'block'; reason = 'TOTAL_ATTEMPT_OR_BUDGET_GATE';
  } else {
    action = 'retry_same_route'; reason = 'TRANSIENT_EFFECT_NONE';
  }
} else if (input.failure_class === 'route_health' || input.failure_class === 'provider_health') {
  if (!failover.same_tier_candidate_available) {
    action = 'block'; reason = 'NO_SAME_TIER_CANDIDATE';
  } else if (bounds.same_tier_failovers_used >= bounds.same_tier_failovers_max) {
    action = 'block'; reason = 'SAME_TIER_FAILOVER_BOUND_EXHAUSTED';
  } else if (!hopAvailable() || !attemptBudgetAvailable()) {
    action = 'block'; reason = 'FAILOVER_HOP_ATTEMPT_OR_BUDGET_GATE';
  } else if (failover.crosses_provider && (dataPolicy.reference === null || dataPolicy.version === null
    || dataPolicy.cross_provider_transfer !== 'allow')) {
    action = 'block'; reason = 'CROSS_PROVIDER_DATA_POLICY_DENIED';
  } else {
    action = 'failover_same_tier'; reason = 'ROUTE_OR_PROVIDER_HEALTH'; consumesRouteHop = true;
  }
} else if (input.failure_class === 'capability_insufficient') {
  if (!verifier.capability_insufficient || verifier.evidence_ref === null) {
    action = 'block'; reason = 'VERIFIER_EVIDENCE_REQUIRED';
  } else if (failover.crosses_provider && (dataPolicy.reference === null || dataPolicy.version === null
    || dataPolicy.cross_provider_transfer !== 'allow')) {
    action = 'block'; reason = 'ESCALATION_CROSS_PROVIDER_DATA_POLICY_DENIED';
  } else if (bounds.tier_escalations_used >= bounds.tier_escalations_max) {
    action = 'block'; reason = 'TIER_ESCALATION_BOUND_EXHAUSTED';
  } else if (!hopAvailable() || !attemptBudgetAvailable()) {
    action = 'block'; reason = 'ESCALATION_TOTAL_BUDGET_HOP_OR_ATTEMPT_GATE';
  } else {
    action = 'escalate_capability_tier'; reason = 'VERIFIED_CAPABILITY_INSUFFICIENCY'; consumesRouteHop = true;
  }
} else if (input.failure_class === 'deterministic_implementation_failure') {
  if (bounds.repair_cycles_used >= bounds.max_repair_cycles) {
    action = 'block'; reason = 'REPAIR_BOUND_EXHAUSTED';
  } else if (!attemptBudgetAvailable()) {
    action = 'block'; reason = 'REPAIR_TOTAL_ATTEMPT_OR_BUDGET_GATE';
  } else {
    action = 'repair'; reason = 'DETERMINISTIC_IMPLEMENTATION_FAILURE';
  }
} else if (BLOCKING_CLASSES.has(input.failure_class)) {
  action = 'block'; reason = `PREREQUISITE_${input.failure_class.toUpperCase()}`;
} else {
  action = 'stop'; reason = 'UNCLASSIFIED_FAILURE';
}

process.stdout.write(JSON.stringify({
  schema: 'vulpora.routing-decision/v1',
  failure_class: input.failure_class,
  action,
  reason,
  consumes_route_hop: consumesRouteHop,
}) + '\n');
