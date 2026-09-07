#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
REPO_ROOT="$(cd "$ROOT/../.." && pwd -P)"
SKILL="$ROOT/SKILL.md"
OPENAI="$ROOT/agents/openai.yaml"
VALIDATOR="$ROOT/scripts/validate-review-report.js"

require() {
  local file="$1" text="$2"
  grep -Fq -- "$text" "$file" || { echo "missing '$text' in $file" >&2; exit 1; }
}

test -s "$SKILL"
test -s "$OPENAI"
test -x "$VALIDATOR"
test -f "$ROOT/tests/validator-contract.test.js"
test -f "$ROOT/tests/fixtures/valid/review-report.json"
test -f "$ROOT/tests/fixtures/valid/reviewed-without-execution.json"
test -f "$ROOT/tests/fixtures/invalid/missing-oracle.json"
test -f "$ROOT/tests/fixtures/invalid/missing-line-evidence.json"

require "$SKILL" 'name: test-quality-review'
require "$SKILL" 'Use `test-authoring` as the normative source for `TST-1` through `TST-20`.'
require "$SKILL" 'Do not copy, rename, reinterpret, or'
require "$SKILL" 'Perform a bounded, read-only audit'
require "$SKILL" 'at most eight'
require "$SKILL" 'dirty worktree'
require "$SKILL" 'environment ownership'
require "$SKILL" 'disposable endpoint and namespace evidence plus an explicit parallel-run policy'
require "$SKILL" 'fresh reports, exit code, executed count, and cache-only detection'
require "$SKILL" 'regular, non-symlink JUnit XML report resolved relative to'
require "$SKILL" 'Math.floor(stat.mtimeMs)'
require "$SKILL" 'validateReport(report, { baseDirectory })'
require "$SKILL" 'omitting it fails closed'
require "$SKILL" 'vulpora.test-quality-review/v1'
require "$SKILL" 'REVIEWED_WITHOUT_EXECUTION'
require "$SKILL" 'without killed fault proof for every behavior'
require "$SKILL" 'machine-readable `kind`'
require "$SKILL" '`unsafe_environment_ownership`, and `execution_integrity` always prevent `PASS`'
require "$OPENAI" 'display_name: "Test Quality Review"'
require "$OPENAI" 'Use $test-quality-review'
require "$OPENAI" 'workflow_contract: "vulpora.test-quality-review/v1"'
require "$OPENAI" 'codex_entrypoints: ["$test-quality-review", "/skills selection"]'
require "$OPENAI" 'claude_code_entrypoint: "/test-quality-review"'
require "$OPENAI" '    - "test-authoring"'

if rg -n 'TST-[0-9]+ \|' "$SKILL" >/dev/null; then
  echo 'test-quality-review must reference, not redefine, TST rules' >&2
  exit 1
fi

node "$ROOT/tests/validator-contract.test.js"

printf '%s\n' '{"semantic_ac_key":"test_quality_review_contract","outcome":"pass","read_only":true,"tst_rules_referenced":true,"fresh_execution_fail_closed":true,"oracle_and_fault_evidence_required":true,"environment_ownership_required":true,"dirty_worktree_evidence_required":true}'
