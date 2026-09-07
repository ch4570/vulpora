#!/usr/bin/env bash
set -eu
set -o pipefail

DIR="$(cd "$(dirname "$0")" && pwd -P)"
SKILL="$(cd "$DIR/.." && pwd -P)/SKILL.md"
ROOT="$(cd "$DIR/../../.." && pwd -P)"
VALIDATOR="$ROOT/skills/test-quality-refactoring-workflow/scripts/validate-workflow-report.js"
OPENAI_YAML="$(dirname "$SKILL")/agents/openai.yaml"

for dependency in test-quality-review test-refactoring; do
  grep -Fq -- "- \`$dependency\`" "$SKILL"
  test -f "$ROOT/skills/$dependency/SKILL.md"
done
grep -Fq -- '- `agent:test-runner`' "$SKILL"
test -f "$ROOT/agents/test-runner.md"

dependency_count="$(sed -n '/^## Exact dependencies$/,/^## Input and non-goals$/p' "$SKILL" | grep -Ec '^- `[^`]+`$')"
test "$dependency_count" -eq 3

for required in \
  'vulpora.test-quality-workspace-baseline/v1' \
  'workflow_write_scope[]' \
  'USER_CHANGE_OVERLAP' \
  'AFFECTED_MODULE' \
  'mutation_capability' \
  'finding_routes[]' \
  'component_evidence[]' \
  'non-empty expected test symbols' \
  'workflow_owned_entries[]' \
  'non-symlink regular file' \
  'parses actual JUnit' \
  '`BLOCKED > INCONCLUSIVE > PARTIAL > PASS`' \
  'exactly unchanged' \
  'broad destructive cleanup'; do
  grep -Fq -- "$required" "$SKILL"
done

grep -Fq 'display_name: "Test Quality Refactoring Workflow"' "$OPENAI_YAML"
grep -Fq 'Use $test-quality-refactoring-workflow' "$OPENAI_YAML"
grep -Fq 'workflow_contract: "vulpora.test-quality-refactoring-workflow/v1"' "$OPENAI_YAML"
grep -Fq '  - "SKILL.md"' "$OPENAI_YAML"
grep -Fq '  - "scripts/validate-workflow-report.js"' "$OPENAI_YAML"
for dependency in test-quality-review test-refactoring agent:test-runner; do
  grep -Fq "  - \"$dependency\"" "$OPENAI_YAML"
done

node "$DIR/validator.test.js"
node "$DIR/artifact-contract.test.js"

if rg -n '\[(TODO|todo):|\[TODO' "$SKILL" "$OPENAI_YAML" "$VALIDATOR" >/dev/null; then
  echo 'test-quality-refactoring-workflow contains scaffold placeholders' >&2
  exit 1
fi

printf '{"outcome":"pass","workflow":"test-quality-refactoring-workflow","dependencies":3,"validator":"node-built-in","false_green_gates":12}\n'
