#!/usr/bin/env bash
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
SELECTOR="$ROOT/skills/start-task/scripts/select-execution-profile.js"
SKILL="$ROOT/skills/start-task/SKILL.md"

[ -x "$SELECTOR" ]
grep -Fq -- '--lightweight`, `--standard`, or `--audit`' "$SKILL"
grep -Fq 'Do not create a ledger, frozen' "$SKILL"

node - "$SELECTOR" <<'NODE'
const {spawnSync} = require('node:child_process');

const selector = process.argv[2];

function select(input) {
  const result = spawnSync(process.execPath, [selector], {
    input: JSON.stringify(input),
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`selector failed: ${result.stderr}`);
  }
  return JSON.parse(result.stdout);
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

function expectReject(input, message) {
  const result = spawnSync(process.execPath, [selector], {
    input: JSON.stringify(input),
    encoding: 'utf8',
  });
  expect(result.status !== 0, message);
}

const base = {
  schema: 'vulpora.start-task-profile-input/v1',
  requested_profile: 'auto',
  task: {
    scoped_target: true,
    acceptance_known: true,
    verification_known: true,
    material_unknown_count: 0,
    independent_lane_count: 1,
    broad_change_scope: false,
    shared_public_contract_or_schema: false,
    risk: {
      destructive_or_irreversible: false,
      security_or_authorization_boundary: false,
      credential_access: false,
      production_data_migration_or_backfill: false,
      production_deployment_or_multi_service_release: false,
      external_side_effects_not_easily_reversible: false,
      regulatory_or_audit_evidence_required: false,
    },
  },
};

const small = select(base);
expect(small.profile === 'lightweight', 'small clear change must use lightweight');
expect(small.controls.specification === 'single_concise_brief', 'lightweight must use one concise brief');
expect(small.controls.brief_count === 1, 'lightweight must freeze the brief once');
expect(small.controls.questions === 'none_unless_material_blocker', 'lightweight must not add confirmation turns');
expect(small.controls.execution_owner === 'primary', 'lightweight must stay primary-owned');
expect(small.controls.dag === false, 'lightweight must not create a DAG');
expect(small.controls.ledger === false, 'lightweight must not create a ledger');
expect(small.controls.routing_receipts === false, 'lightweight must not create routing receipts');

const apiContract = structuredClone(base);
apiContract.task.shared_public_contract_or_schema = true;
apiContract.task.material_unknown_count = 4;
const standard = select(apiContract);
expect(standard.profile === 'standard', 'ordinary API contract work must not become audit by default');
expect(standard.controls.questions === 'single_batched_turn_if_needed', 'standard must batch material questions');
expect(standard.controls.brief_count === 1, 'standard must freeze the brief once');
expect(standard.controls.child_no_progress_seconds === 60, 'standard must reclaim stalled children within 60 seconds');
expect(standard.controls.dag === false, 'standard must not require a DAG');
expect(standard.controls.ledger === false, 'standard must not require a ledger');
expect(standard.controls.routing_receipts === false, 'standard must not require routing receipts');
expect(standard.controls.execution_owner === 'primary', 'coupled standard work must default to one owner');

const parallel = structuredClone(base);
parallel.task.independent_lane_count = 3;
const coordinated = select(parallel);
expect(coordinated.profile === 'standard', 'independent lanes should use standard coordination');
expect(coordinated.controls.execution_owner === 'primary_with_optional_independent_children', 'children must be optional and independence-gated');

for (const risk of [
  'destructive_or_irreversible',
  'security_or_authorization_boundary',
  'credential_access',
  'production_data_migration_or_backfill',
  'production_deployment_or_multi_service_release',
  'external_side_effects_not_easily_reversible',
  'regulatory_or_audit_evidence_required',
]) {
  const risky = structuredClone(base);
  risky.task.risk[risk] = true;
  const audit = select(risky);
  expect(audit.profile === 'audit', `${risk} must use audit`);
  expect(audit.controls.dag === true, 'audit must preserve DAG controls');
  expect(audit.controls.ledger === true, 'audit must preserve ledger controls');
  expect(audit.controls.routing_receipts === 'native_execution_attempts_only', 'audit must bind receipts only to native execution attempts');
  expect(audit.controls.child_no_progress_seconds === 60, 'audit execution children must have a no-progress reclaim bound');
}

const forcedAudit = structuredClone(base);
forcedAudit.requested_profile = 'audit';
expect(select(forcedAudit).profile === 'audit', 'explicit audit must be honored');

const unsafeDownshift = structuredClone(base);
unsafeDownshift.requested_profile = 'lightweight';
unsafeDownshift.task.risk.production_data_migration_or_backfill = true;
expect(select(unsafeDownshift).profile === 'audit', 'explicit lightweight must not bypass an audit risk signal');

const inventedField = structuredClone(base);
inventedField.task.risk.unspecified_guess = false;
expectReject(inventedField, 'unknown risk fields must be rejected');

const numericGuess = structuredClone(base);
numericGuess.task.acceptance_known = 1;
expectReject(numericGuess, 'non-boolean evidence signals must be rejected');

process.stdout.write('start-task execution profile: PASS\n');
NODE
