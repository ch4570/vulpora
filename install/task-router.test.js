'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { TASK_TYPES, DIFFICULTIES, selectTaskProfile, resolveTaskRoute } = require('../skills/start-task/scripts/task-router.js');
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

test('bounded tasks choose low effort while implementation/analysis retain balanced capability', () => {
  for (const taskType of ['lookup', 'documentation', 'review', 'testing']) {
    const result = route({ taskType, difficulty: 'simple' });
    assert.equal(result.model, 'gpt-5.6-luna'); assert.equal(result.reasoning_effort, 'low');
    assert.equal(result.executionKind, 'independent-session'); assert.equal(result.nativeArguments, null);
    assert.equal(result.sessionArguments.inheritHistory, false); assert.equal(result.execution, 'NOT_RUN');
  }
  for (const taskType of ['implementation', 'architecture', 'research']) {
    assert.equal(route({ taskType, difficulty: 'simple' }).model, 'gpt-5.6-terra');
  }
});
test('complex tasks prefer exposed frontier model and preserve policy fallback order', () => {
  assert.equal(route({ difficulty: 'complex' }).model, 'gpt-6-astra');
  const models = catalog(); models.models = models.models.filter(model => model.id !== 'gpt-6-astra');
  const result = route({ difficulty: 'complex' }, models);
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
