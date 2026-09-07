#!/usr/bin/env node
'use strict';

const fs = require('node:fs');

const PROFILES = new Set(['auto', 'lightweight', 'standard', 'audit']);
const RISK_KEYS = [
  'destructive_or_irreversible',
  'security_or_authorization_boundary',
  'credential_access',
  'production_data_migration_or_backfill',
  'production_deployment_or_multi_service_release',
  'external_side_effects_not_easily_reversible',
  'regulatory_or_audit_evidence_required',
];
const TASK_KEYS = [
  'scoped_target',
  'acceptance_known',
  'verification_known',
  'material_unknown_count',
  'independent_lane_count',
  'broad_change_scope',
  'shared_public_contract_or_schema',
  'risk',
];

function fail(code) {
  process.stderr.write(`${code}\n`);
  process.exit(2);
}

function exactKeys(value, expected, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) fail(code);
}

function boolean(value, code) {
  if (typeof value !== 'boolean') fail(code);
}

function nonNegativeInteger(value, code) {
  if (!Number.isSafeInteger(value) || value < 0) fail(code);
}

let input;
try {
  input = JSON.parse(fs.readFileSync(0, 'utf8'));
} catch {
  fail('INVALID_PROFILE_INPUT_JSON');
}

exactKeys(input, ['schema', 'requested_profile', 'task'], 'INVALID_PROFILE_INPUT_FIELDS');
if (input.schema !== 'vulpora.start-task-profile-input/v1') fail('INVALID_PROFILE_INPUT_SCHEMA');
if (!PROFILES.has(input.requested_profile)) fail('INVALID_REQUESTED_PROFILE');
exactKeys(input.task, TASK_KEYS, 'INVALID_PROFILE_TASK_FIELDS');
exactKeys(input.task.risk, RISK_KEYS, 'INVALID_PROFILE_RISK_FIELDS');

for (const key of ['scoped_target', 'acceptance_known', 'verification_known', 'broad_change_scope', 'shared_public_contract_or_schema']) {
  boolean(input.task[key], `INVALID_PROFILE_${key.toUpperCase()}`);
}
for (const key of RISK_KEYS) boolean(input.task.risk[key], `INVALID_PROFILE_RISK_${key.toUpperCase()}`);
nonNegativeInteger(input.task.material_unknown_count, 'INVALID_PROFILE_MATERIAL_UNKNOWN_COUNT');
nonNegativeInteger(input.task.independent_lane_count, 'INVALID_PROFILE_INDEPENDENT_LANE_COUNT');

const auditSignals = RISK_KEYS.filter((key) => input.task.risk[key]);
const standardSignals = [];
if (!input.task.scoped_target) standardSignals.push('target_not_yet_scoped');
if (!input.task.acceptance_known) standardSignals.push('acceptance_not_yet_known');
if (!input.task.verification_known) standardSignals.push('verification_not_yet_known');
if (input.task.material_unknown_count > 0) standardSignals.push('material_unknowns');
if (input.task.independent_lane_count > 1) standardSignals.push('independent_lanes');
if (input.task.broad_change_scope) standardSignals.push('broad_change_scope');
if (input.task.shared_public_contract_or_schema) standardSignals.push('shared_public_contract_or_schema');

let profile;
const reasons = [];
if (auditSignals.length > 0) {
  profile = 'audit';
  reasons.push(...auditSignals);
  if (input.requested_profile !== 'auto' && input.requested_profile !== 'audit') reasons.push('risk_floor_overrode_requested_profile');
} else if (input.requested_profile !== 'auto') {
  profile = input.requested_profile;
  reasons.push(`explicit_${profile}`);
} else if (standardSignals.length > 0) {
  profile = 'standard';
  reasons.push(...standardSignals);
} else {
  profile = 'lightweight';
  reasons.push('clear_scoped_reversible_single_owner_change');
}

const controls = profile === 'audit'
  ? {
      specification: 'immutable_audited_specification',
      brief_count: null,
      questions: 'one_decision_per_turn',
      execution_owner: 'dag_planned_children_or_primary_fallback',
      child_no_progress_seconds: 60,
      dag: true,
      ledger: true,
      routing_receipts: 'native_execution_attempts_only',
      verification: 'ledger_bound_acceptance_evidence',
    }
  : {
      specification: 'single_concise_brief',
      brief_count: 1,
      questions: profile === 'lightweight' ? 'none_unless_material_blocker' : 'single_batched_turn_if_needed',
      execution_owner: input.task.independent_lane_count > 1
        ? 'primary_with_optional_independent_children'
        : 'primary',
      child_no_progress_seconds: profile === 'standard' ? 60 : null,
      dag: false,
      ledger: false,
      routing_receipts: false,
      verification: profile === 'lightweight' ? 'targeted_once' : 'targeted_integration_once',
    };

process.stdout.write(`${JSON.stringify({
  schema: 'vulpora.start-task-profile-decision/v1',
  profile,
  reasons,
  controls,
})}\n`);
