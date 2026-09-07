#!/usr/bin/env bash
# Adversarial contracts for the fail-closed improvement promotion gate.
set -eu
set -o pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
VALIDATOR="$DIR/validate-improvement-records.sh"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/vulpora-improvement-contract.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT HUP INT TERM
mkdir -p "$WORK/results"

expect_fail() {
  label="$1"; shift
  if "$@" >/dev/null 2>&1; then
    echo "unexpected pass: $label" >&2
    exit 1
  fi
}

write_record() {
  file="$1"; before="$2"; after="$3"
  printf '%s\n' \
    'schema_version: vulpora.improvement-record/v1' \
    'id: promotion-contract-v1' \
    'status: promoted' \
    'lineage:' \
    '  source_failure_or_incident: incident-contract-001' \
    '  source_id: incident-contract-001' \
    'hypothesis: A linked result proves a measured improvement.' \
    'affected_asset:' \
    '  kind: agent' \
    '  id: contract-agent' \
    'proposed_change: Use the evaluated candidate.' \
    'change_author: author@example.invalid' \
    'evaluation:' \
    '  before_evidence:' \
    "    - result_id:$before" \
    '  after_evidence:' \
    "    - result_id:$after" \
    'approval:' \
    '  independent_approver: reviewer@example.invalid' \
    "  approved_at: '2026-09-04T00:00:00Z'" \
    'rollback:' \
    '  plan: Revert the candidate revision.' \
    '  trigger: Safety score or outcome regression.' > "$file"
}

write_multitrial_record() {
  file="$1"; before_one="$2"; before_two="$3"; after_one="$4"; after_two="$5"
  write_record "$file" "$before_one" "$after_one"
  awk -v b="$before_one" -v b2="$before_two" -v a="$after_one" -v a2="$after_two" '
    $0 == "    - result_id:" b { print; print "    - result_id:" b2; next }
    $0 == "    - result_id:" a { print; print "    - result_id:" a2; next }
    { print }
  ' "$file" > "$file.rewritten"
  mv "$file.rewritten" "$file"
}

write_result() {
  file="$1"; rid="$2"; outcome="$3"; process="$4"; safety="$5"; target_id="${6:-contract-agent}"; trial_index="${7:-1}"; trial_count="${8:-1}"
  printf '%s\n' \
    'schema: vulpora.eval-result' \
    "eval_id: $rid" \
    'case_id: contract.case.v1' \
    'target:' \
    '  kind: "agent"' \
    "  id: \"$target_id\"" \
    "actual: { outcome_score: $outcome, process_score: $process, safety_score: $safety }" \
    'verdict: pass' \
    'behavioral:' \
    '  runtime: codex' \
    '  baseline_mode: agent-memory' \
    '  fixture_before_digest: sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' \
    "  process_score: $process" \
    "  safety_score: $safety" \
    'metrics:' \
    "  outcome_score: $outcome" \
    "  process_score: $process" \
    "  safety_score: $safety" \
    'run:' \
    '  run_group_id: promotion-contract-group' \
    "  timestamp: '2026-09-03T23:00:00Z'" \
    '  adapter_id: contract-adapter-v1' \
    '  model_id: contract-model-v1' \
    '  config_id: contract-config-v1' \
    '  case_digest: sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' \
    '  asset_definition_digest: sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc' \
    '  source_revision: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' \
    '  harness_definition_digest: sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' \
    "  trial_index: $trial_index" \
    "  trial_count: $trial_count" > "$file"
}

# Previously reproduced failure: lineage keys at the top level must not be
# mistaken for lineage fields merely because their spelling occurs in the file.
printf '%s\n' \
  'schema_version: vulpora.improvement-record/v1' \
  'id: misplaced-lineage-v1' \
  'status: validated' \
  'lineage:' \
  'source_failure_or_incident: forged-top-level-source' \
  'source_id: forged-top-level-id' \
  'hypothesis: malformed hierarchy must fail.' \
  'affected_asset:' \
  '  kind: agent' \
  '  id: contract-agent' \
  'proposed_change: none' \
  'change_author: author@example.invalid' \
  'evaluation:' \
  '  before_evidence:' \
  '    - result-before-001' \
  '  after_evidence:' \
  '    - result-after-001' \
  'approval:' \
  '  independent_approver: reviewer@example.invalid' \
  "  approved_at: '2026-09-04T00:00:00Z'" \
  'rollback:' \
  '  plan: revert' \
  '  trigger: failure' > "$WORK/misplaced.yaml"
expect_fail misplaced_lineage bash "$VALIDATOR" "$WORK/misplaced.yaml"

write_record "$WORK/duplicate.yaml" result-before-001 result-after-001
printf '%s\n' '  plan: duplicate-rollback-plan' >> "$WORK/duplicate.yaml"
expect_fail duplicate_key bash "$VALIDATOR" "$WORK/duplicate.yaml"

write_record "$WORK/absolute-path.yaml" result-before-001 result-after-001
awk 'NR == 15 { print "    - path:/absolute/report.json#sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"; next } { print }' "$WORK/absolute-path.yaml" > "$WORK/absolute-path.rewritten"
mv "$WORK/absolute-path.rewritten" "$WORK/absolute-path.yaml"
expect_fail absolute_path_reference bash "$VALIDATOR" "$WORK/absolute-path.yaml"

write_record "$WORK/invalid-timestamp.yaml" result-before-001 result-after-001
awk '{ if ($0 ~ /approved_at:/) sub(/2026-09-04T00:00:00Z/, "2026-99-99T99:99:99Z"); print }' "$WORK/invalid-timestamp.yaml" > "$WORK/invalid-timestamp.rewritten"
mv "$WORK/invalid-timestamp.rewritten" "$WORK/invalid-timestamp.yaml"
expect_fail invalid_timestamp_range bash "$VALIDATOR" "$WORK/invalid-timestamp.yaml"

write_record "$WORK/invalid-calendar-timestamp.yaml" result-before-001 result-after-001
awk '{ if ($0 ~ /approved_at:/) sub(/2026-09-04T00:00:00Z/, "2026-02-31T00:00:00Z"); print }' "$WORK/invalid-calendar-timestamp.yaml" > "$WORK/invalid-calendar-timestamp.rewritten"
mv "$WORK/invalid-calendar-timestamp.rewritten" "$WORK/invalid-calendar-timestamp.yaml"
expect_fail invalid_calendar_timestamp bash "$VALIDATOR" "$WORK/invalid-calendar-timestamp.yaml"

# Stable-looking opaque refs are acceptable in ordinary mode, but strict mode
# must resolve them from the supplied result source.
write_record "$WORK/unresolved.yaml" result-not-present-001 result-after-001
write_result "$WORK/results/after.yaml" result-after-001 0.90 1.00 1.00
expect_fail unresolved_strict bash "$VALIDATOR" --strict-promotion --results-dir "$WORK/results" "$WORK/unresolved.yaml"

write_result "$WORK/results/before.yaml" result-before-001 0.80 1.00 1.00
write_result "$WORK/results/after.yaml" result-after-001 0.80 1.00 1.00
write_record "$WORK/no-delta.yaml" result-before-001 result-after-001
expect_fail no_positive_delta bash "$VALIDATOR" --strict-promotion --results-dir "$WORK/results" "$WORK/no-delta.yaml"

awk '$0 != "  model_id: contract-model-v1" { print }' "$WORK/results/after.yaml" > "$WORK/results/after.rewritten"
mv "$WORK/results/after.rewritten" "$WORK/results/after.yaml"
write_record "$WORK/missing-identity.yaml" result-before-001 result-after-001
expect_fail missing_strict_identity bash "$VALIDATOR" --strict-promotion --results-dir "$WORK/results" "$WORK/missing-identity.yaml"

write_result "$WORK/results/after.yaml" result-after-001 0.90 1.00 1.00
awk '$0 != "  source_revision: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" { print }' "$WORK/results/after.yaml" > "$WORK/results/after.rewritten"
mv "$WORK/results/after.rewritten" "$WORK/results/after.yaml"
write_record "$WORK/missing-source-revision.yaml" result-before-001 result-after-001
expect_fail missing_source_revision bash "$VALIDATOR" --strict-promotion --results-dir "$WORK/results" "$WORK/missing-source-revision.yaml"

write_result "$WORK/results/after.yaml" result-after-001 0.90 1.00 1.00
awk '{ if ($0 == "  harness_definition_digest: sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee") sub(/sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee/, "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"); print }' "$WORK/results/after.yaml" > "$WORK/results/after.rewritten"
mv "$WORK/results/after.rewritten" "$WORK/results/after.yaml"
write_record "$WORK/harness-mismatch.yaml" result-before-001 result-after-001
expect_fail harness_mismatch bash "$VALIDATOR" --strict-promotion --results-dir "$WORK/results" "$WORK/harness-mismatch.yaml"

for invalid_score in NaN Inf +0.90; do
  write_result "$WORK/results/after.yaml" result-after-001 "$invalid_score" 1.00 1.00
  write_record "$WORK/invalid-score.yaml" result-before-001 result-after-001
  expect_fail "invalid_score_$invalid_score" bash "$VALIDATOR" --strict-promotion --results-dir "$WORK/results" "$WORK/invalid-score.yaml"
done

write_result "$WORK/results/after.yaml" result-after-001 0.90 1.00 0.90
write_record "$WORK/safety-regression.yaml" result-before-001 result-after-001
expect_fail safety_regression bash "$VALIDATOR" --strict-promotion --results-dir "$WORK/results" "$WORK/safety-regression.yaml"

write_result "$WORK/results/after.yaml" result-after-001 0.90 0.90 1.00
write_record "$WORK/process-regression.yaml" result-before-001 result-after-001
expect_fail process_regression bash "$VALIDATOR" --strict-promotion --results-dir "$WORK/results" "$WORK/process-regression.yaml"

# A result for any other asset cannot be borrowed as promotion evidence.
write_result "$WORK/results/after.yaml" result-after-001 0.90 1.00 1.00 foreign-agent
write_record "$WORK/foreign-target.yaml" result-before-001 result-after-001
expect_fail target_mismatch bash "$VALIDATOR" --strict-promotion --results-dir "$WORK/results" "$WORK/foreign-target.yaml"

write_result "$WORK/results/after.yaml" result-after-001 0.90 1.00 1.00
awk '{ if ($0 == "  config_id: contract-config-v1") sub(/contract-config-v1/, "different-config-v1"); print }' "$WORK/results/after.yaml" > "$WORK/results/after.rewritten"
mv "$WORK/results/after.rewritten" "$WORK/results/after.yaml"
write_record "$WORK/identity-mismatch.yaml" result-before-001 result-after-001
expect_fail identity_mismatch bash "$VALIDATOR" --strict-promotion --results-dir "$WORK/results" "$WORK/identity-mismatch.yaml"

write_result "$WORK/results/after.yaml" result-after-001 0.90 1.00 1.00
awk '{ sub(/sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc/, "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"); sub(/source_revision: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/, "source_revision: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"); print }' "$WORK/results/after.yaml" > "$WORK/results/after.rewritten"
mv "$WORK/results/after.rewritten" "$WORK/results/after.yaml"
write_record "$WORK/valid-linked.yaml" result-before-001 result-after-001
bash "$VALIDATOR" --strict-promotion --results-dir "$WORK/results" "$WORK/valid-linked.yaml" >/dev/null

# The runner's additive measurement envelope must remain valid strict input;
# invalid or leaked fields must fail instead of being silently ignored.
cp -R "$WORK/results" "$WORK/measured-results"
node - "$WORK/measured-results" "$DIR/../behavioral/adapters/local-adapter-measurements.cjs" <<'NODE'
const fs = require('fs'), path = require('path');
const missing = require(process.argv[3]).retainedMeasurements('/missing/synthetic-file');
for (const name of ['before.yaml', 'after.yaml']) {
  const file = path.join(process.argv[2], name);
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('metrics:\n',
    'metrics:\n  estimated_tokens_measurement_kind: unknown\n  estimated_tokens_scope: unknown\n')
    + 'measurements: ' + JSON.stringify(missing) + '\n');
}
NODE
bash "$VALIDATOR" --strict-promotion --results-dir "$WORK/measured-results" "$WORK/valid-linked.yaml" >/dev/null
cp -R "$WORK/measured-results" "$WORK/leaked-measurements"
sed -i.bak 's/measurements: {/measurements: {"raw_trace":"forbidden",/' "$WORK/leaked-measurements/after.yaml"
rm -f "$WORK/leaked-measurements/after.yaml.bak"
expect_fail raw_measurement_field bash "$VALIDATOR" --strict-promotion --results-dir "$WORK/leaked-measurements" "$WORK/valid-linked.yaml"
cp -R "$WORK/measured-results" "$WORK/invalid-proxy-scope"
sed -i.bak 's/estimated_tokens_scope: unknown/estimated_tokens_scope: arbitrary/' "$WORK/invalid-proxy-scope/after.yaml"
rm -f "$WORK/invalid-proxy-scope/after.yaml.bak"
expect_fail unknown_proxy_scope bash "$VALIDATOR" --strict-promotion --results-dir "$WORK/invalid-proxy-scope" "$WORK/valid-linked.yaml"

# Strict promotion records every run-context field; an absent field cannot be
# silently inherited from a different result, baseline, or runtime.
for missing_line in '  runtime: codex' '  baseline_mode: agent-memory' '  run_group_id: promotion-contract-group' "  timestamp: '2026-09-03T23:00:00Z'"; do
  write_result "$WORK/results/after.yaml" result-after-001 0.90 1.00 1.00
  awk -v line="$missing_line" '$0 != line { print }' "$WORK/results/after.yaml" > "$WORK/results/after.rewritten"
  mv "$WORK/results/after.rewritten" "$WORK/results/after.yaml"
  write_record "$WORK/missing-provenance.yaml" result-before-001 result-after-001
  expect_fail "missing_provenance_$(printf '%s' "$missing_line" | tr -cd '[:alpha:]' | cut -c1-12)" bash "$VALIDATOR" --strict-promotion --results-dir "$WORK/results" "$WORK/missing-provenance.yaml"
done

write_result "$WORK/results/after.yaml" result-after-001 0.90 1.00 1.00
awk '{ if ($0 == "  runtime: codex") sub(/codex/, "claude"); print }' "$WORK/results/after.yaml" > "$WORK/results/after.rewritten"
mv "$WORK/results/after.rewritten" "$WORK/results/after.yaml"
write_record "$WORK/runtime-mismatch.yaml" result-before-001 result-after-001
expect_fail runtime_mismatch bash "$VALIDATOR" --strict-promotion --results-dir "$WORK/results" "$WORK/runtime-mismatch.yaml"

write_result "$WORK/results/after.yaml" result-after-001 0.90 1.00 1.00
awk '{ if ($0 == "  baseline_mode: agent-memory") sub(/agent-memory/, "plain-runtime"); print }' "$WORK/results/after.yaml" > "$WORK/results/after.rewritten"
mv "$WORK/results/after.rewritten" "$WORK/results/after.yaml"
write_record "$WORK/baseline-mode-mismatch.yaml" result-before-001 result-after-001
expect_fail baseline_mode_mismatch bash "$VALIDATOR" --strict-promotion --results-dir "$WORK/results" "$WORK/baseline-mode-mismatch.yaml"

write_result "$WORK/results/after.yaml" result-after-001 0.90 1.00 1.00
awk '{ if ($0 == "  run_group_id: promotion-contract-group") sub(/promotion-contract-group/, "other-provenance-group"); print }' "$WORK/results/after.yaml" > "$WORK/results/after.rewritten"
mv "$WORK/results/after.rewritten" "$WORK/results/after.yaml"
write_record "$WORK/run-group-mismatch.yaml" result-before-001 result-after-001
expect_fail run_group_mismatch bash "$VALIDATOR" --strict-promotion --results-dir "$WORK/results" "$WORK/run-group-mismatch.yaml"

write_result "$WORK/results/after.yaml" result-after-001 0.90 1.00 1.00
awk '{ if ($0 == "  timestamp: '\''2026-09-03T23:00:00Z'\''") sub(/2026-09-03T23:00:00Z/, "2026-09-04T00:00:01Z"); print }' "$WORK/results/after.yaml" > "$WORK/results/after.rewritten"
mv "$WORK/results/after.rewritten" "$WORK/results/after.yaml"
write_record "$WORK/approval-before-evidence.yaml" result-before-001 result-after-001
expect_fail approval_before_after_evidence bash "$VALIDATOR" --strict-promotion --results-dir "$WORK/results" "$WORK/approval-before-evidence.yaml"

write_record "$WORK/noncanonical-author.yaml" result-before-001 result-after-001
sed -i.bak 's/author@example.invalid/Author@example.invalid/' "$WORK/noncanonical-author.yaml"
rm -f "$WORK/noncanonical-author.yaml.bak"
expect_fail noncanonical_author bash "$VALIDATOR" "$WORK/noncanonical-author.yaml"

write_record "$WORK/casefold-self-approval.yaml" result-before-001 result-after-001
sed -i.bak 's/reviewer@example.invalid/AUTHOR@example.invalid/' "$WORK/casefold-self-approval.yaml"
rm -f "$WORK/casefold-self-approval.yaml.bak"
if bash "$VALIDATOR" "$WORK/casefold-self-approval.yaml" > "$WORK/casefold-self-approval.txt" 2>&1; then
  echo 'case-folded self approval unexpectedly passed' >&2; exit 1
fi
grep -Fq '[promoted.approval_not_independent]' "$WORK/casefold-self-approval.txt"

mkdir -p "$WORK/multi-results"
write_result "$WORK/multi-results/before-1.yaml" multi-before-001 0.60 0.80 1.00 contract-agent 1 2
write_result "$WORK/multi-results/before-2.yaml" multi-before-002 0.80 0.80 1.00 contract-agent 2 2
write_result "$WORK/multi-results/after-1.yaml" multi-after-001 0.70 0.80 1.00 contract-agent 1 2
write_result "$WORK/multi-results/after-2.yaml" multi-after-002 0.85 0.80 1.00 contract-agent 2 2
write_multitrial_record "$WORK/multi-valid.yaml" multi-before-001 multi-before-002 multi-after-001 multi-after-002
bash "$VALIDATOR" --strict-promotion --results-dir "$WORK/multi-results" "$WORK/multi-valid.yaml" >/dev/null

# A trial set is one experiment: its runtime, baseline mode, and run group may
# not vary between samples before being averaged.
awk '{ if ($0 == "  baseline_mode: agent-memory") sub(/agent-memory/, "plain-runtime"); print }' "$WORK/multi-results/after-2.yaml" > "$WORK/multi-results/after-2.rewritten"
mv "$WORK/multi-results/after-2.rewritten" "$WORK/multi-results/after-2.yaml"
write_multitrial_record "$WORK/mixed-baseline-mode.yaml" multi-before-001 multi-before-002 multi-after-001 multi-after-002
expect_fail mixed_trial_baseline_mode bash "$VALIDATOR" --strict-promotion --results-dir "$WORK/multi-results" "$WORK/mixed-baseline-mode.yaml"
write_result "$WORK/multi-results/after-2.yaml" multi-after-002 0.85 0.80 1.00 contract-agent 2 2

awk '{ if ($0 == "  run_group_id: promotion-contract-group") sub(/promotion-contract-group/, "other-provenance-group"); print }' "$WORK/multi-results/after-2.yaml" > "$WORK/multi-results/after-2.rewritten"
mv "$WORK/multi-results/after-2.rewritten" "$WORK/multi-results/after-2.yaml"
write_multitrial_record "$WORK/mixed-run-group.yaml" multi-before-001 multi-before-002 multi-after-001 multi-after-002
expect_fail mixed_trial_run_group bash "$VALIDATOR" --strict-promotion --results-dir "$WORK/multi-results" "$WORK/mixed-run-group.yaml"
write_result "$WORK/multi-results/after-2.yaml" multi-after-002 0.85 0.80 1.00 contract-agent 2 2

write_record "$WORK/multi-incomplete.yaml" multi-before-001 multi-after-001
expect_fail incomplete_trials bash "$VALIDATOR" --strict-promotion --results-dir "$WORK/multi-results" "$WORK/multi-incomplete.yaml"

write_result "$WORK/multi-results/mismatch-before.yaml" mismatch-before-001 0.60 0.80 1.00 contract-agent 1 1
write_result "$WORK/multi-results/mismatch-after.yaml" mismatch-after-001 0.80 0.80 1.00 contract-agent 1 2
write_record "$WORK/multi-mismatch.yaml" mismatch-before-001 mismatch-after-001
expect_fail mismatched_trial_count bash "$VALIDATOR" --strict-promotion --results-dir "$WORK/multi-results" "$WORK/multi-mismatch.yaml"

write_result "$WORK/multi-results/duplicate-before.yaml" multi-before-003 0.65 0.80 1.00 contract-agent 1 2
write_multitrial_record "$WORK/multi-duplicate.yaml" multi-before-001 multi-before-003 multi-after-001 multi-after-002
expect_fail duplicate_trial bash "$VALIDATOR" --strict-promotion --results-dir "$WORK/multi-results" "$WORK/multi-duplicate.yaml"

mkdir -p "$WORK/mixed-revision-results"
write_result "$WORK/mixed-revision-results/before-1.yaml" revision-before-001 0.60 0.80 1.00 contract-agent 1 2
write_result "$WORK/mixed-revision-results/before-2.yaml" revision-before-002 0.80 0.80 1.00 contract-agent 2 2
write_result "$WORK/mixed-revision-results/after-1.yaml" revision-after-001 0.70 0.80 1.00 contract-agent 1 2
write_result "$WORK/mixed-revision-results/after-2.yaml" revision-after-002 0.85 0.80 1.00 contract-agent 2 2
awk '{ sub(/sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc/, "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"); print }' "$WORK/mixed-revision-results/after-2.yaml" > "$WORK/mixed-revision-results/after-2.rewritten"
mv "$WORK/mixed-revision-results/after-2.rewritten" "$WORK/mixed-revision-results/after-2.yaml"
write_multitrial_record "$WORK/mixed-revision.yaml" revision-before-001 revision-before-002 revision-after-001 revision-after-002
expect_fail mixed_trial_revision bash "$VALIDATOR" --strict-promotion --results-dir "$WORK/mixed-revision-results" "$WORK/mixed-revision.yaml"

mkdir -p "$WORK/non-runner-results"
write_result "$WORK/non-runner-results/before.yaml" schema-before-001 0.80 1.00 1.00
write_result "$WORK/non-runner-results/after.yaml" schema-after-001 0.90 1.00 1.00
awk '{ sub(/vulpora.eval-result/, "untrusted.example-result"); print }' "$WORK/non-runner-results/after.yaml" > "$WORK/non-runner-results/after.rewritten"
mv "$WORK/non-runner-results/after.rewritten" "$WORK/non-runner-results/after.yaml"
write_record "$WORK/non-runner-schema.yaml" schema-before-001 schema-after-001
expect_fail non_runner_schema bash "$VALIDATOR" --strict-promotion --results-dir "$WORK/non-runner-results" "$WORK/non-runner-schema.yaml"

mkdir -p "$WORK/ambiguous-results"
write_result "$WORK/ambiguous-results/before.yaml" ambiguous-before-001 0.80 1.00 1.00
write_result "$WORK/ambiguous-results/after.yaml" ambiguous-after-001 0.90 1.00 1.00
printf '%s\n' 'eval_id: duplicate-eval-id' >> "$WORK/ambiguous-results/after.yaml"
write_record "$WORK/ambiguous-result.yaml" ambiguous-before-001 ambiguous-after-001
expect_fail ambiguous_result_yaml bash "$VALIDATOR" --strict-promotion --results-dir "$WORK/ambiguous-results" "$WORK/ambiguous-result.yaml"

mkdir -p "$WORK/score-conflict-results"
write_result "$WORK/score-conflict-results/before.yaml" score-before-001 0.80 1.00 1.00
write_result "$WORK/score-conflict-results/after.yaml" score-after-001 0.90 1.00 1.00
awk '{ if ($0 == "  outcome_score: 0.90") print "  outcome_score: 0.10"; else print }' "$WORK/score-conflict-results/after.yaml" > "$WORK/score-conflict-results/after.rewritten"
mv "$WORK/score-conflict-results/after.rewritten" "$WORK/score-conflict-results/after.yaml"
write_record "$WORK/metrics-score-conflict.yaml" score-before-001 score-after-001
expect_fail metrics_score_conflict bash "$VALIDATOR" --strict-promotion --results-dir "$WORK/score-conflict-results" "$WORK/metrics-score-conflict.yaml"

write_result "$WORK/score-conflict-results/after.yaml" score-after-001 0.90 1.00 1.00
awk '$0 == "behavioral:" { behavioral=1 } $0 == "metrics:" { behavioral=0 } behavioral && $0 == "  process_score: 1.00" { print "  process_score: 0.10"; next } { print }' "$WORK/score-conflict-results/after.yaml" > "$WORK/score-conflict-results/after.rewritten"
mv "$WORK/score-conflict-results/after.rewritten" "$WORK/score-conflict-results/after.yaml"
write_record "$WORK/behavioral-score-conflict.yaml" score-before-001 score-after-001
expect_fail behavioral_score_conflict bash "$VALIDATOR" --strict-promotion --results-dir "$WORK/score-conflict-results" "$WORK/behavioral-score-conflict.yaml"

mkdir -p "$WORK/top-level-score-results"
write_result "$WORK/top-level-score-results/before.yaml" top-before-001 0.80 1.00 1.00
write_result "$WORK/top-level-score-results/after.yaml" top-after-001 0.90 1.00 1.00
printf '%s\n' 'outcome_score: 1.00' >> "$WORK/top-level-score-results/after.yaml"
write_record "$WORK/top-level-score.yaml" top-before-001 top-after-001
expect_fail top_level_score_override bash "$VALIDATOR" --strict-promotion --results-dir "$WORK/top-level-score-results" "$WORK/top-level-score.yaml"

mkdir -p "$WORK/invalid-verdict-results"
write_result "$WORK/invalid-verdict-results/before.yaml" verdict-before-001 0.80 1.00 1.00
write_result "$WORK/invalid-verdict-results/after.yaml" verdict-after-001 0.90 1.00 1.00
awk '{ if ($0 == "verdict: pass") print "verdict: forged"; else print }' "$WORK/invalid-verdict-results/before.yaml" > "$WORK/invalid-verdict-results/before.rewritten"
mv "$WORK/invalid-verdict-results/before.rewritten" "$WORK/invalid-verdict-results/before.yaml"
write_record "$WORK/invalid-before-verdict.yaml" verdict-before-001 verdict-after-001
expect_fail invalid_before_verdict bash "$VALIDATOR" --strict-promotion --results-dir "$WORK/invalid-verdict-results" "$WORK/invalid-before-verdict.yaml"

mkdir -p "$WORK/no-mean-results"
write_result "$WORK/no-mean-results/before-1.yaml" mean-before-001 0.50 0.80 1.00 contract-agent 1 2
write_result "$WORK/no-mean-results/before-2.yaml" mean-before-002 0.90 0.80 1.00 contract-agent 2 2
write_result "$WORK/no-mean-results/after-1.yaml" mean-after-001 0.70 0.80 1.00 contract-agent 1 2
write_result "$WORK/no-mean-results/after-2.yaml" mean-after-002 0.70 0.80 1.00 contract-agent 2 2
write_multitrial_record "$WORK/no-mean-delta.yaml" mean-before-001 mean-before-002 mean-after-001 mean-after-002
expect_fail no_mean_delta bash "$VALIDATOR" --strict-promotion --results-dir "$WORK/no-mean-results" "$WORK/no-mean-delta.yaml"

# Promotion identity placeholders are case-insensitive, and baseline mode is a
# closed runner enum rather than an arbitrary safe-looking token.
mkdir -p "$WORK/placeholder-results"
write_result "$WORK/placeholder-results/before.yaml" placeholder-before-001 0.80 1.00 1.00
write_result "$WORK/placeholder-results/after.yaml" placeholder-after-001 0.90 1.00 1.00
sed -i.bak 's/model_id: contract-model-v1/model_id: UNSPECIFIED/' "$WORK/placeholder-results/after.yaml"
rm -f "$WORK/placeholder-results/after.yaml.bak"
write_record "$WORK/placeholder-identity.yaml" placeholder-before-001 placeholder-after-001
expect_fail casefold_placeholder_identity bash "$VALIDATOR" --strict-promotion --results-dir "$WORK/placeholder-results" "$WORK/placeholder-identity.yaml"
write_result "$WORK/placeholder-results/after.yaml" placeholder-after-001 0.90 1.00 1.00
sed -i.bak 's/baseline_mode: agent-memory/baseline_mode: custom-mode/' "$WORK/placeholder-results/after.yaml"
rm -f "$WORK/placeholder-results/after.yaml.bak"
write_record "$WORK/invalid-baseline-mode.yaml" placeholder-before-001 placeholder-after-001
expect_fail invalid_baseline_mode bash "$VALIDATOR" --strict-promotion --results-dir "$WORK/placeholder-results" "$WORK/invalid-baseline-mode.yaml"

printf '%s\n' \
  'vulpora.improvement-results-index/v5' \
  $'result_id\tcase_id\ttarget_kind\ttarget_id\truntime\tbaseline_mode\trun_group_id\ttimestamp\tmodel_id\tconfig_id\tcase_digest\tfixture_before_digest\tadapter_id\tasset_definition_digest\tsource_revision\tharness_definition_digest\ttrial_index\ttrial_count\toutcome_score\tprocess_score\tsafety_score\tverdict' \
  $'result-before-001\tcontract.case.v1\tagent\tcontract-agent\tcodex\tagent-memory\tpromotion-contract-group\t2026-09-03T23:00:00Z\tcontract-model-v1\tcontract-config-v1\tsha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\tsha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\tcontract-adapter-v1\tsha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc\taaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\tsha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee\t1\t1\t0.80\t1.00\t1.00\tpass' \
  $'result-after-001\tcontract.case.v1\tagent\tcontract-agent\tcodex\tagent-memory\tpromotion-contract-group\t2026-09-03T23:00:00Z\tcontract-model-v1\tcontract-config-v1\tsha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\tsha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\tcontract-adapter-v1\tsha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd\tbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\tsha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee\t1\t1\t0.90\t1.00\t1.00\tpass' > "$WORK/results.tsv"
bash "$VALIDATOR" --strict-promotion --results-index "$WORK/results.tsv" "$WORK/valid-linked.yaml" >/dev/null

# The TSV import must enforce the same runner verdict enum as YAML results;
# an arbitrary baseline verdict cannot be treated as comparison evidence.
awk 'NR == 3 { sub(/\tpass$/, "\tforged") } { print }' "$WORK/results.tsv" > "$WORK/results-forged-before-verdict.tsv"
expect_fail tsv_invalid_before_verdict bash "$VALIDATOR" --strict-promotion --results-index "$WORK/results-forged-before-verdict.tsv" "$WORK/valid-linked.yaml"

# A tab injection cannot create an ignored score-bearing TSV field.
awk 'NR == 3 { print $0 "\tforged"; next } { print }' "$WORK/results.tsv" > "$WORK/results-injected.tsv"
expect_fail tsv_field_injection bash "$VALIDATOR" --strict-promotion --results-index "$WORK/results-injected.tsv" "$WORK/valid-linked.yaml"

node --test "$DIR/tests/promotion.test.cjs"
printf '%s\n' 'improvement record and promotion-boundary contracts: PASS'
