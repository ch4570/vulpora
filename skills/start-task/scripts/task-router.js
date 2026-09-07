#!/usr/bin/env node
'use strict';

// Deterministic task classification precedes model availability/budget checks.
// Callers supply evidence-grounded task characteristics, not a prompt to guess at.
const { canonical, hash } = require('./model-routing-io.js');
const TASK_TYPES = ['deterministic', 'lookup', 'documentation', 'implementation', 'review', 'testing', 'architecture', 'research'];
const DIFFICULTIES = ['simple', 'moderate', 'complex'];
const fail = code => { throw new Error(code); };

function selectTaskProfile({ taskType, difficulty, risk }) {
  if (!TASK_TYPES.includes(taskType) || !DIFFICULTIES.includes(difficulty)
      || !['low', 'high'].includes(risk)) fail('INVALID_TASK_CLASSIFICATION');
  if (taskType === 'deterministic') return { profile: 'frugal', reason: 'deterministic_no_model' };
  if (risk === 'high') return { profile: 'frontier', reason: 'high_risk_floor' };
  if (difficulty === 'complex') return { profile: 'frontier', reason: 'complex_judgment' };
  if (difficulty === 'simple' && ['lookup', 'documentation', 'review', 'testing'].includes(taskType)) {
    return { profile: 'frugal', reason: 'bounded_verifiable_task' };
  }
  return { profile: 'standard', reason: 'implementation_or_open_ended_analysis' };
}

function resolveTaskRoute(request, catalog, policy, now = Date.now()) {
  const required = ['runtime', 'taskType', 'difficulty', 'risk', 'estimatedTokens', 'remainingTokens', 'maxRelativeUnits'];
  if (!request || typeof request !== 'object' || Array.isArray(request)
      || required.some(key => !Object.hasOwn(request, key))
      || Object.keys(request).some(key => ![...required, 'kind', 'profile'].includes(key))) fail('INVALID_TASK_REQUEST');
  const selection = selectTaskProfile(request);
  if (request.profile !== undefined && !['auto', 'frugal', 'standard', 'frontier'].includes(request.profile)) {
    fail('INVALID_TASK_PROFILE');
  }
  const deterministic = request.taskType === 'deterministic';
  if (request.kind !== undefined && (deterministic
    ? request.kind !== 'deterministic' : !['independent-session', 'native-subagent'].includes(request.kind))) {
    fail('TASK_KIND_MISMATCH');
  }
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

module.exports = { TASK_TYPES, DIFFICULTIES, selectTaskProfile, resolveTaskRoute };
