#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const {writeCanonicalValue} = require('./write-canonical-json.js');
const {canonicalJson} = require('./validate-execution-ledger.js');
const {FORMULA, parseTaskDag} = require('./validate-task-dag.js');

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function readObject(input, code) {
  let value;
  try { value = JSON.parse(fs.readFileSync(input, 'utf8')); } catch { fail(code); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  return value;
}

function criterionIds(spec) {
  if (!Array.isArray(spec.acceptance_criteria) || spec.acceptance_criteria.length === 0) {
    fail('SPEC_ACCEPTANCE_INVALID');
  }
  const ids = spec.acceptance_criteria.map((criterion) => typeof criterion === 'string' ? criterion : criterion?.id);
  if (ids.some((id) => typeof id !== 'string' || id.length === 0) || new Set(ids).size !== ids.length) {
    fail('SPEC_ACCEPTANCE_INVALID');
  }
  return ids;
}

function scopeAllowed(scope, allowed) {
  if (allowed.includes(scope)) return true;
  if (allowed.includes('workspace') && !scope.startsWith('/') && !scope.split('/').includes('..')) return true;
  return allowed.some((entry) => entry.endsWith('/*')
    ? scope.startsWith(entry.slice(0, -1))
    : scope.startsWith(`${entry}/`));
}

function comparableText(value) {
  return typeof value === 'string' ? value.replace(/`/g, '').replace(/\s+/g, ' ').trim().toLowerCase() : null;
}

function normalizeLegacyEnvelope(input, spec) {
  if (input.spec_id !== undefined) return input;
  if (input.spec?.spec_id !== spec.spec_id || !Array.isArray(input.task_graph?.tasks)
    || input.task_graph.tasks.length === 0 || !Array.isArray(input.task_graph?.waves)) {
    fail('DAG_SPEC_BINDING_INVALID');
  }
  const verificationCommand = input.verification?.command;
  if (typeof verificationCommand !== 'string' || verificationCommand.length === 0) {
    fail('LEGACY_DAG_VERIFICATION_INVALID');
  }
  const tasks = input.task_graph.tasks.map((task) => {
    if (task.execution?.kind !== 'leader-inline') fail('LEGACY_DAG_EXECUTION_UNSUPPORTED');
    const tests = task.acceptance_tests;
    if (!Array.isArray(tests) || tests.length === 0) fail('LEGACY_DAG_ACCEPTANCE_TEST_INVALID');
    return {
      id: task.id,
      title: task.title,
      objective: task.objective || task.title,
      depends_on: task.depends_on,
      owner_role: task.owner_role,
      write_scope: task.write_scope,
      read_scope: task.read_scope,
      acceptance_criterion_ids: task.acceptance_criterion_ids,
      acceptance_tests: tests.map((test) => typeof test === 'string'
        ? {method: verificationCommand, expected: test}
        : test),
      risk: {
        level: task.risk?.level,
        reason: task.risk?.reason || task.risk?.summary,
        recovery: task.risk?.recovery || 'Revert the bounded write scope.',
      },
      authority: {
        tools: task.authority?.tools || ['repository_read', 'bounded_code_edit', 'test_execution'],
        external_effects: task.authority?.external_effects || [],
        forbidden: task.authority?.forbidden,
      },
      execution: {
        kind: 'leader-inline',
        delegation_depth: 0,
        forbidden_actions: ['recursive delegation'],
        fallback: 'none',
        result_schema: 'vulpora.task-result/v2',
      },
      budget: {tool_calls: Number.isSafeInteger(task.budget?.tool_calls) ? task.budget.tool_calls : 40},
      outputs: task.outputs,
    };
  });
  const legacyCoverage = input.coverage?.acceptance_criteria;
  if (!Array.isArray(legacyCoverage)) fail('LEGACY_DAG_COVERAGE_INVALID');
  return {
    schema: 'vulpora.task-dag/v2',
    spec_id: spec.spec_id,
    plan_id: `plan-${spec.spec_id}`,
    status: input.status,
    parallelism_policy: {
      mode: input.parallelism_policy?.mode,
      effective_parallelism: input.parallelism_policy?.effective_parallelism,
      higher_policy_limit: input.parallelism_policy?.higher_policy_limit,
      fixed_cap: input.parallelism_policy?.fixed_cap,
    },
    clarity_gate: input.clarity_gate,
    tasks,
    waves: input.task_graph.waves,
    integration_points: [],
    coverage: legacyCoverage.map((entry) => ({
      acceptance_criterion_id: entry.acceptance_criterion_id || entry.id,
      task_ids: entry.task_ids,
    })),
    risks: Array.isArray(input.risks) ? input.risks : [],
    provenance: {generated_by: 'task-splitter', spec_schema: 'vulpora.clarified-task-spec/v2'},
  };
}

function normalizePreferredVariants(dag, spec) {
  if (dag.parallelism_policy?.mode === 'dynamic') {
    dag.parallelism_policy = {mode: 'dynamic', effective_parallelism: FORMULA,
      higher_policy_limit: null, fixed_cap: null};
  }
  dag.provenance = {...(dag.provenance || {}), generated_by: 'task-splitter',
    spec_schema: 'vulpora.clarified-task-spec/v2'};
  if (!Array.isArray(dag.coverage) && Array.isArray(dag.coverage?.acceptance_criteria)) {
    dag.coverage = dag.coverage.acceptance_criteria.map((entry) => ({
      acceptance_criterion_id: entry.acceptance_criterion_id || entry.id,
      task_ids: entry.task_ids,
    }));
  }
  if (!Array.isArray(dag.coverage) && dag.coverage && typeof dag.coverage === 'object') {
    dag.coverage = Object.entries(dag.coverage).map(([id, entry]) => ({
      acceptance_criterion_id: id,
      task_ids: entry?.task_ids,
    }));
  }
  const verificationMethod = Array.isArray(spec.verification)
    ? spec.verification.find((item) => typeof item?.command_or_method === 'string')?.command_or_method
    : null;
  for (const task of dag.tasks) {
    if (task.acceptance_tests && !Array.isArray(task.acceptance_tests)
      && typeof task.acceptance_tests === 'object') {
      if (!verificationMethod) fail('DAG_ACCEPTANCE_METHOD_UNAVAILABLE');
      task.acceptance_tests = Object.entries(task.acceptance_tests).map(([id, test]) => ({
        method: verificationMethod,
        expected: test?.description || id,
      }));
    }
    if (Array.isArray(task.acceptance_tests) && task.acceptance_tests.every((test) =>
      test && typeof test === 'object' && typeof test.description === 'string' && test.description.length > 0)) {
      if (!verificationMethod) fail('DAG_ACCEPTANCE_METHOD_UNAVAILABLE');
      task.acceptance_tests = task.acceptance_tests.map((test) => ({method: verificationMethod, expected: test.description}));
    }
    if (['deterministic', 'leader-inline'].includes(task.execution?.kind)
      && task.execution.result_schema === 'vulpora.task-result/v1') {
      task.execution.result_schema = 'vulpora.task-result/v2';
    }
    if (['deterministic', 'leader-inline'].includes(task.execution?.kind) && task.execution.fallback === undefined) {
      task.execution.fallback = 'none';
    }
  }
  return dag;
}

function main() {
  if (process.argv.length !== 5) fail('USAGE_CANDIDATE_SPEC_OUTPUT');
  const [, , candidatePath, specPath, outputPath] = process.argv;
  let dag = readObject(candidatePath, 'DAG_CANDIDATE_INVALID');
  const spec = readObject(specPath, 'SPEC_INVALID');
  if (dag.schema !== 'vulpora.task-dag/v2' || spec.schema !== 'vulpora.clarified-task-spec/v2') {
    fail('DAG_SPEC_BINDING_INVALID');
  }
  const legacyEnvelope = dag.spec_id === undefined;
  dag = normalizeLegacyEnvelope(dag, spec);
  dag = normalizePreferredVariants(dag, spec);
  if (dag.spec_id !== spec.spec_id || !Array.isArray(dag.tasks) || dag.tasks.length === 0) fail('DAG_SPEC_BINDING_INVALID');
  const ids = criterionIds(spec);
  const specForbidden = spec.authority?.forbidden;
  if (!Array.isArray(specForbidden) || specForbidden.some((item) => typeof item !== 'string' || item.length === 0)) {
    fail('SPEC_AUTHORITY_INVALID');
  }
  const specClarityGate = spec.clarity_projection?.clarity_gate;
  if (!specClarityGate || typeof specClarityGate !== 'object' || Array.isArray(specClarityGate)) {
    fail('SPEC_CLARITY_INVALID');
  }

  const coverage = new Map(ids.map((id) => [id, []]));
  const declaredCoverage = Array.isArray(dag.coverage) ? dag.coverage : [];
  const allowedReads = [...(spec.authority.allowed_reads || []), ...(spec.authority.allowed_writes || [])];
  const allowedExternalEffects = spec.authority.allowed_external_effects || [];
  for (const task of dag.tasks) {
    if (!task || typeof task !== 'object' || Array.isArray(task) || typeof task.id !== 'string'
      || !task.authority || !Array.isArray(task.authority.forbidden)) fail('DAG_TASK_INVALID');
    if (task.acceptance_criterion_ids === undefined) {
      task.acceptance_criterion_ids = declaredCoverage
        .filter((entry) => Array.isArray(entry?.task_ids) && entry.task_ids.includes(task.id))
        .map((entry) => entry.acceptance_criterion_id);
    }
    if (!Array.isArray(task.acceptance_criterion_ids) || task.acceptance_criterion_ids.length === 0) {
      fail('DAG_TASK_INVALID');
    }
    if (!Array.isArray(task.read_scope)) fail('DAG_TASK_INVALID');
    task.read_scope = task.read_scope.filter((scope) => scopeAllowed(scope, allowedReads));
    if (!Array.isArray(task.authority.external_effects)) fail('DAG_TASK_INVALID');
    task.authority.external_effects = task.authority.external_effects.map((effect) => {
      const exact = allowedExternalEffects.find((allowed) => comparableText(allowed) === comparableText(effect));
      return exact || effect;
    });
    for (const id of task.acceptance_criterion_ids) {
      if (!coverage.has(id)) fail('DAG_ACCEPTANCE_UNKNOWN');
      coverage.get(id).push(task.id);
    }
    task.authority.forbidden = [...new Set([...specForbidden, ...task.authority.forbidden])];
  }
  if ([...coverage.values()].some((taskIds) => taskIds.length === 0)) fail('DAG_ACCEPTANCE_UNASSIGNED');
  dag.coverage = ids.map((id) => ({acceptance_criterion_id: id, task_ids: coverage.get(id)}));
  dag.clarity_gate = specClarityGate;

  parseTaskDag(canonicalJson(dag), spec);

  const output = writeCanonicalValue(outputPath, dag);
  process.stdout.write(`${JSON.stringify({
    outcome: 'pass',
    validated: true,
    normalized: [
      ...(legacyEnvelope ? ['legacy_leader_inline_envelope'] : []),
      'coverage_bidirectional', 'frozen_forbidden_authority', 'normative_clarity_gate',
    ],
    ...output,
  })}\n`);
}

if (require.main === module) {
  try { main(); } catch (error) {
    process.stderr.write(`${error?.code || error?.message || 'TASK_DAG_NORMALIZATION_FAILED'}\n`);
    process.exit(1);
  }
}
