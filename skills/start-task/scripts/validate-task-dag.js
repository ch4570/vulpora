#!/usr/bin/env node
'use strict';

const fs = require('node:fs');

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const FORMULA = 'min(runtime_available_slots, dependency_ready_tasks, disjoint_write_logical_scopes, higher_policy_limit)';

function canonicalJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) invalid('TASK_DAG_NON_CANONICAL_NUMBER');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  invalid('TASK_DAG_NON_JSON_VALUE');
}

function invalid(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function object(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(code);
  return value;
}

function strings(value, code, options = {}) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.length === 0)) invalid(code);
  if (new Set(value).size !== value.length) invalid(code);
  if (options.nonempty && value.length === 0) invalid(code);
  return value;
}

function identifier(value, code) {
  if (typeof value !== 'string' || !ID.test(value)) invalid(code);
  return value;
}

function outcomeText(value) {
  if (typeof value !== 'string' || value.trim().length < 8) invalid('TASK_DAG_OUTCOME_TOO_VAGUE');
  const normalized = value.trim().toLowerCase().replace(/\s+/g, ' ');
  if (/^(?:implement(?:\s+t-[a-z0-9-]+)?|task|bounded result|backend implementation|add tests|db work|integration|cleanup|백엔드 구현|테스트 추가|db 작업|통합|정리)$/.test(normalized)) {
    invalid('TASK_DAG_OUTCOME_TOO_VAGUE');
  }
  return value;
}

function scopeAllowed(scope, allowed) {
  if (allowed.includes(scope)) return true;
  if (allowed.includes('workspace') && !scope.startsWith('/') && !scope.split('/').includes('..')) return true;
  return allowed.some((entry) => entry.endsWith('/*')
    ? scope.startsWith(entry.slice(0, -1))
    : scope.startsWith(`${entry}/`));
}

function validateAcceptedRiskMappings(risks, acceptedRiskIds, tasks) {
  if (!Array.isArray(risks)) invalid('TASK_DAG_RISKS_INVALID');
  if (acceptedRiskIds.length === 0) return;
  const accepted = new Set(acceptedRiskIds);
  const mapped = new Set();
  for (const candidate of risks) {
    const risk = object(candidate, 'TASK_DAG_ACCEPTED_RISK_MAPPING_INVALID');
    const unknownId = identifier(risk.unknown_id, 'TASK_DAG_ACCEPTED_RISK_ID_INVALID');
    if (!accepted.has(unknownId) || mapped.has(unknownId)) invalid('TASK_DAG_ACCEPTED_RISK_MAPPING_INVALID');
    if (!['assumption', 'verification', 'exclusion'].includes(risk.treatment)
      || typeof risk.detail !== 'string' || risk.detail.trim().length < 12) {
      invalid('TASK_DAG_ACCEPTED_RISK_MAPPING_INVALID');
    }
    const taskIds = strings(risk.task_ids, 'TASK_DAG_ACCEPTED_RISK_TASKS_INVALID');
    if (taskIds.some((taskId) => !tasks.has(taskId))
      || (risk.treatment !== 'exclusion' && taskIds.length === 0)) {
      invalid('TASK_DAG_ACCEPTED_RISK_TASKS_INVALID');
    }
    mapped.add(unknownId);
  }
  if (mapped.size !== accepted.size) invalid('TASK_DAG_ACCEPTED_RISK_UNMAPPED');
}

function validateSpecBinding(result, spec) {
  object(spec, 'TASK_DAG_SPEC_INVALID');
  if (spec.schema !== 'vulpora.clarified-task-spec/v2' || spec.status !== 'ready'
    || result.specId !== spec.spec_id) invalid('TASK_DAG_SPEC_BINDING_INVALID');
  const specCriteria = (spec.acceptance_criteria || []).map((criterion) =>
    typeof criterion === 'string' ? criterion : criterion?.id);
  if (specCriteria.some((criterion) => typeof criterion !== 'string' || !ID.test(criterion))
    || canonicalJson([...specCriteria].sort()) !== canonicalJson([...result.coverage.keys()].sort())) {
    invalid('TASK_DAG_SPEC_ACCEPTANCE_DRIFT');
  }
  const specGate = spec.clarity_projection?.clarity_gate;
  if (!specGate || result.clarityGate.status !== specGate.status
    || result.clarityGate.score !== specGate.score || result.clarityGate.threshold !== specGate.threshold
    || canonicalJson(result.clarityGate.skip) !== canonicalJson(specGate.skip)) invalid('TASK_DAG_SPEC_CLARITY_DRIFT');
  const authority = object(spec.authority, 'TASK_DAG_SPEC_AUTHORITY_INVALID');
  const allowedReads = strings(authority.allowed_reads, 'TASK_DAG_SPEC_AUTHORITY_INVALID');
  const allowedWrites = strings(authority.allowed_writes, 'TASK_DAG_SPEC_AUTHORITY_INVALID');
  const allowedExternalEffects = strings(authority.allowed_external_effects, 'TASK_DAG_SPEC_AUTHORITY_INVALID');
  const forbidden = strings(authority.forbidden, 'TASK_DAG_SPEC_AUTHORITY_INVALID');
  for (const task of result.tasks.values()) {
    if (task.writeScope.some((scope) => !scopeAllowed(scope, allowedWrites))) invalid('TASK_DAG_WRITE_AUTHORITY_EXCEEDED');
    if (task.readScope.some((scope) => !scopeAllowed(scope, [...allowedReads, ...allowedWrites]))) {
      invalid('TASK_DAG_READ_AUTHORITY_EXCEEDED');
    }
    if (task.externalEffects.some((effect) => !allowedExternalEffects.includes(effect))) {
      invalid('TASK_DAG_EXTERNAL_EFFECT_AUTHORITY_EXCEEDED');
    }
    if (forbidden.some((action) => !task.forbidden.includes(action))) invalid('TASK_DAG_FORBIDDEN_AUTHORITY_DROPPED');
  }
}

function parseTaskDag(text, expectedSpec = null) {
  let dag;
  try { dag = JSON.parse(text); } catch { invalid('TASK_DAG_CANONICAL_JSON_REQUIRED'); }
  if (canonicalJson(dag) !== text) invalid('TASK_DAG_NON_CANONICAL');
  object(dag, 'TASK_DAG_INVALID');
  if (dag.schema !== 'vulpora.task-dag/v2') invalid('TASK_DAG_SCHEMA_INVALID');
  const specId = identifier(dag.spec_id, 'TASK_DAG_SPEC_ID_INVALID');
  identifier(dag.plan_id, 'TASK_DAG_PLAN_ID_INVALID');
  if (dag.status !== 'ready') invalid('TASK_DAG_NOT_READY');

  const policy = object(dag.parallelism_policy, 'TASK_DAG_PARALLELISM_POLICY_INVALID');
  if (policy.mode !== 'dynamic' || policy.effective_parallelism !== FORMULA
    || policy.higher_policy_limit !== null || policy.fixed_cap !== null) {
    invalid('TASK_DAG_PARALLELISM_POLICY_INVALID');
  }
  const clarity = object(dag.clarity_gate, 'TASK_DAG_CLARITY_GATE_INVALID');
  if (!['passed', 'skipped'].includes(clarity.status) || !Number.isInteger(clarity.score)
    || clarity.score < 0 || clarity.score > 100 || clarity.threshold !== 85) invalid('TASK_DAG_CLARITY_GATE_INVALID');
  const skip = object(clarity.skip, 'TASK_DAG_CLARITY_SKIP_INVALID');
  strings(skip.accepted_risk_unknown_ids, 'TASK_DAG_CLARITY_SKIP_INVALID');
  strings(skip.non_bypassable_blocker_ids, 'TASK_DAG_CLARITY_SKIP_INVALID');
  if (skip.non_bypassable_blocker_ids.length > 0) invalid('TASK_DAG_CLARITY_BLOCKED');
  if (clarity.status === 'passed' && (clarity.score < 85 || skip.requested !== false)) invalid('TASK_DAG_CLARITY_GATE_INVALID');
  if (clarity.status === 'skipped' && (skip.requested !== true || skip.basis !== 'explicit_user_request'
    || typeof skip.reason !== 'string' || skip.reason.trim().length === 0
    || !/^answer-sha256:[a-f0-9]{64}$/.test(skip.decision_ref || ''))) invalid('TASK_DAG_CLARITY_SKIP_INVALID');

  if (!Array.isArray(dag.tasks) || dag.tasks.length === 0) invalid('TASK_DAG_TASKS_EMPTY');
  const tasks = new Map();
  for (const candidate of dag.tasks) {
    const task = object(candidate, 'TASK_DAG_TASK_INVALID');
    const id = identifier(task.id, 'TASK_DAG_TASK_ID_INVALID');
    if (tasks.has(id)) invalid('TASK_DAG_TASK_DUPLICATE');
    outcomeText(task.title);
    outcomeText(task.objective);
    const dependsOn = strings(task.depends_on, 'TASK_DAG_DEPENDENCIES_INVALID');
    const writeScope = strings(task.write_scope, 'TASK_DAG_WRITE_SCOPE_INVALID');
    const readScope = strings(task.read_scope, 'TASK_DAG_READ_SCOPE_INVALID');
    const acceptanceCriterionIds = strings(task.acceptance_criterion_ids, 'TASK_DAG_ACCEPTANCE_INVALID', {nonempty:true});
    const ownerRole = identifier(task.owner_role, 'TASK_DAG_OWNER_INVALID');
    if (ownerRole === 'worker') invalid('TASK_DAG_OWNER_TOO_GENERIC');
    if (!Array.isArray(task.acceptance_tests) || task.acceptance_tests.length === 0
      || task.acceptance_tests.some((test) => !test || typeof test.method !== 'string' || !test.method
        || typeof test.expected !== 'string' || !test.expected)) invalid('TASK_DAG_ACCEPTANCE_TEST_INVALID');
    object(task.risk, 'TASK_DAG_RISK_INVALID');
    object(task.authority, 'TASK_DAG_AUTHORITY_INVALID');
    strings(task.authority.tools, 'TASK_DAG_AUTHORITY_INVALID');
    const externalEffects = strings(task.authority.external_effects, 'TASK_DAG_AUTHORITY_INVALID');
    const forbidden = strings(task.authority.forbidden, 'TASK_DAG_AUTHORITY_INVALID');
    object(task.execution, 'TASK_DAG_EXECUTION_INVALID');
    const executionKind = task.execution.kind;
    if (!['deterministic', 'native-subagent', 'leader-inline'].includes(executionKind)) invalid('TASK_DAG_EXECUTION_INVALID');
    if (task.execution.delegation_depth !== 0 || !task.execution.forbidden_actions?.includes('recursive delegation')
      || task.execution.result_schema !== 'vulpora.task-result/v2'
      || !['leader-inline', 'blocked', 'none'].includes(task.execution.fallback)) invalid('TASK_DAG_EXECUTION_INVALID');
    object(task.budget, 'TASK_DAG_BUDGET_INVALID');
    const outputs = strings(task.outputs, 'TASK_DAG_OUTPUTS_INVALID');
    if (outputs.some((output) => !writeScope.includes(output))) invalid('TASK_DAG_OUTPUT_SCOPE_INVALID');
    tasks.set(id, {id, dependsOn, writeScope, readScope, externalEffects, forbidden, executionKind, acceptanceCriterionIds});
  }
  for (const task of tasks.values()) {
    if (task.dependsOn.some((dependency) => !tasks.has(dependency) || dependency === task.id)) invalid('TASK_DAG_DEPENDENCY_UNKNOWN');
  }
  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (visiting.has(id)) invalid('TASK_DAG_CYCLE');
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of tasks.get(id).dependsOn) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of tasks.keys()) visit(id);

  if (!Array.isArray(dag.waves) || dag.waves.length === 0) invalid('TASK_DAG_WAVES_EMPTY');
  const taskWave = new Map();
  const waveIds = new Set();
  dag.waves.forEach((candidate, waveIndex) => {
    const wave = object(candidate, 'TASK_DAG_WAVE_INVALID');
    const waveId = identifier(wave.id, 'TASK_DAG_WAVE_ID_INVALID');
    if (waveIds.has(waveId)) invalid('TASK_DAG_WAVE_DUPLICATE');
    waveIds.add(waveId);
    for (const taskId of strings(wave.task_ids, 'TASK_DAG_WAVE_TASKS_INVALID', {nonempty:true})) {
      if (!tasks.has(taskId) || taskWave.has(taskId)) invalid('TASK_DAG_WAVE_MEMBERSHIP_INVALID');
      taskWave.set(taskId, waveIndex);
    }
    const waveTasks = wave.task_ids.map((taskId) => tasks.get(taskId));
    for (let left = 0; left < waveTasks.length; left += 1) {
      for (let right = left + 1; right < waveTasks.length; right += 1) {
        if (waveTasks[left].writeScope.some((scope) => waveTasks[right].writeScope.includes(scope))) {
          invalid('TASK_DAG_PARALLEL_WRITE_SCOPE_OVERLAP');
        }
      }
    }
  });
  if (taskWave.size !== tasks.size) invalid('TASK_DAG_WAVE_MEMBERSHIP_INVALID');
  for (const task of tasks.values()) {
    if (task.dependsOn.some((dependency) => taskWave.get(dependency) >= taskWave.get(task.id))) invalid('TASK_DAG_WAVE_ORDER_INVALID');
  }

  if (!Array.isArray(dag.coverage) || dag.coverage.length === 0) invalid('TASK_DAG_COVERAGE_EMPTY');
  const coverage = new Map();
  for (const candidate of dag.coverage) {
    const item = object(candidate, 'TASK_DAG_COVERAGE_INVALID');
    const criterionId = identifier(item.acceptance_criterion_id, 'TASK_DAG_COVERAGE_ID_INVALID');
    if (coverage.has(criterionId)) invalid('TASK_DAG_COVERAGE_DUPLICATE');
    const taskIds = strings(item.task_ids, 'TASK_DAG_COVERAGE_TASKS_INVALID', {nonempty:true});
    if (taskIds.some((taskId) => !tasks.has(taskId))) invalid('TASK_DAG_COVERAGE_TASK_UNKNOWN');
    coverage.set(criterionId, taskIds);
  }
  const taskPairs = [];
  for (const task of tasks.values()) for (const criterionId of task.acceptanceCriterionIds) taskPairs.push(`${criterionId}\u0000${task.id}`);
  const coveragePairs = [];
  for (const [criterionId, taskIds] of coverage) for (const taskId of taskIds) coveragePairs.push(`${criterionId}\u0000${taskId}`);
  taskPairs.sort(); coveragePairs.sort();
  if (canonicalJson(taskPairs) !== canonicalJson(coveragePairs)) invalid('TASK_DAG_COVERAGE_BIDIRECTIONAL_MISMATCH');

  if (!Array.isArray(dag.integration_points) || !Array.isArray(dag.risks)) invalid('TASK_DAG_INTEGRATION_INVALID');
  validateAcceptedRiskMappings(dag.risks, skip.accepted_risk_unknown_ids, tasks);
  const provenance = object(dag.provenance, 'TASK_DAG_PROVENANCE_INVALID');
  if (provenance.generated_by !== 'task-splitter' || provenance.spec_schema !== 'vulpora.clarified-task-spec/v2') {
    invalid('TASK_DAG_PROVENANCE_INVALID');
  }

  const result = {dag, specId, tasks, coverage, clarityGate: clarity};
  if (expectedSpec !== null) validateSpecBinding(result, expectedSpec);
  return result;
}

module.exports = {FORMULA, parseTaskDag, validateAcceptedRiskMappings, validateSpecBinding};

if (require.main === module) {
  try {
    if (![3, 4].includes(process.argv.length)) invalid('USAGE_TASK_DAG_PATH_OPTIONAL_SPEC_PATH');
    let spec = null;
    if (process.argv[3]) {
      const text = fs.readFileSync(process.argv[3], 'utf8');
      spec = JSON.parse(text);
      if (canonicalJson(spec) !== text) invalid('TASK_DAG_SPEC_NON_CANONICAL');
    }
    const result = parseTaskDag(fs.readFileSync(process.argv[2], 'utf8'), spec);
    process.stdout.write(`${JSON.stringify({outcome:'pass',spec_id:result.specId,task_count:result.tasks.size,acceptance_count:result.coverage.size})}\n`);
  } catch (error) {
    process.stderr.write(`${error.code || error.message || 'TASK_DAG_INVALID'}\n`);
    process.exit(1);
  }
}
