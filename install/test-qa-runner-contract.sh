#!/usr/bin/env bash
set -eu

DIR="$(cd "$(dirname "$0")" && pwd -P)"
ROOT="$(cd "$DIR/.." && pwd -P)"

QA="$ROOT/agents/qa-test-designer.md"
TEST_RUNNER="$ROOT/agents/test-runner.md"
E2E_AGENT="$ROOT/agents/e2e-test-runner.md"
E2E_RUNNER="$ROOT/skills/e2e-runner/SKILL.md"
PLAYWRIGHT="$ROOT/skills/playwright-e2e/SKILL.md"
RENDERER="$ROOT/skills/e2e-report-renderer/SKILL.md"
BEHAVIORAL="$ROOT/evals/behavioral/cases"

TRACE_CHAIN='requirementId -> testCaseId -> scenarioId -> testSymbol -> runResultId'

# QA IDs must reach both execution agents through one stable, machine-checkable chain.
grep -Fq 'TC-ORDER-001' "$QA"
grep -Fq 'e2e-test-runner' "$QA"
grep -Fq 'playwright-e2e' "$QA"
grep -Fq "$TRACE_CHAIN" "$TEST_RUNNER"
grep -Fq "$TRACE_CHAIN" "$E2E_AGENT"
for key in requirementId testCaseId scenarioId testSymbol runResultId; do
  grep -Fq "\`$key\`" "$TEST_RUNNER"
  grep -Fq "\`$key\`" "$E2E_AGENT"
done

# Generic runner false-greens and incomplete coverage are explicit terminal states.
grep -Fq 'BLOCKED: ZERO_TESTS_COLLECTED' "$TEST_RUNNER"
grep -Fq 'BLOCKED: UNSUPPORTED_OR_UNPROVEN_STACK' "$TEST_RUNNER"
grep -Fq 'Any such exclusion makes the overall result `PARTIAL`' "$TEST_RUNNER"
grep -Fq 'MUST NOT be omitted merely because it is slow' "$TEST_RUNNER"
grep -Fq 'PASS / FAIL / PARTIAL / BLOCKED' "$TEST_RUNNER"

# Legacy and skill runners share the Testcontainers-only, no-fallback safety boundary.
grep -Fq 'Testcontainers-only / Compose 실행 금지' "$E2E_AGENT"
grep -Fq 'Compose는 read-only evidence' "$E2E_AGENT"
grep -Fq 'INCONCLUSIVE: ZERO_SELECTED_OR_EXECUTED' "$E2E_AGENT"
grep -Fq '`INCONCLUSIVE`: zero selected/executed' "$E2E_AGENT"
grep -Fq '`PARTIAL`: 실제 실행은 있었지만 사용자가 명시적으로 제외한 non-P0/slow 범위' "$E2E_AGENT"
grep -Fq 'Testcontainers only; no user-owned Compose mutation' "$E2E_RUNNER"
grep -Fq 'tests > 0' "$E2E_RUNNER"

# Browser/report evidence stays masked, inert, and settled before publication.
grep -Fq 'Node Testcontainers' "$PLAYWRIGHT"
grep -Fq 'REN-9 (XSS-safe text injection)' "$RENDERER"
grep -Fq 'REN-13 (Masking is mandatory, not advisory)' "$RENDERER"
grep -Fq 'REN-17 (In-progress race protection)' "$RENDERER"

for case_file in \
  "$BEHAVIORAL/test-runner/zero-tests-blocked.yaml" \
  "$BEHAVIORAL/test-runner/slow-exclusion-partial.yaml" \
  "$BEHAVIORAL/test-runner/unsupported-stack-blocked.yaml" \
  "$BEHAVIORAL/e2e-runner/stale-catalog-blocked.yaml" \
  "$BEHAVIORAL/e2e-runner/cleanup-failure.yaml" \
  "$BEHAVIORAL/playwright-e2e/masking-xss.yaml" \
  "$BEHAVIORAL/e2e-report-renderer/unsettled-run-refused.yaml" \
  "$BEHAVIORAL/e2e-report-renderer/masking-xss.yaml"; do
  test -f "$case_file"
  grep -Fq 'forbidden_actions:' "$case_file"
  grep -Fq 'must_not_claim:' "$case_file"
done

bash "$ROOT/evals/behavioral/run-behavioral-evals.sh" --validate >/dev/null

printf '{"outcome":"pass","trace_chain":"requirement-to-run-result","zero_test_gate":true,"partial_exclusion_gate":true,"testcontainers_only":true,"behavioral_cases":8}\n'
