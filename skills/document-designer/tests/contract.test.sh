#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILL="$ROOT/SKILL.md"
OPENAI="$ROOT/agents/openai.yaml"

require() {
  local file="$1" text="$2"
  grep -Fq -- "$text" "$file" || { echo "missing '$text' in $file" >&2; exit 1; }
}

for file in \
  "$SKILL" \
  "$OPENAI" \
  "$ROOT/references/typography.md" \
  "$ROOT/references/page-layout.md" \
  "$ROOT/references/tables-and-callouts.md" \
  "$ROOT/references/design-tokens.md"; do
  test -s "$file"
done

require "$SKILL" 'name: document-designer'
require "$SKILL" 'Create or revise `source.md` as the semantic source of truth.'
require "$SKILL" 'Create `document-design.yaml` beside the source'
require "$SKILL" 'Do not render HTML or PDF here.'
require "$SKILL" 'bundle or fetch fonts without explicit authorization.'
require "$SKILL" 'Prefer a short table for repeated-field comparisons'
require "$SKILL" 'no fact was introduced without a source.'
require "$ROOT/references/typography.md" 'For Korean, require a local'
require "$ROOT/references/page-layout.md" 'Never insert repeated blank lines'
require "$ROOT/references/tables-and-callouts.md" 'not for paragraph layout.'
require "$ROOT/references/design-tokens.md" '`source.md` must not contain that mapping.'
require "$OPENAI" 'default_prompt: "Use $document-designer'

if grep -Fq '[TODO' "$SKILL" "$OPENAI" "$ROOT"/references/*.md; then
  echo 'unfinished template marker found' >&2
  exit 1
fi

echo 'document-designer contract: PASS'
