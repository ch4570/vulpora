#!/usr/bin/env node
'use strict';

const fs = require('node:fs');

const DIMENSION_RULES = [
  {id: 'goal', weight: 20, signals: ['outcome_named', 'trigger_named', 'observable_change_named', 'user_value_named']},
  {id: 'scope', weight: 20, signals: ['include_named', 'exclude_named', 'repository_targets_bound', 'ownership_bound']},
  {id: 'acceptance', weight: 20, signals: ['happy_path_observable', 'failure_path_observable', 'expected_values_named', 'criterion_ids_stable']},
  {id: 'constraints', weight: 15, signals: ['compatibility_named', 'dependency_policy_named', 'operational_limits_named', 'recovery_named']},
  {id: 'authority_risk', weight: 15, signals: ['write_scope_named', 'external_effects_named', 'destructive_effects_resolved', 'credentials_resolved']},
  {id: 'verification', weight: 10, signals: ['method_named', 'expected_outcome_named', 'failure_diagnostics_named', 'environment_bound']},
];
const UNKNOWN_DIMENSIONS = new Map([
  ['goal', 'goal'], ['scope', 'scope'], ['acceptance', 'acceptance'],
  ['constraints', 'constraints'], ['implementation_detail', 'constraints'],
  ['authority', 'authority_risk'], ['destructive', 'authority_risk'], ['credential', 'authority_risk'],
  ['external_write', 'authority_risk'], ['public_contract', 'authority_risk'],
  ['material_data_model', 'authority_risk'], ['verification', 'verification'],
]);

function invalid(code, detail) {
  const error = new Error(`${code}${detail ? `:${detail}` : ''}`);
  error.code = code;
  throw error;
}

function exactKeys(value, expected, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(code);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) invalid(code);
}

function validateEvidence(id, rating, evidence) {
  const match = typeof evidence === 'string'
    ? evidence.trim().match(/^(user|repository|policy|assumption):\s*\S.{10,}$/u)
    : null;
  if (!match) invalid('INVALID_EVIDENCE_PROVENANCE', id);
  if (match[1] === 'assumption' && rating > 2) invalid('ASSUMPTION_EVIDENCE_OVERCLAIM', id);
  if (id === 'goal' && match[1] !== 'user') invalid('GOAL_REQUIRES_USER_EVIDENCE');
  if (id === 'authority_risk' && !['user', 'policy'].includes(match[1])) {
    invalid('AUTHORITY_REQUIRES_USER_OR_POLICY_EVIDENCE');
  }
  return evidence.trim();
}

function assessDimensions(assessment, unknowns = []) {
  exactKeys(assessment, DIMENSION_RULES.map((rule) => rule.id), 'INVALID_ASSESSMENT_DIMENSIONS');
  const pendingDimensions = new Set((unknowns || [])
    .filter((unknown) => unknown?.disposition === 'pending')
    .map((unknown) => UNKNOWN_DIMENSIONS.get(unknown.category))
    .filter(Boolean));
  let score = 0;
  const dimensions = DIMENSION_RULES.map((rule) => {
    const candidate = assessment[rule.id];
    exactKeys(candidate, ['signals', 'evidence'], `INVALID_ASSESSMENT:${rule.id}`);
    exactKeys(candidate.signals, rule.signals, `INVALID_SIGNALS:${rule.id}`);
    if (rule.signals.some((signal) => typeof candidate.signals[signal] !== 'boolean')) {
      invalid('NON_BOOLEAN_SIGNAL', rule.id);
    }
    const observed = rule.signals.filter((signal) => candidate.signals[signal]).length;
    const rating = pendingDimensions.has(rule.id) && observed > 3 ? 3 : observed;
    const evidence = validateEvidence(rule.id, rating, candidate.evidence);
    const awarded = Math.floor((rule.weight * rating) / 4 + 0.5);
    score += awarded;
    return {
      id: rule.id,
      weight: rule.weight,
      rating,
      awarded,
      evidence,
      observed_signals: rule.signals.filter((signal) => candidate.signals[signal]),
      missing_signals: rule.signals.filter((signal) => !candidate.signals[signal]),
    };
  });
  return {dimensions, score};
}

module.exports = {DIMENSION_RULES, UNKNOWN_DIMENSIONS, assessDimensions};

if (require.main === module) {
  try {
    const input = JSON.parse(fs.readFileSync(0, 'utf8'));
    const result = assessDimensions(input.assessment, input.unknowns || []);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${error.code || error.message || 'ASSESSMENT_FAILED'}\n`);
    process.exit(1);
  }
}
