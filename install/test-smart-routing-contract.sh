#!/usr/bin/env bash
set -eu

DIR="$(cd "$(dirname "$0")" && pwd -P)"
ROOT="$(cd "$DIR/.." && pwd -P)"
DAG="$ROOT/agents/task-splitter/reference/kb/task-dag-schema.md"
POLICY="$ROOT/agents/task-splitter/reference/kb/smart-routing-policy.md"
STATE="$ROOT/agents/task-orchestrator/reference/kb/routing-state-machine.md"
HANDOFF="$ROOT/agents/task-orchestrator/reference/kb/native-subagent-handoff.md"
SKILL="$ROOT/skills/start-task/reference/kb/operating-contract.md"
CONTRACTS="$ROOT/skills/start-task/reference/kb/handoff-contracts.md"
CLASSIFIER="$ROOT/skills/start-task/scripts/classify-routing-attempt.js"
POSITIVE_FIXTURE="$ROOT/install/fixtures/smart-routing/positive-transient-effect-none.json"
NEGATIVE_FIXTURE="$ROOT/install/fixtures/smart-routing/negative-extra-field.json"

for needle in \
  'schema: vulpora.task-dag/v2' \
  'capability_profile:' \
  'required_capabilities:' \
  'complexity_evidence:' \
  'risk_floor:' \
  'reasoning:' \
  'relative_unit_ceiling_per_attempt:' \
  'task_total_relative_units:' \
  'policy: {id:' \
  'data_policy:' \
  'same_route_retries:' \
  'same_tier_failovers:' \
  'tier_escalations:' \
  'max_route_hops:' \
  'max_total_attempts:'; do
  grep -Fq "$needle" "$DAG" || { echo "missing portable DAG field: $needle" >&2; exit 1; }
done

dag_example="$(awk '/^```yaml$/{capture=1;next} capture && /^```$/{exit} capture{print}' "$DAG")"
if printf '%s\n' "$dag_example" | rg -n -i \
  'provider(_id)?:|model(_id)?:|deployment(_id)?:|endpoint:|catalog(_entry|_row)?_id:|requested_model:|runtime:[[:space:]]*(codex|claude)'; then
  echo 'concrete route identifier leaked into frozen DAG example' >&2
  exit 1
fi
handoff_example="$(awk '/^```yaml$/{capture=1;next} capture && /^```$/{exit} capture{print}' "$HANDOFF")"
if printf '%s\n' "$handoff_example" | rg -n -i \
  'provider(_id)?:|model(_id)?:|deployment(_id)?:|endpoint:|catalog(_entry|_row)?_id:|requested_model:'; then
  echo 'concrete route identifier leaked into v2 handoff example' >&2
  exit 1
fi

grep -Fq 'fixed_cap: null' "$DAG"
grep -Fq 'effective_parallelism: min(runtime_available_slots, dependency_ready_tasks, disjoint_write_logical_scopes, higher_policy_limit)' "$DAG"
grep -Fq 'The v1 handoff/result contracts remain legacy input only' "$STATE"
grep -Fq 'vulpora.subagent-handoff/v2' "$HANDOFF"
grep -Fq 'vulpora.task-result/v2' "$HANDOFF"
grep -Fq 'vulpora.routing-dispatch-receipt/v1' "$STATE"
grep -Fq 'vulpora.routing-attempt-receipt/v1' "$STATE"
grep -Fq 'filters candidates' "$STATE"
grep -Fq 'ranks the survivors' "$STATE"
grep -Fq 'immutable for one attempt' "$STATE"

for failure_class in \
  transient_effect_none route_health provider_health capability_insufficient \
  deterministic_implementation_failure authentication quota missing_tool authority budget unknown_mutation_state; do
  grep -Fq "$failure_class" "$STATE" || { echo "missing failure class: $failure_class" >&2; exit 1; }
done

grep -Fq 'Cross-provider failover' "$POLICY"
grep -Fq 'Missing or unknown policy means deny' "$POLICY"
grep -Fq 'tier_escalations > 0' "$POLICY"
grep -Fq 'fails closed' "$STATE"
grep -Fq 'Cross-provider failover fails closed' "$SKILL"
grep -Fq 'Tier escalation fails closed' "$SKILL"
grep -Fq 'Legacy `vulpora.task-dag/v1`' "$CONTRACTS"
[ -x "$CLASSIFIER" ] || { echo 'routing classifier is not executable' >&2; exit 1; }

node - "$CLASSIFIER" "$POSITIVE_FIXTURE" "$NEGATIVE_FIXTURE" <<'NODE'
'use strict';
const fs = require('node:fs');
const {spawnSync} = require('node:child_process');
const [classifier, positivePath, negativePath] = process.argv.slice(2);
const base = JSON.parse(fs.readFileSync(positivePath, 'utf8'));

function clone(value) { return structuredClone(value); }
function decide(input) {
  const run = spawnSync(process.execPath, [classifier], {input: JSON.stringify(input), encoding: 'utf8'});
  if (run.status !== 0) throw new Error(`classifier rejected valid input: ${run.stderr}`);
  return JSON.parse(run.stdout);
}
function expect(input, action, reason) {
  const decision = decide(input);
  if (decision.action !== action || (reason && decision.reason !== reason)) {
    throw new Error(`expected ${action}/${reason || '*'}, got ${decision.action}/${decision.reason}`);
  }
}

expect(base, 'retry_same_route', 'TRANSIENT_EFFECT_NONE');

for (const failureClass of ['route_health', 'provider_health']) {
  const input = clone(base);
  input.failure_class = failureClass;
  input.mutation_state = 'effect_none';
  expect(input, 'failover_same_tier', 'ROUTE_OR_PROVIDER_HEALTH');
}

const crossProviderAllowed = clone(base);
crossProviderAllowed.failure_class = 'provider_health';
crossProviderAllowed.failover.crosses_provider = true;
crossProviderAllowed.failover.data_policy.cross_provider_transfer = 'allow';
expect(crossProviderAllowed, 'failover_same_tier');

const crossProviderUnknown = clone(crossProviderAllowed);
crossProviderUnknown.failover.data_policy.reference = null;
crossProviderUnknown.failover.data_policy.version = null;
crossProviderUnknown.failover.data_policy.cross_provider_transfer = 'unknown';
expect(crossProviderUnknown, 'block', 'CROSS_PROVIDER_DATA_POLICY_DENIED');

const capability = clone(base);
capability.failure_class = 'capability_insufficient';
capability.verifier.capability_insufficient = true;
capability.verifier.evidence_ref = 'verifier-receipt:sha256:abc';
expect(capability, 'escalate_capability_tier', 'VERIFIED_CAPABILITY_INSUFFICIENCY');

const capabilityWithoutVerifier = clone(capability);
capabilityWithoutVerifier.verifier.capability_insufficient = false;
capabilityWithoutVerifier.verifier.evidence_ref = null;
expect(capabilityWithoutVerifier, 'block', 'VERIFIER_EVIDENCE_REQUIRED');

const capabilityCrossProviderDenied = clone(capability);
capabilityCrossProviderDenied.failover.crosses_provider = true;
expect(capabilityCrossProviderDenied, 'block', 'ESCALATION_CROSS_PROVIDER_DATA_POLICY_DENIED');

const capabilityCrossProviderAllowed = clone(capabilityCrossProviderDenied);
capabilityCrossProviderAllowed.failover.data_policy.cross_provider_transfer = 'allow';
expect(capabilityCrossProviderAllowed, 'escalate_capability_tier', 'VERIFIED_CAPABILITY_INSUFFICIENCY');

const capabilityWithoutTotalBudget = clone(capability);
capabilityWithoutTotalBudget.budget.task_total_relative_units = null;
capabilityWithoutTotalBudget.budget.task_total_estimated_tokens = null;
capabilityWithoutTotalBudget.bounds.max_route_hops = null;
expect(capabilityWithoutTotalBudget, 'block', 'ESCALATION_TOTAL_BUDGET_HOP_OR_ATTEMPT_GATE');

const repair = clone(base);
repair.failure_class = 'deterministic_implementation_failure';
repair.mutation_state = 'known_effect';
expect(repair, 'repair', 'DETERMINISTIC_IMPLEMENTATION_FAILURE');

for (const failureClass of ['authentication', 'quota', 'missing_tool', 'authority', 'budget']) {
  const input = clone(base);
  input.failure_class = failureClass;
  expect(input, 'block');
}

const unknownMutation = clone(base);
unknownMutation.failure_class = 'unknown_mutation_state';
unknownMutation.mutation_state = 'unknown';
expect(unknownMutation, 'reconcile', 'UNKNOWN_MUTATION_STATE');

const unclassified = clone(base);
unclassified.failure_class = 'unclassified';
expect(unclassified, 'stop', 'UNCLASSIFIED_FAILURE');

const invalid = spawnSync(process.execPath, [classifier], {
  input: fs.readFileSync(negativePath), encoding: 'utf8',
});
if (invalid.status === 0 || !invalid.stderr.startsWith('INVALID_FIELDS:input')) {
  throw new Error(`invalid fixture did not fail closed: ${invalid.stdout} ${invalid.stderr}`);
}
NODE

if rg -n 'advance_route|advance-route|Ouroboros[^\n]*0\.51\.13' \
  "$DAG" "$POLICY" "$STATE" "$HANDOFF" "$SKILL" "$CONTRACTS" >/dev/null; then
  echo 'live Ouroboros route implementation was copied into the shared contract' >&2
  exit 1
fi

printf '%s\n' '{"semantic_ac_key":"provider_neutral_smart_routing","outcome":"pass","task_dag":"vulpora.task-dag/v2","handoff":"vulpora.subagent-handoff/v2","task_result":"vulpora.task-result/v2","concrete_ids_in_frozen_dag":false,"dynamic_parallelism":true,"failure_taxonomy":true,"classifier_executable":true,"positive_negative_fixtures":true,"cross_provider_fail_closed":true,"tier_escalation_fail_closed":true}'
