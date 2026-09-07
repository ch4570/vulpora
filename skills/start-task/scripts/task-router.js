#!/usr/bin/env node
'use strict';

// Deterministic task classification precedes model availability/budget checks.
// Callers supply evidence-grounded task characteristics, not a prompt to guess at.
const { canonical, hash } = require('./model-routing-io.js');
const TASK_TYPES = ['deterministic', 'lookup', 'documentation', 'implementation', 'review', 'testing', 'architecture', 'research'];
const DIFFICULTIES = ['simple', 'moderate', 'complex'];
const TINY_TASK_TYPES = ['lookup', 'documentation', 'implementation', 'review', 'testing'];
const PROFILES = ['frugal', 'standard', 'frontier'];
const MAX_ESCALATION_ATTEMPTS = 3;
const fail = code => { throw new Error(code); };

function validateClassification({ taskType, difficulty, risk }) {
  if (!TASK_TYPES.includes(taskType) || !DIFFICULTIES.includes(difficulty)
      || !['low', 'high'].includes(risk)) fail('INVALID_TASK_CLASSIFICATION');
}

function selectTaskProfile({ taskType, difficulty, risk }) {
  validateClassification({ taskType, difficulty, risk });
  if (taskType === 'deterministic') return { profile: 'frugal', reason: 'deterministic_no_model' };
  if (risk === 'high') return { profile: 'frontier', reason: 'high_risk_floor' };
  if (difficulty === 'complex' && ['architecture', 'research'].includes(taskType)) {
    return { profile: 'frontier', reason: 'complex_open_ended_analysis' };
  }
  if (difficulty === 'complex') return { profile: 'standard', reason: 'complex_work_decompose_before_escalation' };
  if (difficulty === 'simple' && TINY_TASK_TYPES.includes(taskType)) {
    return { profile: 'frugal', reason: 'bounded_verifiable_task' };
  }
  return { profile: 'standard', reason: 'implementation_or_open_ended_analysis' };
}

// Session creation has its own overhead. Select ownership before catalog lookup
// or model allocation; the direct route API still honors its requested transport.
function selectTaskExecution({ taskType, difficulty, risk, fileCount, delegation = 'auto' }) {
  validateClassification({ taskType, difficulty, risk });
  if (fileCount !== undefined && (!Number.isSafeInteger(fileCount) || fileCount < 0)) fail('INVALID_TASK_FILE_COUNT');
  if (!['auto', 'independent-session'].includes(delegation)) fail('INVALID_TASK_DELEGATION');
  if (taskType === 'deterministic') return { kind: 'deterministic', reason: 'deterministic_no_model' };
  if (delegation === 'independent-session') return { kind: 'independent-session', reason: 'explicit_task_delegation' };
  if (risk === 'low' && difficulty === 'simple' && TINY_TASK_TYPES.includes(taskType)
      && fileCount >= 1 && fileCount <= 2) {
    return { kind: 'primary-owned', reason: 'tiny_bounded_task_avoids_session_overhead' };
  }
  return { kind: 'independent-session', reason: risk === 'high' ? 'high_risk_requires_routed_execution' : 'delegated_task_scope' };
}

function resolveTaskRoute(request, catalog, policy, now = Date.now()) {
  validateTaskRequest(request);
  const selection = selectTaskProfile(request);
  const deterministic = request.taskType === 'deterministic';
  const profile = request.profile && request.profile !== 'auto' ? request.profile : selection.profile;
  const base = {
    runtime: request.runtime, profile, risk: request.risk,
    kind: deterministic ? 'deterministic' : (request.kind || 'independent-session'),
    estimatedTokens: request.estimatedTokens, remainingTokens: request.remainingTokens,
    maxRelativeUnits: request.maxRelativeUnits,
  };
  const { resolveRoute } = require('./model-router.js');
  const route = resolveRoute(base, catalog, policy, now);
  return {
    ...route,
    taskSelection: {
      schema: 'vulpora.task-model-selection/v1', taskType: request.taskType,
      difficulty: request.difficulty, risk: request.risk, recommendedProfile: selection.profile,
      selectedProfile: route.profile || null, reason: selection.reason,
      explicitProfile: request.profile && request.profile !== 'auto' ? request.profile : null,
      basis: 'caller-supplied-task-facts-not-free-text-inference',
    },
    evidence: { ...route.evidence, taskRequestSha256: hash(canonical(request)) },
  };
}

function validateTaskRequest(request) {
  const required = ['runtime', 'taskType', 'difficulty', 'risk', 'estimatedTokens', 'remainingTokens', 'maxRelativeUnits'];
  if (!request || typeof request !== 'object' || Array.isArray(request)
      || required.some(key => !Object.hasOwn(request, key))
      || Object.keys(request).some(key => ![...required, 'kind', 'profile'].includes(key))) fail('INVALID_TASK_REQUEST');
  validateClassification(request);
  if (request.profile !== undefined && !['auto', ...PROFILES].includes(request.profile)) {
    fail('INVALID_TASK_PROFILE');
  }
  const deterministic = request.taskType === 'deterministic';
  if (request.kind !== undefined && (deterministic
    ? request.kind !== 'deterministic' : !['independent-session', 'native-subagent'].includes(request.kind))) {
    fail('TASK_KIND_MISMATCH');
  }
  if (!['codex', 'claude-code'].includes(request.runtime)) fail('INVALID_REQUEST');
  for (const key of ['estimatedTokens', 'remainingTokens', 'maxRelativeUnits']) {
    if (!Number.isFinite(request[key]) || request[key] < 0 || request[key] > 1e9
      || (key !== 'maxRelativeUnits' && !Number.isSafeInteger(request[key]))) fail('INVALID_BUDGET');
  }
}

// A decision only: never launch or retry a worker here. Callers must independently
// verify the result and provide its reconciled shared ledger and observed usage.
// The attempt cap includes the completed attempt; user profile overrides stay pinned.
function resolveTaskEscalation(input, catalog, policy, now = Date.now()) {
  const fields = ['request', 'previousRoute', 'verification', 'attemptsUsed', 'maxAttempts', 'accounting', 'previousUsage'];
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || fields.some(key => !Object.hasOwn(input, key)) || Object.keys(input).some(key => !fields.includes(key))) {
    fail('INVALID_ESCALATION_REQUEST');
  }
  const { request, previousRoute, verification, attemptsUsed, maxAttempts, accounting, previousUsage } = input;
  validateTaskRequest(request);
  if (!Number.isSafeInteger(attemptsUsed) || attemptsUsed < 1 || attemptsUsed > 1e9
    || !Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 1e9) fail('INVALID_ESCALATION_ATTEMPTS');
  if (!verification || typeof verification !== 'object' || Array.isArray(verification)
    || !['passed', 'failed', 'blocked'].includes(verification.status)
    || !['model-quality', 'environment', 'missing-authority', 'unknown'].includes(verification.failureClass)
    || Object.keys(verification).some(key => !['status', 'failureClass'].includes(key))) fail('INVALID_ESCALATION_VERIFICATION');
  const fromProfile = previousRoute?.profile ?? null;
  const base = { schema: 'vulpora.task-model-escalation/v1', action: 'STOP', execution: 'NOT_RUN',
    fromProfile, nextProfile: null, attemptsUsed, maxAttempts: Math.min(maxAttempts, MAX_ESCALATION_ATTEMPTS), route: null,
    evidence: { escalationRequestSha256: hash(canonical(input)) } };
  const stop = reason => ({ ...base, reason });
  if (request.taskType === 'deterministic') return stop('DETERMINISTIC_NO_MODEL');
  if (previousRoute?.schema !== 'vulpora.model-route/v1' || previousRoute.status !== 'RESOLVED'
    || previousRoute.runtime !== request.runtime || !PROFILES.includes(fromProfile)) fail('INVALID_PREVIOUS_ROUTE');
  if (verification.status === 'passed') return stop('VERIFICATION_PASSED');
  if (verification.failureClass !== 'model-quality') return stop({ environment: 'ENVIRONMENT_FAILURE',
    'missing-authority': 'MISSING_AUTHORITY', unknown: 'FAILURE_CLASS_UNKNOWN' }[verification.failureClass]);
  if (verification.status !== 'failed') return stop('VERIFICATION_NOT_FAILED');
  if (request.profile && request.profile !== 'auto') return stop('EXPLICIT_PROFILE_PINNED');
  if (attemptsUsed >= base.maxAttempts) return stop('ATTEMPT_CAP_REACHED');
  if (request.runtime !== 'codex' || !previousUsage || previousUsage.source !== 'codex-jsonl:turn.completed'
    || !['inputTokens', 'outputTokens'].every(key => Number.isSafeInteger(previousUsage[key])
      && previousUsage[key] >= 0 && previousUsage[key] <= 1e9)
    || (previousUsage.cachedInputTokens != null && (!Number.isSafeInteger(previousUsage.cachedInputTokens)
      || previousUsage.cachedInputTokens < 0 || previousUsage.cachedInputTokens > previousUsage.inputTokens))
    || (previousUsage.reasoningTokens != null && (!Number.isSafeInteger(previousUsage.reasoningTokens)
      || previousUsage.reasoningTokens < 0 || previousUsage.reasoningTokens > 1e9))
    || (previousUsage.scope !== undefined && previousUsage.scope !== 'single_turn')
    || (previousUsage.measurementKind !== undefined && previousUsage.measurementKind !== 'provider_observed')
    || (previousUsage.reasoningSemantics !== undefined
      && previousUsage.reasoningSemantics !== 'provider_reported_not_added')) return stop('USAGE_UNKNOWN');
  if (!accounting || typeof accounting !== 'object' || Array.isArray(accounting)
    || !['remainingTokens', 'remainingRelativeUnits', 'unresolvedAttempts'].every(key => Number.isSafeInteger(accounting[key])
      && accounting[key] >= 0 && accounting[key] <= 1e9)
    || typeof accounting.overdrawn !== 'boolean') fail('INVALID_ESCALATION_ACCOUNTING');
  if (accounting.unresolvedAttempts || accounting.overdrawn) return stop('BUDGET_RECONCILIATION_REQUIRED');
  if (fromProfile === 'frontier') return stop('FRONTIER_EXHAUSTED');
  const nextProfile = request.risk === 'high' || previousRoute.riskFloorApplied
    ? 'frontier' : PROFILES[PROFILES.indexOf(fromProfile) + 1];
  let route;
  try {
    route = resolveTaskRoute({ ...request, profile: nextProfile,
      risk: request.risk === 'high' || previousRoute.riskFloorApplied ? 'high' : 'low',
      remainingTokens: Math.min(request.remainingTokens, accounting.remainingTokens),
      maxRelativeUnits: Math.min(request.maxRelativeUnits, accounting.remainingRelativeUnits),
    }, catalog, policy, now);
  } catch (error) {
    if (['BUDGET_EXCEEDED', 'ROUTE_UNAVAILABLE', 'STALE_CATALOG'].includes(error.message)) return stop(error.message);
    throw error;
  }
  route.taskSelection.explicitProfile = null;
  route.taskSelection.reason = 'verified_model_quality_escalation';
  route.evidence.escalationRequestSha256 = base.evidence.escalationRequestSha256;
  return { ...base, action: 'ESCALATE', reason: 'VERIFIED_MODEL_QUALITY_FAILURE', nextProfile: route.profile, route };
}

module.exports = { TASK_TYPES, DIFFICULTIES, selectTaskProfile, selectTaskExecution, resolveTaskRoute, resolveTaskEscalation };
