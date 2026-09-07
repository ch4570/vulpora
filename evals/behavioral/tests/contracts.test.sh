#!/usr/bin/env bash
# Focused contracts for behavioral selection, matcher parsing, coverage, result
# metadata, baseline deltas, and improvement-record promotion gates.

set -eu
set -o pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="$(cd "$DIR/../.." && pwd)"
RUNNER="$DIR/run-behavioral-evals.sh"
GRADER="$DIR/graders/deterministic-text.sh"
COVERAGE="$DIR/check-catalog-coverage.sh"
SUMMARY="$DIR/summarize-baseline-matrix.sh"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/vulpora-behavioral-contract.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT HUP INT TERM

printf '%s\n' 'status: ready' 'Build passed' > "$WORK/output.txt"
printf '%s\n' \
  'expected:' '  must_find:' "    - 'any_of:status: ready|spec_status.*ready'" "    - 'regex:build[[:space:]]+passed'" \
  '  must_not_claim:' "    - 'literal:deployment complete'" > "$WORK/matchers.yaml"
bash "$GRADER" "$WORK/output.txt" "$WORK/matchers.yaml" > "$WORK/grader.env"
grep -Fqx 'outcome_score=1.000' "$WORK/grader.env"

printf '%s\n' 'deployment complete' > "$WORK/false-claim.txt"
bash "$GRADER" "$WORK/false-claim.txt" "$WORK/matchers.yaml" > "$WORK/false-claim.env"
grep -Fqx 'outcome_score=0.000' "$WORK/false-claim.env"

# A selected asset with no matching case must be a failure, unlike the default
# all-case validation which remains a catalog/schema check.
if bash "$RUNNER" --validate --only=definitely-uncovered >/dev/null 2>&1; then
  echo 'selected zero-case eval unexpectedly passed' >&2; exit 1
fi
bash "$RUNNER" --validate --only=definitely-uncovered --allow-empty > "$WORK/empty.txt" 2>&1
grep -Fq 'status: NOT_RUN; scanned_cases: 0' "$WORK/empty.txt"
mkdir "$WORK/empty-catalog"
if VULPORA_BEHAVIORAL_CASES_DIR="$WORK/empty-catalog" bash "$RUNNER" --validate > "$WORK/empty-catalog.txt" 2>&1; then
  echo 'empty catalog unexpectedly passed' >&2; exit 1
fi
grep -Fq 'status: NOT_RUN; scanned_cases: 0' "$WORK/empty-catalog.txt"
if bash "$RUNNER" --validate --only=kotlin-spring-reviewer,definitely-uncovered > "$WORK/mixed-selection.txt" 2>&1; then
  echo 'covered case masked an uncovered selected asset' >&2; exit 1
fi
grep -Fq 'reason: selected_asset_has_no_cases; asset: definitely-uncovered' "$WORK/mixed-selection.txt"
if bash "$COVERAGE" --strict --cases="$WORK/empty-catalog" > "$WORK/empty-coverage.txt" 2>&1; then
  echo 'empty coverage corpus unexpectedly passed' >&2; exit 1
fi
grep -Fq 'reason: empty_coverage_catalog' "$WORK/empty-coverage.txt"
printf '# No agent rows\n' > "$WORK/empty-manifest"
if bash "$COVERAGE" --strict --manifest="$WORK/empty-manifest" > "$WORK/empty-manifest.txt" 2>&1; then
  echo 'empty agent manifest unexpectedly passed coverage' >&2; exit 1
fi
grep -Fq 'reason: empty_agent_manifest' "$WORK/empty-manifest.txt"

mkdir -p "$WORK/duplicate"
cp "$DIR/cases/kotlin-spring-reviewer/sample-review.yaml" "$WORK/duplicate/a.yaml"
cp "$DIR/cases/kotlin-spring-reviewer/sample-review.yaml" "$WORK/duplicate/b.yaml"
if VULPORA_BEHAVIORAL_CASES_DIR="$WORK/duplicate" bash "$RUNNER" --validate >/dev/null 2>&1; then
  echo 'duplicate behavioral case id unexpectedly passed' >&2; exit 1
fi

mkdir -p "$WORK/invalid-regex"
cp "$DIR/cases/kotlin-spring-reviewer/sample-review.yaml" "$WORK/invalid-regex/a.yaml"
sed -i.bak "s/- transaction/- 'regex:(unclosed'/" "$WORK/invalid-regex/a.yaml"
rm -f "$WORK/invalid-regex/a.yaml.bak"
if VULPORA_BEHAVIORAL_CASES_DIR="$WORK/invalid-regex" bash "$RUNNER" --validate >/dev/null 2>&1; then
  echo 'invalid explicit regex unexpectedly passed' >&2; exit 1
fi

mkdir -p "$WORK/unsafe-id"
cp "$DIR/cases/kotlin-spring-reviewer/sample-review.yaml" "$WORK/unsafe-id/a.yaml"
sed -i.bak 's/^id: .*/id: bad\/..\/case/' "$WORK/unsafe-id/a.yaml"
rm -f "$WORK/unsafe-id/a.yaml.bak"
if VULPORA_BEHAVIORAL_CASES_DIR="$WORK/unsafe-id" bash "$RUNNER" --validate >/dev/null 2>&1; then
  echo 'unsafe result-path case id unexpectedly passed' >&2; exit 1
fi

bash "$COVERAGE" --report > "$WORK/coverage.txt"
awk '/^catalog_coverage:/ { split($2,a,"="); split($3,c,"="); split($4,u,"="); ok=(a[2]>0 && a[2]==c[2] && u[2]==0) } END { exit !ok }' "$WORK/coverage.txt"
awk '/^uncovered_agents:/{header=1; inside=1; next} inside && /^skill_or_workflow_assets:/{inside=0} inside && /^  - /{found=1} END{exit !(header && !found)}' "$WORK/coverage.txt"
grep -Fq 'skill_or_workflow_assets:' "$WORK/coverage.txt"
bash "$COVERAGE" --strict >/dev/null

# Synthetic result fixtures prove paired multi-axis reporting and that absolute
# candidate passes alone do not become an improvement without a positive delta.
mkdir -p "$WORK/results"
for row in 'plain-runtime pass 0.800' 'agent-only pass 0.800' 'agent-memory pass 0.900'; do
  set -- $row
  printf '%s\n' 'schema: vulpora.eval-result' "case_id: fixture.case.v1" 'target: { kind: agent, id: fixture-agent }' 'expected: { outcome_threshold: 0.000, process_threshold: 0.000, safety_threshold: 0.000, cost_threshold: unconfigured }' "actual: { outcome_score: $3, process_score: 1.000, safety_score: 1.000, cost_score: 1.000 }" 'metrics:' "  outcome_score: $3" '  process_score: 1.000' '  safety_score: 1.000' '  cost_score: 1.000' "verdict: $2" 'behavioral:' '  runtime: codex' '  artifact_hash: sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd' '  fixture_before_digest: sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' "  baseline_mode: $1" '  process_score: 1.000' '  safety_score: 1.000' '  cost_score: 1.000' 'run:' '  run_group_id: fixture-group' '  adapter_id: fixture-adapter' '  model_id: fixture-model' '  config_id: fixture-config' '  case_digest: sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' '  asset_definition_digest: sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc' '  source_revision: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' '  harness_definition_digest: sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' '  trial_index: 1' '  trial_count: 1' > "$WORK/results/$1.yaml"
done
bash "$SUMMARY" --results="$WORK/results" --run-group=fixture-group > "$WORK/summary.txt"
grep -Fq '| `fixture.case.v1` | `agent-only` | 1 | 1/1 (1.000) | 0.800±NA (±NA) | 1.000±NA (±NA) | 1.000±NA (±NA) | 1.000±NA (±NA) | 0.000 | comparable | fail:outcome_delta |' "$WORK/summary.txt"
grep -Fq '| `fixture.case.v1` | `agent-memory` | 1 | 1/1 (1.000) | 0.900±NA (±NA) | 1.000±NA (±NA) | 1.000±NA (±NA) | 1.000±NA (±NA) | 0.100 | comparable | pass |' "$WORK/summary.txt"
# The portability entrypoint selects one required awk implementation for the
# entire suite, including this trailing-zero fixture and every rejection case.
if bash "$SUMMARY" --results="$WORK/results" --run-group=fixture-group --strict-gate >/dev/null 2>&1; then
  echo 'strict gate accepted a zero-delta candidate' >&2; exit 1
fi

mkdir -p "$WORK/run-results"
VULPORA_BEHAVIORAL_RESULTS_DIR="$WORK/run-results" VULPORA_RUN_GROUP_ID=metadata-group \
  VULPORA_BEHAVIORAL_RUNNER_CMD="bash $DIR/adapters/sample-adapter.sh" \
  bash "$RUNNER" --run --only=kotlin-spring-reviewer >/dev/null
result="$(find "$WORK/run-results" -name '*.yaml' -type f)"
grep -Fqx '  run_group_id: metadata-group' "$result"
grep -Fqx '  trial_index: 1' "$result"
grep -Fqx '  trial_count: 1' "$result"

# Reject unsafe run metadata before the runner writes a result file.
for metadata in \
  'VULPORA_RUN_GROUP_ID=bad/../group' \
  'VULPORA_TRIAL_INDEX=0' \
  'VULPORA_TRIAL_INDEX=2 VULPORA_TRIAL_COUNT=1' \
  'VULPORA_BASELINE_MODE_OVERRIDE=unsupported-mode'; do
  reject_dir="$WORK/reject-$(printf '%s' "$metadata" | tr -cs 'A-Za-z0-9' '_')"
  mkdir -p "$reject_dir"
  if env VULPORA_BEHAVIORAL_RESULTS_DIR="$reject_dir" VULPORA_BEHAVIORAL_RUNNER_CMD="bash $DIR/adapters/sample-adapter.sh" $metadata \
    bash "$RUNNER" --run --only=kotlin-spring-reviewer >/dev/null 2>&1; then
    echo "unsafe metadata unexpectedly passed: $metadata" >&2; exit 1
  fi
  if find "$reject_dir" -name '*.yaml' -type f | grep -q .; then
    echo "unsafe metadata wrote a result: $metadata" >&2; exit 1
  fi
done

printf '%s\n' 'behavioral contracts: PASS'
