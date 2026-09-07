#!/usr/bin/env bash
set -eu
set -o pipefail

DIR="$(cd "$(dirname "$0")" && pwd -P)"
SKILL="$(cd "$DIR/.." && pwd -P)/SKILL.md"
ROOT="$(cd "$DIR/../../.." && pwd -P)"
OPENAI_YAML="$(dirname "$SKILL")/agents/openai.yaml"

for dependency in e2e-scenario-author e2e-runner playwright-e2e e2e-report-renderer; do
  grep -Fq -- "- \`$dependency\`" "$SKILL"
  test -f "$ROOT/skills/$dependency/SKILL.md"
done

dependency_count="$(sed -n '/^## Exact dependencies$/,/^## Input contract$/p' "$SKILL" \
  | grep -Ec '^- `[^`]+`$')"
test "$dependency_count" -eq 4

author_line="$(grep -n '^### 2\. Establish the catalog$' "$SKILL" | cut -d: -f1)"
owner_line="$(grep -n '^### 3\. Create one environment owner$' "$SKILL" | cut -d: -f1)"
execute_line="$(grep -n '^### 4\. Execute selected lanes once$' "$SKILL" | cut -d: -f1)"
cleanup_line="$(grep -n '^### 5\. Clean up and teardown exactly once$' "$SKILL" | cut -d: -f1)"
aggregate_line="$(grep -n '^### 6\. Aggregate without rewriting evidence$' "$SKILL" | cut -d: -f1)"
render_line="$(grep -n '^### 7\. Render only a settled explicit report$' "$SKILL" | cut -d: -f1)"
test "$author_line" -lt "$owner_line"
test "$owner_line" -lt "$execute_line"
test "$execute_line" -lt "$cleanup_line"
test "$cleanup_line" -lt "$aggregate_line"
test "$aggregate_line" -lt "$render_line"

grep -Fq 'one `environment.json`' "$SKILL"
grep -Fq 'same owner and teardown boundary' "$SKILL"
grep -Fq 'API and browser cases in parallel.' "$SKILL"
grep -Fq '`BLOCKED > INCONCLUSIVE > PARTIAL > PASS`' "$SKILL"
grep -Fq '`workflow_status=INCOMPLETE`' "$SKILL"
grep -Fq 'only for explicit report mode' "$SKILL"
grep -Fq 'does not render' "$SKILL"
grep -Fq '`test-report/browser-e2e/`' "$SKILL"

grep -Fq 'display_name: "E2E Test Workflow"' "$OPENAI_YAML"
grep -Fq 'Use $e2e-test-workflow' "$OPENAI_YAML"

if rg -n '\[(TODO|todo):|\[TODO' "$SKILL" "$OPENAI_YAML" >/dev/null; then
  echo 'e2e-test-workflow contains scaffold placeholders' >&2
  exit 1
fi

printf '{"outcome":"pass","workflow":"e2e-test-workflow","dependencies":4,"single_environment_owner":true,"false_green_safe":true,"renderer_explicit_only":true}\n'
