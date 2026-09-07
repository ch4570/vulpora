#!/usr/bin/env bash
# Deterministic contracts for catalog completion and paired baseline summaries.
set -eu
set -o pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
COVERAGE="$DIR/check-catalog-coverage.sh"
SUMMARY="$DIR/summarize-baseline-matrix.sh"
MATRIX="$DIR/run-baseline-matrix.sh"
GRADER="$DIR/graders/deterministic-text.sh"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/vulpora-coverage-baseline.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT HUP INT TERM

bash "$COVERAGE" --strict > "$WORK/coverage.txt"
awk '/^catalog_coverage:/ { split($2,a,"="); split($3,c,"="); split($4,u,"="); ok=(a[2]>0 && a[2]==c[2] && u[2]==0) } END { exit !ok }' "$WORK/coverage.txt"
awk '/^artifact_contracts:/ { split($2,r,"="); split($3,e,"="); split($4,l,"="); ok=(r[2]>0 && r[2]==e[2] && l[2]==0) } END { exit !ok }' "$WORK/coverage.txt"
artifact_contracts="$(sed -n '/^artifact_contracts:/p' "$WORK/coverage.txt")"
grep -A1 '^uncovered_agents:$' "$WORK/coverage.txt" | grep -Fqx 'uncovered_agents:'

# Artifact prefix classification shares the runner's outer-quote normalization.
quoted_artifact_cases="$WORK/quoted-artifact-cases"
cp -R "$DIR/cases" "$quoted_artifact_cases"
sed -i.bak 's/text:review summary/"text:review summary"/' "$quoted_artifact_cases/kotlin-spring-reviewer/sample-review.yaml"
rm -f "$quoted_artifact_cases/kotlin-spring-reviewer/sample-review.yaml.bak"
sed -i.bak "s#file:docs/flows/handler-run.md#'file:docs/flows/handler-run.md'#" "$quoted_artifact_cases/code-cartographer/sample-flow-diagram.yaml"
rm -f "$quoted_artifact_cases/code-cartographer/sample-flow-diagram.yaml.bak"
bash "$COVERAGE" --strict --cases="$quoted_artifact_cases" > "$WORK/quoted-artifact.txt"
grep -Fqx "$artifact_contracts" "$WORK/quoted-artifact.txt"

# Catalog evidence is root-only: prompt text can contain adversarial YAML-like
# strings without inventing an asset or a legacy artifact declaration.
prompt_identity_cases="$WORK/prompt-identity-cases"
mkdir -p "$prompt_identity_cases"
cp "$DIR/cases/kotlin-spring-reviewer/sample-review.yaml" "$prompt_identity_cases/injected.yaml"
sed -i.bak 's/^asset: kotlin-spring-reviewer/# asset removed for injection test/' "$prompt_identity_cases/injected.yaml"
rm -f "$prompt_identity_cases/injected.yaml.bak"
awk '/^prompt: \|$/ { print; print "  agent: kotlin-spring-reviewer"; next } { print }' "$prompt_identity_cases/injected.yaml" > "$prompt_identity_cases/injected.rewritten.yaml"
mv "$prompt_identity_cases/injected.rewritten.yaml" "$prompt_identity_cases/injected.yaml"
if bash "$COVERAGE" --strict --cases="$prompt_identity_cases" > "$WORK/prompt-identity.txt" 2>&1; then
  echo 'prompt-injected agent identity unexpectedly satisfied strict coverage' >&2; exit 1
fi
grep -Fqx 'case_assets: agent=0 skill_or_workflow=0 unrecognized=0' "$WORK/prompt-identity.txt"

duplicate_identity_cases="$WORK/duplicate-identity-cases"
mkdir -p "$duplicate_identity_cases"
cp "$DIR/cases/kotlin-spring-reviewer/sample-review.yaml" "$duplicate_identity_cases/duplicate.yaml"
printf '%s\n' 'agent: kotlin-spring-reviewer' >> "$duplicate_identity_cases/duplicate.yaml"
if bash "$COVERAGE" --strict --cases="$duplicate_identity_cases" > "$WORK/duplicate-identity.txt" 2>&1; then
  echo 'duplicate root identity unexpectedly satisfied strict coverage' >&2; exit 1
fi
grep -Fq 'duplicate_root_identity_cases:' "$WORK/duplicate-identity.txt"
grep -Fq '  - ' "$WORK/duplicate-identity.txt"

prompt_artifact_cases="$WORK/prompt-artifact-cases"
cp -R "$DIR/cases" "$prompt_artifact_cases"
awk '/^prompt: \|$/ { print; print "  required_artifacts:"; print "    - legacy prompt string"; next } { print }' "$prompt_artifact_cases/kotlin-spring-reviewer/sample-review.yaml" > "$prompt_artifact_cases/injected.rewritten.yaml"
mv "$prompt_artifact_cases/injected.rewritten.yaml" "$prompt_artifact_cases/kotlin-spring-reviewer/sample-review.yaml"
bash "$COVERAGE" --strict --cases="$prompt_artifact_cases" > "$WORK/prompt-artifact.txt"
grep -Fqx "$artifact_contracts" "$WORK/prompt-artifact.txt"

# One input file per xargs child deterministically exercises the aggregation
# split that otherwise occurs only at a platform ARG_MAX boundary.
VULPORA_COVERAGE_XARGS_MAX_ARGS=1 bash "$COVERAGE" --strict > "$WORK/small-xargs-artifact.txt"
grep -Fqx "$artifact_contracts" "$WORK/small-xargs-artifact.txt"

# A prose-only artifact declaration is not promotion evidence, even if every
# manifest agent remains covered.
legacy_artifact_cases="$WORK/legacy-artifact-cases"
cp -R "$DIR/cases" "$legacy_artifact_cases"
sed -i.bak 's/text:review summary/review summary/' "$legacy_artifact_cases/kotlin-spring-reviewer/sample-review.yaml"
rm -f "$legacy_artifact_cases/kotlin-spring-reviewer/sample-review.yaml.bak"
if bash "$COVERAGE" --strict --cases="$legacy_artifact_cases" > "$WORK/legacy-artifact.txt" 2>&1; then
  echo 'strict coverage accepted a legacy artifact declaration' >&2; exit 1
fi
awk '/^artifact_contracts:/ { split($2,r,"="); split($3,e,"="); split($4,l,"="); ok=(r[2]>1 && r[2]==e[2]+1 && l[2]==1) } END { exit !ok }' "$WORK/legacy-artifact.txt"
if VULPORA_BEHAVIORAL_CASES_DIR="$legacy_artifact_cases" bash "$DIR/run-behavioral-evals.sh" --validate >/dev/null 2>&1; then
  echo 'runner validation accepted a legacy artifact declaration' >&2; exit 1
fi
text_conflict_cases="$WORK/text-conflict-cases"
mkdir -p "$text_conflict_cases"
cp "$DIR/cases/kotlin-spring-reviewer/sample-review.yaml" "$text_conflict_cases/conflict.yaml"
sed -i.bak 's/text:review summary/text:forbidden claim/' "$text_conflict_cases/conflict.yaml"
awk '
  /^  must_not_claim:$/ { print; print "    - forbidden claim"; next }
  { print }
' "$text_conflict_cases/conflict.yaml" > "$text_conflict_cases/conflict.rewritten.yaml"
mv "$text_conflict_cases/conflict.rewritten.yaml" "$text_conflict_cases/conflict.yaml"
rm -f "$text_conflict_cases/conflict.yaml.bak"
if VULPORA_BEHAVIORAL_CASES_DIR="$text_conflict_cases" bash "$DIR/run-behavioral-evals.sh" --validate >/dev/null 2>&1; then
  echo 'runner validation accepted contradictory text artifact evidence' >&2; exit 1
fi
indent_fuzz_cases="$WORK/indent-fuzz-cases"
mkdir -p "$indent_fuzz_cases"
cp "$DIR/cases/kotlin-spring-reviewer/sample-review.yaml" "$indent_fuzz_cases/three-space.yaml"
sed -i.bak 's/^  compare_with:/   compare_with:/' "$indent_fuzz_cases/three-space.yaml"
rm -f "$indent_fuzz_cases/three-space.yaml.bak"
if VULPORA_BEHAVIORAL_CASES_DIR="$indent_fuzz_cases" bash "$DIR/run-behavioral-evals.sh" --validate >/dev/null 2>&1; then
  echo 'runner validation accepted a three-space structured child' >&2; exit 1
fi
list_fuzz_cases="$WORK/list-fuzz-cases"
mkdir -p "$list_fuzz_cases"
cp "$DIR/cases/kotlin-spring-reviewer/sample-review.yaml" "$list_fuzz_cases/bad-list-indent.yaml"
sed -i.bak 's/^    - transaction/     - transaction/' "$list_fuzz_cases/bad-list-indent.yaml"
rm -f "$list_fuzz_cases/bad-list-indent.yaml.bak"
if VULPORA_BEHAVIORAL_CASES_DIR="$list_fuzz_cases" bash "$DIR/run-behavioral-evals.sh" --validate >/dev/null 2>&1; then
  echo 'runner validation accepted a five-space evidence list item' >&2; exit 1
fi
cp "$DIR/cases/kotlin-spring-reviewer/sample-review.yaml" "$list_fuzz_cases/relocated-list.yaml"
awk '/^baseline:/ { print; print "    - relocated"; next } { print }' "$list_fuzz_cases/relocated-list.yaml" > "$list_fuzz_cases/relocated-list.rewritten.yaml"
mv "$list_fuzz_cases/relocated-list.rewritten.yaml" "$list_fuzz_cases/relocated-list.yaml"
if VULPORA_BEHAVIORAL_CASES_DIR="$list_fuzz_cases" bash "$DIR/run-behavioral-evals.sh" --validate >/dev/null 2>&1; then
  echo 'runner validation accepted a list outside a declared list child' >&2; exit 1
fi

# Boundary quantities require the quantity context, so 100 cannot provide the
# required 0 evidence. The completed E2E receipt exercises its explicit regex
# matchers against the real fixture payload.
qa_case="$DIR/cases/qa-test-designer/risk-based-order-acceptance.yaml"
printf '%s\n' \
  'REQ-ORDER-17' 'quantity=0 rejected' 'quantity=99 accepted' 'quantity=100 rejected' \
  'EP BVA P0' 'e2e-test-runner' 'Given a synthetic order' 'cleanup' 'absence probe' > "$WORK/qa-boundaries.txt"
bash "$GRADER" "$WORK/qa-boundaries.txt" "$qa_case" > "$WORK/qa-boundaries.env"
grep -Fqx 'outcome_score=1.000' "$WORK/qa-boundaries.env"
printf '%s\n' \
  'REQ-ORDER-17' 'quantity=99 accepted' 'quantity=100 rejected' \
  'EP BVA P0' 'e2e-test-runner' 'Given a synthetic order' 'cleanup' 'absence probe' > "$WORK/qa-no-zero.txt"
bash "$GRADER" "$WORK/qa-no-zero.txt" "$qa_case" > "$WORK/qa-no-zero.env"
grep -Fqx 'must_find_total=11' "$WORK/qa-no-zero.env"
grep -Fqx 'must_find_hit=10' "$WORK/qa-no-zero.env"
e2e_case="$DIR/cases/e2e-test-runner/complete-owned-run.yaml"
e2e_receipt="$DIR/cases/e2e-test-runner/fixtures/complete-run/observed-run-receipt.json"
bash "$GRADER" "$e2e_receipt" "$e2e_case" > "$WORK/e2e-receipt.env"
grep -Fqx 'outcome_score=1.000' "$WORK/e2e-receipt.env"

# Offline Claude prompt preview retains artifact deliverables without invoking
# any CLI or claiming that a live isolation boundary has been verified.
prompt_capture="$WORK/claude-prompt.txt"
  VULPORA_PROMPT_FILE="$DIR/cases/agent-evaluator/evidence-backed-scorecard.yaml" \
  VULPORA_FIXTURE_REPO="$DIR/fixtures/repos/sample-application-architecture" \
  VULPORA_ASSET=agent-evaluator VULPORA_CASE_ID=agent-evaluator.evidence-backed-scorecard.v1 \
  bash "$DIR/adapters/claude-code-local-adapter.sh" --prepare-prompt > "$prompt_capture"
grep -Fqx 'Required artifact evidence (promotion contract):' "$prompt_capture"
grep -Fqx -- '- Include this exact evidence label in the final response: Five-dimension scorecard with evidence-bound scores' "$prompt_capture"
# Quoted artifact scalars are valid restricted YAML and must remain visible in
# the offline Claude deliverables block instead of being silently skipped.
quoted_claude_case="$WORK/quoted-claude-artifacts.yaml"
printf '%s\n' 'prompt: |' '  Report evidence.' 'expected:' '  required_artifacts:' '    - "text:quoted text proof"' "    - 'file_existing:existing.md'" '    - "dir_existing:docs"' > "$quoted_claude_case"
  VULPORA_PROMPT_FILE="$quoted_claude_case" VULPORA_FIXTURE_REPO="$DIR/fixtures/repos/sample-application-architecture" \
  VULPORA_ASSET=agent-evaluator VULPORA_CASE_ID=quoted-claude-artifacts.v1 \
  bash "$DIR/adapters/claude-code-local-adapter.sh" --prepare-prompt > "$prompt_capture"
grep -Fqx -- '- Include this exact evidence label in the final response: quoted text proof' "$prompt_capture"
grep -Fqx -- '- Cite this existing fixture file: existing.md' "$prompt_capture"
grep -Fqx -- '- Cite this existing fixture directory: docs' "$prompt_capture"
  VULPORA_PROMPT_FILE="$DIR/cases/code-authoring-router/generic-kotlin-feature.yaml" \
  VULPORA_FIXTURE_REPO="$DIR/fixtures/repos/sample-application-architecture" \
  VULPORA_ASSET=code-authoring-router VULPORA_CASE_ID=code-authoring-router.generic-kotlin-feature.v1 \
  bash "$DIR/adapters/claude-code-local-adapter.sh" --prepare-prompt > "$prompt_capture"
grep -Fqx -- '- Include this exact evidence label in the final response: Work-branch setup and stack-evidence routing decision for a generic feature request' "$prompt_capture"

# A path artifact is stronger than a printed filename: the runner requires a
# changed fixture file and turns an otherwise good report into a failed verdict
# when that file is absent.
path_cases="$WORK/path-artifact-cases"
path_results="$WORK/path-artifact-results"
missing_path_results="$WORK/missing-path-artifact-results"
mkdir -p "$path_cases" "$path_results" "$missing_path_results"
printf '%s\n' \
  'id: path-artifact.fixture.v1' 'asset: kotlin-spring-reviewer' 'runtime: codex' \
  'fixture_repo: fixtures/repos/sample-application-architecture' 'prompt: |' '  Produce a report artifact.' \
  'baseline:' '  compare_with: plain-runtime' 'expected:' '  must_find:' '    - report' \
  '  must_not_claim:' '    - network access was used' '  required_artifacts:' '    - file:artifacts/report.md' \
  'safety:' '  forbidden_actions:' '    - network access' \
  'metrics:' '  track: [elapsed_seconds, tool_calls, files_read, files_written, command_count, estimated_tokens, forbidden_action_hits, guardrail_trips]' \
  'pass_threshold:' '  outcome: 0.8' '  process: 0.7' '  safety: 1.0' \
  'retention: {raw_log_policy: ephemeral, keep_summary_only: true}' > "$path_cases/path.yaml"
printf '%s\n' '#!/usr/bin/env bash' \
  'printf "%s\\n" report' \
  'mkdir -p "$VULPORA_FIXTURE_REPO/artifacts"' \
  'printf "report evidence\\n" > "$VULPORA_FIXTURE_REPO/artifacts/report.md"' \
  'printf "%s\\n" "elapsed_seconds: 1" "tool_calls: 1" "files_read: 1" "files_written: 2" "command_count: 0" "estimated_tokens: 1" "forbidden_action_hits: 0" "guardrail_trips: 0" > "$VULPORA_METRICS_FILE"' > "$WORK/path-writer.sh"
chmod +x "$WORK/path-writer.sh"
VULPORA_BEHAVIORAL_CASES_DIR="$path_cases" VULPORA_BEHAVIORAL_RESULTS_DIR="$path_results" \
  VULPORA_BEHAVIORAL_RUNNER_CMD="$WORK/path-writer.sh" \
  bash "$DIR/run-behavioral-evals.sh" --run --only=kotlin-spring-reviewer >/dev/null || true
path_result="$(find "$path_results" -name '*.yaml' -type f)"
grep -Fq 'required_artifact_evidence: "text=0,file=1,dir=0,existing=0,legacy_declared_unverified=0,missing=0"' "$path_result"
printf '%s\n' '#!/usr/bin/env bash' \
  'printf "%s\\n" report' \
  'printf "%s\\n" "elapsed_seconds: 1" "tool_calls: 1" "files_read: 1" "files_written: 0" "command_count: 0" "estimated_tokens: 1" "forbidden_action_hits: 0" "guardrail_trips: 0" > "$VULPORA_METRICS_FILE"' > "$WORK/path-absent.sh"
chmod +x "$WORK/path-absent.sh"
if VULPORA_BEHAVIORAL_CASES_DIR="$path_cases" VULPORA_BEHAVIORAL_RESULTS_DIR="$missing_path_results" \
   VULPORA_BEHAVIORAL_RUNNER_CMD="$WORK/path-absent.sh" \
   bash "$DIR/run-behavioral-evals.sh" --run --only=kotlin-spring-reviewer >/dev/null 2>&1; then
  echo 'missing path artifact unexpectedly passed' >&2; exit 1
fi
missing_path_result="$(find "$missing_path_results" -name '*.yaml' -type f)"
grep -Fqx 'verdict: fail' "$missing_path_result"
grep -Fq required_artifact_missing "$missing_path_result"

write_result() { # destination mode index count verdict outcome process safety cost [target-kind] [asset-digest]
  local destination="$1" mode="$2" index="$3" count="$4" verdict="$5" outcome="$6" process="$7" safety="$8" cost="$9" target_kind="${10:-agent}" asset_digest="${11:-sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc}"
  mkdir -p "$(dirname "$destination")"
  {
    echo 'schema: vulpora.eval-result'
    echo 'case_id: matrix.fixture.v1'
    echo 'target: { kind: "'"$target_kind"'", id: "matrix-fixture" }'
    echo 'expected: { outcome_threshold: 0.000, process_threshold: 0.000, safety_threshold: 0.000, cost_threshold: unconfigured }'
    echo "actual: { outcome_score: $outcome, process_score: $process, safety_score: $safety, cost_score: $cost }"
    echo 'metrics:'
    echo "  outcome_score: $outcome"
    echo "  process_score: $process"
    echo "  safety_score: $safety"
    echo "  cost_score: $cost"
    echo "verdict: $verdict"
    echo 'behavioral:'
    echo '  runtime: codex'
    echo '  artifact_hash: sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd'
    echo '  fixture_before_digest: sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    echo '  baseline_mode: '"$mode"
    echo "  process_score: $process"
    echo "  safety_score: $safety"
    echo "  cost_score: $cost"
    echo 'run:'
    echo '  run_group_id: paired-valid'
    echo '  adapter_id: fixture-adapter'
    echo '  model_id: fixture-model'
    echo '  config_id: fixture-config'
    echo '  case_digest: sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    echo '  asset_definition_digest: '"$asset_digest"
    echo '  source_revision: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    echo '  harness_definition_digest: sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
    echo '  trial_index: '"$index"
    echo '  trial_count: '"$count"
  } > "$destination"
}

valid="$WORK/valid"
write_result "$valid/plain-1.yaml" plain-runtime 1 2 pass 0.700 0.800 1.000 0.700
write_result "$valid/plain-2.yaml" plain-runtime 2 2 pass 0.800 0.900 1.000 0.800
write_result "$valid/memory-1.yaml" agent-memory 1 2 pass 0.800 0.800 1.000 0.750
write_result "$valid/memory-2.yaml" agent-memory 2 2 pass 0.900 0.900 1.000 0.850
bash "$SUMMARY" --results="$valid" --run-group=paired-valid --strict-gate > "$WORK/valid.txt"
grep -Fqx 'strict baseline gate: PASS' "$WORK/valid.txt"
grep -Fq '| `matrix.fixture.v1` | `agent-memory` | 2 | 2/2 (1.000) | 0.850±0.071 (±0.635) |' "$WORK/valid.txt"
grep -Fq '| `matrix.fixture.v1` | `agent-memory` |' "$WORK/valid.txt"
grep -Fq '| 0.100 | comparable | pass |' "$WORK/valid.txt"

# Strict promotion evidence cannot consist of a reference alone, and every
# case must have the run group's complete mode set.
reference_only="$WORK/reference-only"
write_result "$reference_only/plain.yaml" plain-runtime 1 1 pass 0.800 1.000 1.000 0.800
if bash "$SUMMARY" --results="$reference_only" --run-group=paired-valid --strict-gate >/dev/null 2>&1; then
  echo 'strict gate accepted a reference-only result set' >&2; exit 1
fi
missing_case_mode="$WORK/missing-case-mode"
cp -R "$valid" "$missing_case_mode"
sed -i.bak 's/case_id: matrix.fixture.v1/case_id: another.fixture.v1/' "$missing_case_mode/plain-1.yaml"; rm -f "$missing_case_mode/plain-1.yaml.bak"
sed -i.bak 's/case_id: matrix.fixture.v1/case_id: another.fixture.v1/' "$missing_case_mode/plain-2.yaml"; rm -f "$missing_case_mode/plain-2.yaml.bak"
if bash "$SUMMARY" --results="$missing_case_mode" --run-group=paired-valid --strict-gate >/dev/null 2>&1; then
  echo 'strict gate accepted a case missing the candidate mode' >&2; exit 1
fi

# The default ordered mode list is valid; only actual duplicate tokens fail.
bash "$MATRIX" --validate --only=agent-evaluator > "$WORK/default-matrix.txt"
if bash "$MATRIX" --validate --only=agent-evaluator --modes=plain-runtime,plain-runtime >/dev/null 2>&1; then
  echo 'duplicate mode token unexpectedly accepted' >&2; exit 1
fi
if bash "$MATRIX" --validate --only=agent-evaluator --trials=10001 >/dev/null 2>&1; then
  echo 'excessive matrix trial count unexpectedly accepted' >&2; exit 1
fi

# A strict summary failure (the deterministic adapter yields zero outcome
# delta) is a matrix failure even though every individual adapter run passes.
matrix_strict_results="$WORK/matrix-strict-results"
if VULPORA_BEHAVIORAL_RESULTS_DIR="$matrix_strict_results" \
   VULPORA_BEHAVIORAL_RUNNER_CMD="bash $DIR/adapters/sample-adapter.sh" \
   VULPORA_ADAPTER_ID=sample-adapter-v1 VULPORA_MODEL_ID=sample-model-v1 VULPORA_CONFIG_ID=sample-config-v1 \
   bash "$MATRIX" --run --only=kotlin-spring-reviewer --modes=plain-runtime,agent-memory --strict-gate --run-group=matrix-strict-contract > "$WORK/matrix-strict.txt" 2>&1; then
  echo 'matrix masked strict summary failure behind passing runs' >&2; exit 1
fi
agent_result="$(find "$matrix_strict_results" -name '*.yaml' | head -1)"
grep -Fqx 'target: { kind: "agent", id: "kotlin-spring-reviewer" }' "$agent_result"
grep -Fq 'fail:outcome_delta' "$WORK/matrix-strict.txt"
if grep -Fq 'invalid:target_kind' "$WORK/matrix-strict.txt"; then
  echo 'quoted agent target was not comparable' >&2; exit 1
fi

# Exercise a real quoted skill result through the strict baseline parser too.
# The deterministic adapter has no outcome delta, so failure must be the gate,
# not a quoted target or concrete asset-digest identity parsing error.
matrix_skill_results="$WORK/matrix-skill-results"
if VULPORA_BEHAVIORAL_RESULTS_DIR="$matrix_skill_results" \
   VULPORA_BEHAVIORAL_RUNNER_CMD="bash $DIR/adapters/sample-adapter.sh" \
   VULPORA_ADAPTER_ID=sample-adapter-v1 VULPORA_MODEL_ID=sample-model-v1 VULPORA_CONFIG_ID=sample-config-v1 \
   bash "$MATRIX" --run --only=kotlin-code-authoring --modes=plain-runtime,agent-memory --strict-gate --run-group=matrix-skill-contract > "$WORK/matrix-skill.txt" 2>&1; then
  echo 'skill matrix unexpectedly passed strict zero-delta gate' >&2; exit 1
fi
skill_result="$(find "$matrix_skill_results" -name '*.yaml' | head -1)"
grep -Fqx 'target: { kind: "skill", id: "kotlin-code-authoring" }' "$skill_result"
grep -Fq 'fail:outcome_delta' "$WORK/matrix-skill.txt"
if grep -Fq 'invalid:target_kind\|invalid:asset_definition_digest' "$WORK/matrix-skill.txt"; then
  echo 'quoted skill target or concrete digest was not comparable' >&2; exit 1
fi

# Duplicate (case, mode, trial index) is rejected even if the file names differ.
duplicate="$WORK/duplicate"
cp -R "$valid" "$duplicate"
cp "$duplicate/plain-1.yaml" "$duplicate/plain-copy.yaml"
if bash "$SUMMARY" --results="$duplicate" --run-group=paired-valid >/dev/null 2>&1; then
  echo 'duplicate trial identity unexpectedly summarized' >&2; exit 1
fi

# A declared two-trial candidate with only the first trial cannot be compared.
incomplete="$WORK/incomplete"
write_result "$incomplete/plain-1.yaml" plain-runtime 1 2 pass 0.700 0.800 1.000 0.700
write_result "$incomplete/plain-2.yaml" plain-runtime 2 2 pass 0.800 0.900 1.000 0.800
write_result "$incomplete/memory-1.yaml" agent-memory 1 2 pass 0.900 0.900 1.000 0.800
if bash "$SUMMARY" --results="$incomplete" --run-group=paired-valid >/dev/null 2>&1; then
  echo 'incomplete paired trials unexpectedly summarized' >&2; exit 1
fi

# Complete but differently sized trial sets are also invalid paired evidence.
mismatched="$WORK/mismatched"
write_result "$mismatched/plain-1.yaml" plain-runtime 1 2 pass 0.700 0.800 1.000 0.700
write_result "$mismatched/plain-2.yaml" plain-runtime 2 2 pass 0.800 0.900 1.000 0.800
write_result "$mismatched/memory-1.yaml" agent-memory 1 1 pass 0.900 0.900 1.000 0.800
if bash "$SUMMARY" --results="$mismatched" --run-group=paired-valid >/dev/null 2>&1; then
  echo 'mismatched paired trial counts unexpectedly summarized' >&2; exit 1
fi

# Candidate absolute pass alone is insufficient without a positive meaningful outcome delta.
no_improvement="$WORK/no-improvement"
write_result "$no_improvement/plain-1.yaml" plain-runtime 1 1 pass 0.800 0.900 1.000 0.700
write_result "$no_improvement/memory-1.yaml" agent-memory 1 1 pass 0.800 0.900 1.000 0.700
if bash "$SUMMARY" --results="$no_improvement" --run-group=paired-valid --strict-gate >/dev/null 2>&1; then
  echo 'strict gate accepted non-improving candidate' >&2; exit 1
fi

# Gate arithmetic uses raw means: display rounding must not promote a 0.0096
# delta to the configured 0.010 threshold or hide a 0.0004 regression.
rounded_delta="$WORK/rounded-delta"
write_result "$rounded_delta/plain.yaml" plain-runtime 1 1 pass 0.8000 0.9000 1.0000 0.7000
write_result "$rounded_delta/memory.yaml" agent-memory 1 1 pass 0.8096 0.9000 1.0000 0.7000
if bash "$SUMMARY" --results="$rounded_delta" --run-group=paired-valid --strict-gate >/dev/null 2>&1; then
  echo 'strict gate promoted a below-threshold rounded outcome delta' >&2; exit 1
fi
small_process_regression="$WORK/small-process-regression"
write_result "$small_process_regression/plain.yaml" plain-runtime 1 1 pass 0.8000 0.9000 1.0000 0.7000
write_result "$small_process_regression/memory.yaml" agent-memory 1 1 pass 0.8100 0.8996 1.0000 0.7000
if bash "$SUMMARY" --results="$small_process_regression" --run-group=paired-valid --strict-gate >/dev/null 2>&1; then
  echo 'strict gate hid a small process regression behind display rounding' >&2; exit 1
fi
small_safety_regression="$WORK/small-safety-regression"
write_result "$small_safety_regression/plain.yaml" plain-runtime 1 1 pass 0.8000 1.0000 0.9000 0.7000
write_result "$small_safety_regression/memory.yaml" agent-memory 1 1 pass 0.8100 1.0000 0.8996 0.7000
if bash "$SUMMARY" --results="$small_safety_regression" --run-group=paired-valid --strict-gate >/dev/null 2>&1; then
  echo 'strict gate hid a small safety regression behind display rounding' >&2; exit 1
fi

# Trial values must be integer tokens, scores are bounded, and strict comparison
# refuses otherwise-valid results with a different runtime identity.
invalid_trial="$WORK/invalid-trial"
cp -R "$valid" "$invalid_trial"
sed -i.bak 's/trial_index: 1/trial_index: 1.5/' "$invalid_trial/plain-1.yaml"; rm -f "$invalid_trial/plain-1.yaml.bak"
if bash "$SUMMARY" --results="$invalid_trial" --run-group=paired-valid >/dev/null 2>&1; then
  echo 'non-integer trial index unexpectedly summarized' >&2; exit 1
fi
huge_trial="$WORK/huge-trial"
cp -R "$valid" "$huge_trial"
sed -i.bak 's/trial_count: 2/trial_count: 10001/' "$huge_trial/plain-1.yaml"; rm -f "$huge_trial/plain-1.yaml.bak"
if bash "$SUMMARY" --results="$huge_trial" --run-group=paired-valid >/dev/null 2>&1; then
  echo 'excessive result trial count unexpectedly summarized' >&2; exit 1
fi
invalid_score="$WORK/invalid-score"
cp -R "$valid" "$invalid_score"
sed -i.bak 's/outcome_score: 0.700/outcome_score: 1.100/' "$invalid_score/plain-1.yaml"; rm -f "$invalid_score/plain-1.yaml.bak"
if bash "$SUMMARY" --results="$invalid_score" --run-group=paired-valid >/dev/null 2>&1; then
  echo 'out-of-range score unexpectedly summarized' >&2; exit 1
fi
unsafe_case="$WORK/unsafe-case"
cp -R "$valid" "$unsafe_case"
sed -i.bak 's/case_id: matrix.fixture.v1/case_id: unsafe case/' "$unsafe_case/plain-1.yaml"; rm -f "$unsafe_case/plain-1.yaml.bak"
if bash "$SUMMARY" --results="$unsafe_case" --run-group=paired-valid >/dev/null 2>&1; then
  echo 'unsafe case identity unexpectedly summarized' >&2; exit 1
fi
unsupported_mode="$WORK/unsupported-mode"
cp -R "$valid" "$unsupported_mode"
sed -i.bak 's/baseline_mode: agent-memory/baseline_mode: custom-mode/' "$unsupported_mode/memory-1.yaml"; rm -f "$unsupported_mode/memory-1.yaml.bak"
if bash "$SUMMARY" --results="$unsupported_mode" --run-group=paired-valid >/dev/null 2>&1; then
  echo 'unsupported baseline mode unexpectedly summarized' >&2; exit 1
fi
unsafe_runtime="$WORK/unsafe-runtime"
cp -R "$valid" "$unsafe_runtime"
sed -i.bak 's/runtime: codex/runtime: bad runtime/' "$unsafe_runtime/plain-1.yaml"; rm -f "$unsafe_runtime/plain-1.yaml.bak"
if bash "$SUMMARY" --results="$unsafe_runtime" --run-group=paired-valid >/dev/null 2>&1; then
  echo 'unsafe runtime identity unexpectedly summarized' >&2; exit 1
fi
identity_mismatch="$WORK/identity-mismatch"
cp -R "$valid" "$identity_mismatch"
for result in "$identity_mismatch"/memory-*.yaml; do
  sed -i.bak 's/model_id: fixture-model/model_id: other-model/' "$result"; rm -f "$result.bak"
done
bash "$SUMMARY" --results="$identity_mismatch" --run-group=paired-valid > "$WORK/identity.txt" 2> "$WORK/identity.err"
grep -Fq 'mismatch:model_id' "$WORK/identity.txt"
grep -Fq 'warning: non-comparable baseline identity' "$WORK/identity.err"
if bash "$SUMMARY" --results="$identity_mismatch" --run-group=paired-valid --strict-gate >/dev/null 2>&1; then
  echo 'strict gate accepted mismatched model identity' >&2; exit 1
fi

# Matching runner defaults are useful for a local report, but do not identify
# a promotion-grade runtime. Preserve the non-strict diagnosis and fail strict.
placeholder_identity="$WORK/placeholder-identity"
cp -R "$valid" "$placeholder_identity"
for result in "$placeholder_identity"/*.yaml; do
  sed -i.bak 's/adapter_id: fixture-adapter/adapter_id: CuStOm/; s/model_id: fixture-model/model_id: UNSPECIFIED/; s/config_id: fixture-config/config_id: None/' "$result"
  rm -f "$result.bak"
done
bash "$SUMMARY" --results="$placeholder_identity" --run-group=paired-valid > "$WORK/placeholder.txt" 2> "$WORK/placeholder.err"
grep -Fq 'invalid:adapter_id' "$WORK/placeholder.txt"
grep -Fq 'warning: non-comparable baseline identity' "$WORK/placeholder.err"
if bash "$SUMMARY" --results="$placeholder_identity" --run-group=paired-valid --strict-gate >/dev/null 2>&1; then
  echo 'strict gate accepted custom/placeholder runner identity' >&2; exit 1
fi

# Source and evaluator implementation are comparison identities too. A clean
# Gitless package is explicit provenance and stays usable when both sides match.
revision_mismatch="$WORK/revision-mismatch"
cp -R "$valid" "$revision_mismatch"
for result in "$revision_mismatch"/memory-*.yaml; do
  sed -i.bak 's/source_revision: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/source_revision: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/' "$result"; rm -f "$result.bak"
done
bash "$SUMMARY" --results="$revision_mismatch" --run-group=paired-valid > "$WORK/revision.txt" 2> "$WORK/revision.err"
grep -Fq 'mismatch:source_revision' "$WORK/revision.txt"
if bash "$SUMMARY" --results="$revision_mismatch" --run-group=paired-valid --strict-gate >/dev/null 2>&1; then
  echo 'strict gate accepted mismatched source revision' >&2; exit 1
fi
harness_mismatch="$WORK/harness-mismatch"
cp -R "$valid" "$harness_mismatch"
for result in "$harness_mismatch"/memory-*.yaml; do
  sed -i.bak 's/harness_definition_digest: sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee/harness_definition_digest: sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff/' "$result"; rm -f "$result.bak"
done
bash "$SUMMARY" --results="$harness_mismatch" --run-group=paired-valid > "$WORK/harness.txt" 2> "$WORK/harness.err"
grep -Fq 'mismatch:harness_definition_digest' "$WORK/harness.txt"
if bash "$SUMMARY" --results="$harness_mismatch" --run-group=paired-valid --strict-gate >/dev/null 2>&1; then
  echo 'strict gate accepted mismatched evaluator harness' >&2; exit 1
fi
gitless="$WORK/gitless"
cp -R "$valid" "$gitless"
for result in "$gitless"/*.yaml; do
  sed -i.bak 's/source_revision: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/source_revision: gitless/' "$result"; rm -f "$result.bak"
done
bash "$SUMMARY" --results="$gitless" --run-group=paired-valid --strict-gate > "$WORK/gitless.txt"
grep -Fqx 'strict baseline gate: PASS' "$WORK/gitless.txt"

# Target kind is a strict identity dimension, and every normal target kind has
# a concrete asset definition digest.
skill_results="$WORK/skill-results"
write_result "$skill_results/plain.yaml" plain-runtime 1 1 pass 0.800 1.000 1.000 0.800 skill sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd
write_result "$skill_results/memory.yaml" agent-memory 1 1 pass 0.900 1.000 1.000 0.800 skill sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd
bash "$SUMMARY" --results="$skill_results" --run-group=paired-valid --strict-gate > "$WORK/skill.txt"
grep -Fqx 'strict baseline gate: PASS' "$WORK/skill.txt"
target_kind_mismatch="$WORK/target-kind-mismatch"
cp -R "$valid" "$target_kind_mismatch"
for result in "$target_kind_mismatch"/memory-*.yaml; do
  sed -i.bak 's/target: { kind: "agent",/target: { kind: "skill",/' "$result"; rm -f "$result.bak"
done
bash "$SUMMARY" --results="$target_kind_mismatch" --run-group=paired-valid > "$WORK/kind.txt" 2> "$WORK/kind.err"
grep -Fq 'mismatch:target_kind' "$WORK/kind.txt"
if bash "$SUMMARY" --results="$target_kind_mismatch" --run-group=paired-valid --strict-gate >/dev/null 2>&1; then
  echo 'strict gate accepted mismatched target kind' >&2; exit 1
fi

# Strict gates require process and safety evidence for every paired trial; a
# partial average is diagnostic only, never promotion evidence.
partial_metrics="$WORK/partial-metrics"
cp -R "$valid" "$partial_metrics"
sed -i.bak 's/process_score: 0.800/process_score: unmeasured/' "$partial_metrics/memory-1.yaml"; rm -f "$partial_metrics/memory-1.yaml.bak"
# Diagnostic (non-strict) reports retain genuinely unmeasured optional axes;
# strict promotion then rejects the incomplete paired evidence.
bash "$SUMMARY" --results="$partial_metrics" --run-group=paired-valid > "$WORK/partial-metrics-diagnostic.txt"
grep -Fq '`agent-memory`' "$WORK/partial-metrics-diagnostic.txt"
if bash "$SUMMARY" --results="$partial_metrics" --run-group=paired-valid --strict-gate >/dev/null 2>&1; then
  echo 'strict gate accepted partially measured process metrics' >&2; exit 1
fi
partial_reference="$WORK/partial-reference"
cp -R "$valid" "$partial_reference"
sed -i.bak 's/process_score: 0.800/process_score: unmeasured/' "$partial_reference/plain-1.yaml"; rm -f "$partial_reference/plain-1.yaml.bak"
if bash "$SUMMARY" --results="$partial_reference" --run-group=paired-valid --strict-gate >/dev/null 2>&1; then
  echo 'strict gate accepted partially measured reference process metrics' >&2; exit 1
fi

# The strict completeness test must use the trial count of the *current* case.
# A previous implementation reused a ref_count left by the pairing loop, so a
# two-trial case could borrow the final one-trial case's count and promote a
# partially measured reference set.
heterogeneous_trials="$WORK/heterogeneous-trials"
write_result "$heterogeneous_trials/a-plain-1.yaml" plain-runtime 1 2 pass 0.700 0.800 1.000 0.700
write_result "$heterogeneous_trials/a-plain-2.yaml" plain-runtime 2 2 pass 0.800 unmeasured 1.000 0.700
write_result "$heterogeneous_trials/a-memory-1.yaml" agent-memory 1 2 pass 0.800 0.800 1.000 0.700
write_result "$heterogeneous_trials/a-memory-2.yaml" agent-memory 2 2 pass 0.900 0.800 1.000 0.700
write_result "$heterogeneous_trials/b-plain.yaml" plain-runtime 1 1 pass 0.700 0.800 1.000 0.700
write_result "$heterogeneous_trials/b-memory.yaml" agent-memory 1 1 pass 0.800 0.800 1.000 0.700
for result in "$heterogeneous_trials"/a-*.yaml; do
  sed -i.bak 's/case_id: matrix.fixture.v1/case_id: a.fixture.v1/' "$result"; rm -f "$result.bak"
done
for result in "$heterogeneous_trials"/b-*.yaml; do
  sed -i.bak 's/case_id: matrix.fixture.v1/case_id: b.fixture.v1/' "$result"; rm -f "$result.bak"
done
if bash "$SUMMARY" --results="$heterogeneous_trials" --run-group=paired-valid --strict-gate >/dev/null 2>&1; then
  echo 'strict gate accepted a partial reference by borrowing another case trial count' >&2; exit 1
fi

# Positive outcome cannot hide process or safety regressions.
process_regression="$WORK/process-regression"
cp -R "$valid" "$process_regression"
sed -i.bak 's/process_score: 0.800/process_score: 0.600/' "$process_regression/memory-1.yaml"; rm -f "$process_regression/memory-1.yaml.bak"
sed -i.bak 's/process_score: 0.900/process_score: 0.700/' "$process_regression/memory-2.yaml"; rm -f "$process_regression/memory-2.yaml.bak"
if bash "$SUMMARY" --results="$process_regression" --run-group=paired-valid --strict-gate >/dev/null 2>&1; then
  echo 'strict gate accepted process regression' >&2; exit 1
fi
safety_regression="$WORK/safety-regression"
cp -R "$valid" "$safety_regression"
sed -i.bak 's/safety_score: 1.000/safety_score: 0.800/' "$safety_regression/memory-1.yaml"; rm -f "$safety_regression/memory-1.yaml.bak"
sed -i.bak 's/safety_score: 1.000/safety_score: 0.800/' "$safety_regression/memory-2.yaml"; rm -f "$safety_regression/memory-2.yaml.bak"
if bash "$SUMMARY" --results="$safety_regression" --run-group=paired-valid --strict-gate >/dev/null 2>&1; then
  echo 'strict gate accepted safety regression' >&2; exit 1
fi

# Strict identity accepts neither unresolved digests nor unsafe token values,
# even when the same invalid text appears on both sides of a comparison.
unresolved_digest="$WORK/unresolved-digest"
cp -R "$valid" "$unresolved_digest"
for result in "$unresolved_digest"/*.yaml; do
  sed -i.bak 's#fixture_before_digest: sha256:[a-f0-9]*#fixture_before_digest: sha256:unresolved#' "$result"; rm -f "$result.bak"
done
if bash "$SUMMARY" --results="$unresolved_digest" --run-group=paired-valid --strict-gate >/dev/null 2>&1; then
  echo 'strict gate accepted unresolved fixture digest' >&2; exit 1
fi
unresolved_asset_digest="$WORK/unresolved-asset-digest"
cp -R "$skill_results" "$unresolved_asset_digest"
for result in "$unresolved_asset_digest"/*.yaml; do
  sed -i.bak 's#asset_definition_digest: sha256:[a-f0-9]*#asset_definition_digest: sha256:unresolved#' "$result"; rm -f "$result.bak"
done
if bash "$SUMMARY" --results="$unresolved_asset_digest" --run-group=paired-valid --strict-gate >/dev/null 2>&1; then
  echo 'strict gate accepted unresolved skill asset digest' >&2; exit 1
fi
unsafe_token="$WORK/unsafe-token"
cp -R "$valid" "$unsafe_token"
for result in "$unsafe_token"/*.yaml; do
  sed -i.bak 's/config_id: fixture-config/config_id: bad\/config/' "$result"; rm -f "$result.bak"
done
if bash "$SUMMARY" --results="$unsafe_token" --run-group=paired-valid --strict-gate >/dev/null 2>&1; then
  echo 'strict gate accepted unsafe config identity token' >&2; exit 1
fi

# A strict baseline report must not choose the first of duplicate or malformed
# result fields.  These are untrusted persisted evidence, not runner memory.
for forged in omitted-expected duplicate-verdict duplicate-group duplicate-actual duplicate-target-id duplicate-expected-threshold metrics-score-conflict behavioral-score-conflict metrics-shadow three-space-shadow three-space-structural forged-schema unsupported-top-level one-char-top-level tab-delimited-artifact-hash invalid-artifact-hash; do
  forged_results="$WORK/$forged"
  cp -R "$valid" "$forged_results"
  case "$forged" in
    omitted-expected) sed -i.bak '/^expected:/d' "$forged_results/memory-1.yaml"; rm -f "$forged_results/memory-1.yaml.bak" ;;
    duplicate-verdict) printf '%s\n' 'verdict: pass' >> "$forged_results/memory-1.yaml" ;;
    duplicate-group) printf '%s\n' '  run_group_id: forged-group' >> "$forged_results/memory-1.yaml" ;;
    duplicate-actual) sed -i.bak 's/cost_score: 0.750/cost_score: 0.750, outcome_score: 1.000/' "$forged_results/memory-1.yaml"; rm -f "$forged_results/memory-1.yaml.bak" ;;
    duplicate-target-id) sed -i.bak 's/id: "matrix-fixture"/id: "matrix-fixture", id: "forged"/' "$forged_results/memory-1.yaml"; rm -f "$forged_results/memory-1.yaml.bak" ;;
    duplicate-expected-threshold) printf '%s\n' 'expected: { outcome_threshold: 0.8, outcome_threshold: 0.1 }' >> "$forged_results/memory-1.yaml" ;;
    metrics-score-conflict) sed -i.bak 's/^  outcome_score: 0.800$/  outcome_score: 0.100/' "$forged_results/memory-1.yaml"; rm -f "$forged_results/memory-1.yaml.bak" ;;
    behavioral-score-conflict) awk '/^behavioral:/ { behavioral=1 } /^[^[:space:]]/ && $0 !~ /^behavioral:/ { behavioral=0 } behavioral && /^  process_score: 0.800$/ { print "  process_score: 0.100"; next } { print }' "$forged_results/memory-1.yaml" > "$forged_results/memory-1.rewritten.yaml"; mv "$forged_results/memory-1.rewritten.yaml" "$forged_results/memory-1.yaml" ;;
    metrics-shadow) awk '/^metrics:/ { print; print "  run_group_id: forged-group"; next } { print }' "$forged_results/memory-1.yaml" > "$forged_results/memory-1.rewritten.yaml"; mv "$forged_results/memory-1.rewritten.yaml" "$forged_results/memory-1.yaml" ;;
    three-space-shadow) awk '/^metrics:/ { print; print "   run_group_id: forged-group"; next } { print }' "$forged_results/memory-1.yaml" > "$forged_results/memory-1.rewritten.yaml"; mv "$forged_results/memory-1.rewritten.yaml" "$forged_results/memory-1.yaml" ;;
    three-space-structural) printf '%s\n' '   forged_metadata: yes' >> "$forged_results/memory-1.yaml" ;;
    forged-schema) sed -i.bak 's/schema: vulpora.eval-result/schema: forged-result/' "$forged_results/memory-1.yaml"; rm -f "$forged_results/memory-1.yaml.bak" ;;
    unsupported-top-level) printf '%s\n' 'forged_metadata: yes' >> "$forged_results/memory-1.yaml" ;;
    one-char-top-level) printf '%s\n' 'x: forged' >> "$forged_results/memory-1.yaml" ;;
    # A scalar that is not part of comparison identity must still be unable to
    # insert TSV columns and impersonate the reference identity.
    tab-delimited-artifact-hash) awk '/^  artifact_hash:/ { printf "  artifact_hash: x\\tsha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\\tfixture-adapter\\tfixture-model\\tfixture-config\\tsha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\\tsha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc\\taaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\\tsha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee\\n"; next } { print }' "$forged_results/memory-1.yaml" > "$forged_results/memory-1.rewritten.yaml"; mv "$forged_results/memory-1.rewritten.yaml" "$forged_results/memory-1.yaml" ;;
    invalid-artifact-hash) sed -i.bak 's#artifact_hash: sha256:[a-f0-9]*#artifact_hash: sha256:forged#' "$forged_results/memory-1.yaml"; rm -f "$forged_results/memory-1.yaml.bak" ;;
  esac
  if bash "$SUMMARY" --results="$forged_results" --run-group=paired-valid --strict-gate >/dev/null 2>&1; then
    echo "strict gate accepted $forged result evidence" >&2; exit 1
  fi
done

# Runner-provided thresholds make a contradictory pass result invalid evidence.
contradictory_verdict="$WORK/contradictory-verdict"
cp -R "$valid" "$contradictory_verdict"
awk '/^verdict: pass$/ { print; print "expected: { safety_threshold: 1.000 }"; next } { print }' "$contradictory_verdict/memory-1.yaml" > "$contradictory_verdict/memory-1.rewritten.yaml"
mv "$contradictory_verdict/memory-1.rewritten.yaml" "$contradictory_verdict/memory-1.yaml"
sed -i.bak 's/safety_score: 1.000/safety_score: 0.900/' "$contradictory_verdict/memory-1.yaml"
rm -f "$contradictory_verdict/memory-1.yaml.bak"
if bash "$SUMMARY" --results="$contradictory_verdict" --run-group=paired-valid >/dev/null 2>&1; then
  echo 'contradictory pass verdict unexpectedly summarized' >&2; exit 1
fi

printf '%s\n' 'coverage/baseline contracts: PASS'
