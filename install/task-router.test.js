'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { TASK_TYPES, DIFFICULTIES, selectTaskProfile, selectTaskExecution, resolveTaskRoute, resolveTaskEscalation } = require('../skills/start-task/scripts/task-router.js');
const policy = require('../skills/start-task/scripts/model-routing-policy.json');
const now = Date.parse('2026-09-07T00:00:00.000Z');
function catalog() {
  return { schema: 'vulpora.runtime-model-catalog/v1', runtime: 'codex', source: 'synthetic:test',
    observedAt: new Date(now).toISOString(), models: [...new Set(Object.values(policy.runtimes.codex).flat())]
      .map(id => ({ id, reasoningEfforts: ['low', 'medium', 'high'] })) };
}
function request(overrides = {}) {
  return { runtime: 'codex', taskType: 'implementation', difficulty: 'moderate', risk: 'low',
    maxRelativeUnits: 30, estimatedTokens: 1000, remainingTokens: 2000, ...overrides };
}
const route = (overrides = {}, models = catalog()) => resolveTaskRoute(request(overrides), models, policy, now);

test('simple bounded tasks including implementation choose Luna low effort', () => {
  for (const taskType of ['lookup', 'documentation', 'implementation', 'review', 'testing']) {
    const result = route({ taskType, difficulty: 'simple' });
    assert.equal(result.model, 'gpt-5.6-luna'); assert.equal(result.reasoning_effort, 'low');
    assert.equal(result.executionKind, 'independent-session'); assert.equal(result.nativeArguments, null);
    assert.equal(result.sessionArguments.inheritHistory, false); assert.equal(result.execution, 'NOT_RUN');
  }
  for (const taskType of ['architecture', 'research']) {
    assert.equal(route({ taskType, difficulty: 'simple' }).model, 'gpt-5.6-terra');
  }
});
test('complex bounded work stays within standard capability and budget for decomposition', () => {
  for (const taskType of ['lookup', 'documentation', 'implementation', 'review', 'testing']) {
    const result = route({ taskType, difficulty: 'complex', maxRelativeUnits: 10 });
    assert.equal(result.model, 'gpt-5.6-terra'); assert.equal(result.profile, 'standard');
    assert.equal(result.taskSelection.reason, 'complex_work_decompose_before_escalation');
  }
});
test('complex architecture and research receive frontier capacity for open-ended analysis', () => {
  for (const taskType of ['architecture', 'research']) {
    const result = route({ taskType, difficulty: 'complex' });
    assert.equal(result.model, 'gpt-6-astra'); assert.equal(result.profile, 'frontier');
    assert.equal(result.taskSelection.reason, 'complex_open_ended_analysis');
    assert.throws(() => route({ taskType, difficulty: 'complex', maxRelativeUnits: 10 }), /BUDGET_EXCEEDED/);
  }
});
test('high-risk tasks prefer exposed frontier model and preserve policy fallback order', () => {
  assert.equal(route({ risk: 'high' }).model, 'gpt-6-astra');
  const models = catalog(); models.models = models.models.filter(model => model.id !== 'gpt-6-astra');
  const result = route({ risk: 'high' }, models);
  assert.equal(result.model, 'gpt-5.6-sol');
  assert.deepEqual(result.rejected, [{ model: 'gpt-6-astra', reason: 'NOT_EXPOSED' }]);
});
test('risk floor is monotonic across all task kinds and difficulty levels', () => {
  for (const taskType of TASK_TYPES.filter(type => type !== 'deterministic')) {
    for (const difficulty of DIFFICULTIES) {
      const result = route({ taskType, difficulty, risk: 'high', profile: 'frugal' });
      assert.equal(result.profile, 'frontier'); assert.equal(result.riskFloorApplied, true);
      assert.throws(() => route({ taskType, difficulty, risk: 'high', maxRelativeUnits: 10 }), /BUDGET_EXCEEDED/);
    }
  }
});
test('deterministic checks require no catalog/model and consume no model allocation', () => {
  const result = route({ taskType: 'deterministic', estimatedTokens: 0, remainingTokens: 0, maxRelativeUnits: 0 }, null);
  assert.equal(result.status, 'NO_MODEL'); assert.equal(result.model, null);
  assert.equal(result.estimatedTokens, 0); assert.equal(result.relativeUnits, 0);
});
test('explicit user profile and transport stay visible without changing policy', () => {
  const before = JSON.stringify(policy);
  const result = route({ taskType: 'documentation', difficulty: 'simple', profile: 'standard', kind: 'native-subagent' });
  assert.equal(result.model, 'gpt-5.6-terra'); assert.equal(result.nativeArguments.fork_turns, 'none');
  assert.equal(result.taskSelection.recommendedProfile, 'frugal');
  assert.equal(result.taskSelection.explicitProfile, 'standard'); assert.equal(JSON.stringify(policy), before);
  for (const profile of ['frugal', 'standard', 'frontier']) {
    const overridden = route({ difficulty: 'complex', profile });
    assert.equal(overridden.profile, profile);
    assert.equal(overridden.taskSelection.recommendedProfile, 'standard');
    assert.equal(overridden.taskSelection.explicitProfile, profile);
  }
});
test('tiny simple low-risk work stays primary-owned unless the task explicitly requests a session', () => {
  for (const taskType of ['lookup', 'documentation', 'implementation', 'review', 'testing']) {
    for (const fileCount of [1, 2]) {
      const facts = { taskType, difficulty: 'simple', risk: 'low', fileCount };
      assert.deepEqual(selectTaskExecution(facts), {
        kind: 'primary-owned', reason: 'tiny_bounded_task_avoids_session_overhead',
      });
      assert.equal(selectTaskExecution({ ...facts, delegation: 'auto' }).kind, 'primary-owned');
      assert.deepEqual(selectTaskExecution({ ...facts, delegation: 'independent-session' }), {
        kind: 'independent-session', reason: 'explicit_task_delegation',
      });
    }
  }
});
test('missing scope, larger work, open-ended analysis and high risk do not use the tiny-task shortcut', () => {
  const facts = { taskType: 'implementation', difficulty: 'simple', risk: 'low', fileCount: 2 };
  for (const overrides of [{ fileCount: undefined }, { fileCount: 0 }, { fileCount: 3 }, { taskType: 'architecture' },
    { taskType: 'research' }, { difficulty: 'moderate' }, { difficulty: 'complex' }]) {
    assert.equal(selectTaskExecution({ ...facts, ...overrides }).kind, 'independent-session');
  }
  for (const taskType of TASK_TYPES.filter(type => type !== 'deterministic')) {
    for (const difficulty of DIFFICULTIES) {
      assert.deepEqual(selectTaskExecution({ taskType, difficulty, risk: 'high', fileCount: 1 }), {
        kind: 'independent-session', reason: 'high_risk_requires_routed_execution',
      });
    }
  }
});
test('deterministic ownership requires no session even when delegation is explicitly requested', () => {
  for (const risk of ['low', 'high']) {
    for (const delegation of ['auto', 'independent-session']) {
      assert.deepEqual(selectTaskExecution({ taskType: 'deterministic', difficulty: 'complex', risk, delegation }), {
        kind: 'deterministic', reason: 'deterministic_no_model',
      });
    }
  }
});
test('execution selection rejects malformed scope and delegation without inferring missing facts', () => {
  const facts = { taskType: 'review', difficulty: 'simple', risk: 'low', fileCount: 1 };
  for (const fileCount of [-1, 1.5, '1', null, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => selectTaskExecution({ ...facts, fileCount }), /INVALID_TASK_FILE_COUNT/);
  }
  for (const delegation of ['native-subagent', 'primary-owned', '', null]) {
    assert.throws(() => selectTaskExecution({ ...facts, delegation }), /INVALID_TASK_DELEGATION/);
  }
  for (const overrides of [{ taskType: 'guess' }, { difficulty: undefined }, { risk: undefined }]) {
    assert.throws(() => selectTaskExecution({ ...facts, ...overrides }), /INVALID_TASK_CLASSIFICATION/);
  }
});
test('invalid classifications, contradictory transport and token exhaustion block', () => {
  for (const bad of [{ taskType: 'guess' }, { difficulty: 'unknown' }, { risk: 'unknown' },
    { profile: 'cheap' }, { extra: true }, { taskType: 'implementation', kind: 'deterministic' },
    { taskType: 'deterministic', kind: 'native-subagent' }]) assert.throws(() => route(bad));
  assert.throws(() => route({ remainingTokens: 999 }), /BUDGET_EXCEEDED/);
  assert.throws(() => selectTaskProfile({ taskType: 'review', difficulty: 'simple' }), /INVALID_TASK_CLASSIFICATION/);
});
test('task evidence binds classification even when two tasks select the same model', () => {
  const a = route({ taskType: 'lookup', difficulty: 'simple' });
  const b = route({ taskType: 'documentation', difficulty: 'simple' });
  assert.equal(a.model, b.model); assert.notEqual(a.evidence.taskRequestSha256, b.evidence.taskRequestSha256);
  assert.equal(a.evidence.taskRequestSha256, route({ taskType: 'lookup', difficulty: 'simple' }).evidence.taskRequestSha256);
});
test('both CLI entry paths classify tasks; malformed combinations cannot bypass validation', t => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'vulpora-task-routing-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const modelFile = path.join(dir, 'catalog.json'); const current = catalog(); current.observedAt = new Date().toISOString();
  fs.writeFileSync(modelFile, JSON.stringify(current));
  for (const entry of ['model-router.js', '../skills/start-task/scripts/model-router.js']) {
    const cli = args => spawnSync(process.execPath, [path.join(__dirname, entry), '--runtime', 'codex', ...args], { encoding: 'utf8' });
    const success = cli(['--task-type', 'documentation', '--difficulty', 'simple', '--catalog', modelFile]);
    assert.equal(success.status, 0, success.stderr); assert.equal(JSON.parse(success.stdout).model, 'gpt-5.6-luna');
    assert.equal(cli(['--difficulty', 'simple', '--catalog', modelFile]).status, 2);
    assert.equal(cli(['--task-type', 'review', '--catalog', modelFile, '--agent-config', 'none']).status, 2);
    assert.equal(cli(['--task-type', 'deterministic', '--max-units', '0', '--estimated-tokens', '0', '--remaining-tokens', '0']).status, 0);
  }
});

function escalation(overrides = {}, models = catalog()) {
  return resolveTaskEscalation({
    request: request({ difficulty: 'simple', remainingTokens: 10000 }),
    previousRoute: route({ difficulty: 'simple' }),
    verification: { status: 'failed', failureClass: 'model-quality' },
    attemptsUsed: 1, maxAttempts: 3,
    accounting: { remainingTokens: 10000, remainingRelativeUnits: 40, unresolvedAttempts: 0, overdrawn: false },
    previousUsage: { source: 'codex-jsonl:turn.completed', inputTokens: 600, outputTokens: 200 },
    ...overrides,
  }, models, policy, now);
}
test('verified quality failure escalates Luna to Terra and Terra to frontier within three attempts', () => {
  const first = escalation();
  assert.equal(first.action, 'ESCALATE'); assert.equal(first.reason, 'VERIFIED_MODEL_QUALITY_FAILURE');
  assert.equal(first.fromProfile, 'frugal'); assert.equal(first.nextProfile, 'standard');
  assert.equal(first.route.model, 'gpt-5.6-terra'); assert.equal(first.route.reasoning_effort, 'medium');
  assert.equal(first.route.taskSelection.recommendedProfile, 'frugal');
  assert.equal(first.route.taskSelection.explicitProfile, null);
  assert.equal(first.route.taskSelection.reason, 'verified_model_quality_escalation');
  assert.equal(first.route.evidence.escalationRequestSha256, first.evidence.escalationRequestSha256);
  assert.equal(first.execution, 'NOT_RUN'); assert.equal(first.route.execution, 'NOT_RUN');
  const second = escalation({ previousRoute: first.route, attemptsUsed: 2 });
  assert.equal(second.action, 'ESCALATE'); assert.equal(second.fromProfile, 'standard');
  assert.equal(second.route.model, 'gpt-6-astra'); assert.equal(second.route.reasoning_effort, 'high');
  const third = escalation({ previousRoute: second.route, attemptsUsed: 3 });
  assert.equal(third.action, 'STOP'); assert.equal(third.reason, 'ATTEMPT_CAP_REACHED'); assert.equal(third.route, null);
});
test('escalation follows the actual resolved tier and never reroutes from the initial recommendation', () => {
  const previousRoute = route({ difficulty: 'simple', profile: 'standard' });
  assert.equal(previousRoute.taskSelection.recommendedProfile, 'frugal');
  const result = escalation({ previousRoute });
  assert.equal(result.fromProfile, 'standard'); assert.equal(result.route.profile, 'frontier');
  assert.equal(escalation({ previousRoute: route({ profile: 'frontier' }) }).reason, 'FRONTIER_EXHAUSTED');
});
test('high risk cannot descend or bypass a frontier budget floor during escalation', () => {
  const high = escalation({ previousRoute: route({ risk: 'high' }) });
  assert.equal(high.action, 'STOP'); assert.equal(high.reason, 'FRONTIER_EXHAUSTED');
  const changedRisk = escalation({ request: request({ difficulty: 'simple', risk: 'high' }) });
  assert.equal(changedRisk.route.profile, 'frontier'); assert.equal(changedRisk.route.riskFloorApplied, true);
  const lowBudget = escalation({ request: request({ difficulty: 'simple', risk: 'high', maxRelativeUnits: 10 }) });
  assert.equal(lowBudget.action, 'STOP'); assert.equal(lowBudget.reason, 'BUDGET_EXCEEDED');
});
test('environment, missing authority, unknown causes and unfailed verification never escalate', () => {
  for (const [failureClass, reason] of [['environment', 'ENVIRONMENT_FAILURE'], ['missing-authority', 'MISSING_AUTHORITY'],
    ['unknown', 'FAILURE_CLASS_UNKNOWN']]) {
    const result = escalation({ verification: { status: 'failed', failureClass } }, null);
    assert.equal(result.action, 'STOP'); assert.equal(result.reason, reason); assert.equal(result.route, null);
  }
  assert.equal(escalation({ verification: { status: 'passed', failureClass: 'unknown' } }, null).reason, 'VERIFICATION_PASSED');
  assert.equal(escalation({ verification: { status: 'blocked', failureClass: 'model-quality' } }, null).reason, 'VERIFICATION_NOT_FAILED');
});
test('unknown or invalid previous runtime usage blocks escalation without guessing zero cost', () => {
  for (const previousUsage of [null, { source: 'unavailable' }, { source: 'worker-claimed', inputTokens: 0, outputTokens: 0 },
    { source: 'codex-jsonl:turn.completed', inputTokens: -1, outputTokens: 0 },
    { source: 'codex-jsonl:turn.completed', inputTokens: 1, outputTokens: '2' },
    { source: 'codex-jsonl:turn.completed', inputTokens: 1, outputTokens: 2, scope: 'session_total' },
    { source: 'codex-jsonl:turn.completed', inputTokens: 1, outputTokens: 2, measurementKind: 'estimated' },
    { source: 'codex-jsonl:turn.completed', inputTokens: 1, outputTokens: 2, reasoningSemantics: 'add_to_output' },
    { source: 'codex-jsonl:turn.completed', inputTokens: 1, outputTokens: 2, cachedInputTokens: 2 }]) {
    const result = escalation({ previousUsage }, null);
    assert.equal(result.action, 'STOP'); assert.equal(result.reason, 'USAGE_UNKNOWN');
  }
});
test('reconciliation, cumulative shared balances and the user budget bound every next attempt', () => {
  for (const accounting of [
    { remainingTokens: 10000, remainingRelativeUnits: 40, unresolvedAttempts: 1, overdrawn: false },
    { remainingTokens: 10000, remainingRelativeUnits: 40, unresolvedAttempts: 0, overdrawn: true },
  ]) assert.equal(escalation({ accounting }, null).reason, 'BUDGET_RECONCILIATION_REQUIRED');
  for (const accounting of [
    { remainingTokens: 999, remainingRelativeUnits: 40, unresolvedAttempts: 0, overdrawn: false },
    { remainingTokens: 10000, remainingRelativeUnits: 9, unresolvedAttempts: 0, overdrawn: false },
  ]) assert.equal(escalation({ accounting }).reason, 'BUDGET_EXCEEDED');
  assert.equal(escalation({ request: request({ difficulty: 'simple', remainingTokens: 999 }) }).reason, 'BUDGET_EXCEEDED');
  assert.equal(escalation({ request: request({ difficulty: 'simple', maxRelativeUnits: 1 }) }).reason, 'BUDGET_EXCEEDED');
});
test('a smaller user attempt cap is respected and a larger cap cannot exceed the three tier limit', () => {
  assert.equal(escalation({ maxAttempts: 1 }, null).reason, 'ATTEMPT_CAP_REACHED');
  assert.equal(escalation({ attemptsUsed: 2, maxAttempts: 2 }, null).reason, 'ATTEMPT_CAP_REACHED');
  const hardLimit = escalation({ attemptsUsed: 3, maxAttempts: 100 }, null);
  assert.equal(hardLimit.reason, 'ATTEMPT_CAP_REACHED'); assert.equal(hardLimit.maxAttempts, 3);
});
test('explicit user profiles remain pinned while an auto profile allows bounded escalation', () => {
  for (const profile of ['frugal', 'standard', 'frontier']) {
    const result = escalation({ request: request({ difficulty: 'simple', profile }) }, null);
    assert.equal(result.action, 'STOP'); assert.equal(result.reason, 'EXPLICIT_PROFILE_PINNED');
  }
  assert.equal(escalation({ request: request({ difficulty: 'simple', profile: 'auto' }) }).action, 'ESCALATE');
});
test('unavailable escalation tiers or stale catalogs stop without model fallback to a lower tier', () => {
  const unavailable = catalog(); unavailable.models = unavailable.models.filter(model => model.id !== 'gpt-5.6-terra');
  assert.equal(escalation({}, unavailable).reason, 'ROUTE_UNAVAILABLE');
  const stale = catalog(); stale.observedAt = new Date(now - 3601000).toISOString();
  assert.equal(escalation({}, stale).reason, 'STALE_CATALOG');
});
test('deterministic work never escalates and each decision binds its supplied evidence', () => {
  const result = escalation({ request: request({ taskType: 'deterministic' }), previousRoute: null }, null);
  assert.equal(result.reason, 'DETERMINISTIC_NO_MODEL'); assert.equal(result.route, null);
  const first = escalation(); const again = escalation();
  assert.deepEqual(first, again);
  assert.notEqual(first.evidence.escalationRequestSha256, escalation({ maxAttempts: 2 }).evidence.escalationRequestSha256);
});
test('malformed escalation state is rejected before a route can be returned', () => {
  for (const overrides of [{ attemptsUsed: 0 }, { attemptsUsed: 1.5 }, { maxAttempts: 0 }, { maxAttempts: '3' },
    { verification: { status: 'failed', failureClass: 'guess' } },
    { verification: { status: 'failed', failureClass: 'model-quality', retry: true } },
    { previousRoute: { profile: 'frugal' } }, { previousRoute: { ...route(), runtime: 'claude-code' } },
    { accounting: { remainingTokens: 10000, remainingRelativeUnits: 40, unresolvedAttempts: 0 } },
    { extra: true }]) assert.throws(() => escalation(overrides), /INVALID_/);
});
