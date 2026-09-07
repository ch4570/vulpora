#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILL="$ROOT/SKILL.md"
ROUTES="$ROOT/references/routing-policy.md"
CONTRACT="$ROOT/references/artifact-contract.md"
OPENAI="$ROOT/agents/openai.yaml"

require() {
  local file="$1" text="$2"
  grep -Fq -- "$text" "$file" || { echo "missing '$text' in $file" >&2; exit 1; }
}

for file in "$SKILL" "$ROUTES" "$CONTRACT" "$OPENAI"; do
  test -s "$file"
done

require "$SKILL" 'name: visual-artifact-router'
require "$SKILL" '`document-designer` -> `markdown-publisher` -> `pdf-qa`'
require "$SKILL" '`mermaid-diagrams` -> `diagram-styler`'
require "$SKILL" '`Generate -> Render -> Inspect -> Fix -> Re-render`'
require "$SKILL" 'Do not silently substitute'
require "$SKILL" 'A failed or unavailable QA'
require "$SKILL" 'stage is a blocker, not a warning.'
require "$SKILL" 'Never discard editable sources'
require "$ROUTES" 'Do not make a diagram when a sentence or compact table is clearer.'
require "$ROUTES" 'Treat PDF QA as mandatory for PDF delivery.'
require "$ROUTES" 'installed `excalidraw-diagrams`'
require "$ROUTES" 'installed SVG architecture renderer'
require "$CONTRACT" 'A zero exit code proves generation,'
require "$CONTRACT" 'not visual quality.'
require "$CONTRACT" '`pass`:'
require "$CONTRACT" '`revise`:'
require "$CONTRACT" '`blocked`:'
require "$OPENAI" 'default_prompt: "Use $visual-artifact-router'

if grep -Fq '[TODO' "$SKILL" "$ROUTES" "$CONTRACT" "$OPENAI"; then
  echo 'unfinished template marker found' >&2
  exit 1
fi

echo 'visual-artifact-router contract: PASS'
