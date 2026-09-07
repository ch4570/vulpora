#!/usr/bin/env bash
set -eu
set -f
DIR="$(cd "$(dirname "$0")" && pwd -P)"
node - "$DIR/../skills/start-task/scripts/validate-execution-ledger.js" <<'NODE'
'use strict';
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const assert = require('node:assert/strict');
const api = require(process.argv[2]);
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'vulpora-routing-ledger-'));
let checks = 0;
function defaults() {
  return [1, 2].map((index) => ({
    task: 'T-001', id: `T-001-A0${index}`, model: 'fixture-model', effort: 'low', observedEffort: 'low',
    requirement: 'a'.repeat(64), handoffRequirement: 'a'.repeat(64),
    mutation: index === 1 ? 'effect_none' : 'known_effect', failure: index === 1 ? 'transient_effect_none' : null,
    action: index === 1 ? 'retry_same_route' : 'success',
    debit: {relative_units: 1, estimated_tokens: 6000},
    remaining: {relative_units: 3 - index, estimated_tokens: (3 - index) * 6000, attempts: 3 - index, route_hops: 2},
  }));
}
function materialize(name, plans) {
  const root = path.join(work, name), run = 'run-routing-ledger';
  fs.mkdirSync(path.join(root, `.vulpora/tasks/${run}/routing`), {recursive: true});
  const report = {run_id: run, children: [], task_results: [], routing_attempts: []}, records = [];
  for (const plan of plans) {
    const identity = {run_id: run, task_id: plan.task, attempt_id: plan.id, immutable: true};
    const save = (kind, value) => {
      const relative = `.vulpora/tasks/${run}/routing/${plan.id}-${kind}.json`, bytes = api.canonicalJson(value);
      fs.writeFileSync(path.join(root, relative), bytes);
      const reference = {path: relative, sha256: api.sha256(bytes), immutable: true};
      records.push({phase: 'execute', source_type: 'filesystem_digest', status: 'passed',
        source_ref: `file-sha256:${reference.sha256}:${relative}`});
      return reference;
    };
    const selected = {schema: 'vulpora.routing-dispatch-receipt/v1', ...identity, selected_model: plan.model};
    if (plan.effort !== undefined) selected.selected_reasoning_effort = plan.effort;
    if (plan.nested !== undefined) selected.selected_route = plan.nested;
    if (plan.reasoningAlias !== undefined) selected.reasoning_effort = plan.reasoningAlias;
    if (plan.requirement !== undefined) selected.route_requirement_sha256 = plan.requirement;
    const dispatch = save('dispatch', selected);
    const attempt = {task_id: plan.task, attempt_id: plan.id, dispatch_receipt: dispatch,
      mutation_state: plan.mutation, failure_class: plan.failure, action: plan.action,
      budget_debit: plan.debit, budget_remaining: plan.remaining, runtime_reported_model: plan.model};
    const outcome = {schema: 'vulpora.routing-attempt-receipt/v1', ...identity, ...attempt};
    if (plan.observedEffort !== undefined) outcome.runtime_reported_reasoning_effort = plan.observedEffort;
    attempt.attempt_receipt = save('attempt', outcome);
    report.routing_attempts.push(attempt);
    const handoff = {schema: 'vulpora.subagent-handoff/v2', task_id: plan.task, attempt_id: plan.id,
      result_schema: 'vulpora.task-result/v2', dispatch_receipt: dispatch,
      route_binding_sha256: api.sha256(api.canonicalJson({attempt_id: plan.id, dispatch_receipt: dispatch}))};
    if (plan.handoffRequirement !== undefined) handoff.route_requirement_sha256 = plan.handoffRequirement;
    report.children.push({agent_id: `execution-${plan.id}`, inheritance_used: false,
      runtime_reported_model: plan.model, handoff});
    report.task_results.push({schema: 'vulpora.task-result/v2', task_id: plan.task, attempt_id: plan.id,
      status: plan.failure === null ? 'verified' : 'failed', mutation_state: plan.mutation, acceptance_evidence: []});
  }
  return {root, report, records};
}
function check(name, mutate = () => {}, expected = null, changeReport = null, useRecords = false) {
  const plans = defaults();
  mutate(plans);
  let code = null;
  try {
    const fixture = materialize(name, plans);
    if (changeReport) changeReport(fixture.report);
    api.validateRoutingReceiptBindings(fixture.report, fixture.root, useRecords ? fixture.records : undefined);
  }
  catch (error) { code = error.code || error.message; }
  assert.equal(code, expected, `${name}: exact freshly hashed receipt validation`);
  checks += 1;
}
try {
  check('matching-effort-and-retry-budget');
  check('legacy-model-only-single-attempt', (plans) => {
    plans.splice(1); delete plans[0].effort; delete plans[0].observedEffort;
    delete plans[0].requirement; delete plans[0].handoffRequirement;
  });
  check('observed-effort-mismatch', (plans) => { plans[1].observedEffort = 'high'; }, 'ROUTING_RUNTIME_DISPATCH_REASONING_MISMATCH');
  check('missing-observed-effort', (plans) => { delete plans[0].observedEffort; }, 'ROUTING_RUNTIME_REASONING_MISSING');
  check('unavailable-observed-effort', (plans) => { plans[0].observedEffort = 'unavailable'; }, 'ROUTING_RUNTIME_REASONING_MISSING');
  check('missing-selected-effort', (plans) => { delete plans[0].effort; }, 'ROUTING_DISPATCH_REASONING_MISSING');
  check('conflicting-selected-model-alias', (plans) => { plans[0].nested = {model_id: 'another-model'}; }, 'ROUTING_DISPATCH_MODEL_CONFLICT');
  check('conflicting-selected-effort-alias', (plans) => { plans[0].reasoningAlias = 'high'; }, 'ROUTING_DISPATCH_REASONING_CONFLICT');
  check('matching-selected-aliases', (plans) => {
    for (const plan of plans) plan.nested = {model_id: plan.model, reasoning_effort: plan.effort};
  });
  check('requirement-binding-mismatch', (plans) => { plans[0].handoffRequirement = 'b'.repeat(64); }, 'ROUTING_REQUIREMENT_BINDING_MISMATCH');
  check('requirement-binding-missing', (plans) => { delete plans[0].handoffRequirement; }, 'ROUTING_REQUIREMENT_BINDING_MISMATCH');
  check('minted-relative-budget', (plans) => { plans[1].remaining.relative_units = 999; }, 'ROUTING_BUDGET_DEBIT_SEQUENCE_MISMATCH');
  check('minted-token-budget', (plans) => { plans[1].remaining.estimated_tokens = 999999; }, 'ROUTING_BUDGET_DEBIT_SEQUENCE_MISMATCH');
  check('unaccounted-relative-debit', (plans) => { plans[1].debit.relative_units = 0; }, 'ROUTING_BUDGET_DEBIT_SEQUENCE_MISMATCH');
  check('unaccounted-token-debit', (plans) => { plans[1].debit.estimated_tokens = 0; }, 'ROUTING_BUDGET_DEBIT_SEQUENCE_MISMATCH');
  check('valid-zero-debit-still-consumes-attempt', (plans) => {
    plans[1].debit = {relative_units: 0, estimated_tokens: 0};
    plans[1].remaining.relative_units = 2; plans[1].remaining.estimated_tokens = 12000;
  });
  check('reused-attempt-budget', (plans) => { plans[1].remaining.attempts = 2; }, 'ROUTING_ATTEMPT_BUDGET_SEQUENCE_MISMATCH');
  check('exhausted-attempt-budget', (plans) => { plans[0].remaining.attempts = 0; plans[1].remaining.attempts = 0; }, 'ROUTING_ATTEMPT_BUDGET_SEQUENCE_MISMATCH');
  check('minted-hop-budget', (plans) => { plans[1].remaining.route_hops = 3; }, 'ROUTING_HOP_BUDGET_SEQUENCE_MISMATCH');
  check('unrelated-hop-charge', (plans) => { plans[1].remaining.route_hops = 1; }, 'ROUTING_HOP_BUDGET_SEQUENCE_MISMATCH');
  check('negative-budget', (plans) => { plans[0].debit.relative_units = -1; }, 'ROUTING_BUDGET_INVALID');
  check('unsafe-integer-budget', (plans) => { plans[0].remaining.relative_units = Number.MAX_SAFE_INTEGER + 1; }, 'NON_CANONICAL_NUMBER');
  check('extra-budget-field', (plans) => { plans[0].debit.free_retry = true; }, 'ROUTING_BUDGET_INVALID');
  check('retry-changes-model', (plans) => { plans[1].model = 'another-model'; }, 'ROUTING_SAME_ROUTE_CHANGED');
  check('retry-changes-effort', (plans) => { plans[1].effort = plans[1].observedEffort = 'medium'; }, 'ROUTING_SAME_ROUTE_CHANGED');
  check('failover-charged-on-replacement', (plans) => {
    plans[0].failure = 'provider_health'; plans[0].action = 'failover_same_tier';
    plans[1].model = 'another-model'; plans[1].remaining.route_hops = 1;
  });
  check('failover-reserved-at-decision', (plans) => {
    plans[0].failure = 'provider_health'; plans[0].action = 'failover_same_tier';
    plans[0].remaining.route_hops = plans[1].remaining.route_hops = 1; plans[1].model = 'another-model';
  });
  check('independent-task-budgets', (plans) => {
    const other = {...plans[1], task: 'T-002', id: 'T-002-A01',
      debit: {relative_units: 10, estimated_tokens: 100}, remaining: {relative_units: 200, estimated_tokens: 2000, attempts: 20, route_hops: 20}};
    plans.splice(1, 0, other);
  });
  check('ledger-order-over-report-order', () => {}, null, (report) => report.routing_attempts.reverse(), true);
  check('shuffled-standalone-report', () => {}, 'ROUTING_BUDGET_DEBIT_SEQUENCE_MISMATCH', (report) => report.routing_attempts.reverse());
  process.stdout.write(`${JSON.stringify({semantic_ac_key: 'routing_receipt_exact_bindings', outcome: 'pass', checks,
    live_model_turns: 0, effort_binding: 'when-present-legacy-model-only-preserved',
    budget_scope: 'task-local-receipt-arithmetic-not-hard-billing-enforcement',
    initial_budget: 'NOT_VERIFIED', handoff_reservation_timing: 'NOT_VERIFIED',
    hop_charge_timing: 'NOT_VERIFIED', run_budget: 'NOT_VERIFIED', billing: 'NOT_VERIFIED'})}\n`);
} finally { fs.rmSync(work, {recursive: true, force: true}); }
NODE
