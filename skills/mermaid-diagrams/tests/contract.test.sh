#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILL="$ROOT/SKILL.md"
OPENAI="$ROOT/agents/openai.yaml"

require() {
  local file="$1" text="$2"
  grep -Fq -- "$text" "$file" || { echo "missing '$text' in $file" >&2; exit 1; }
}

test -s "$SKILL"
test -s "$OPENAI"

require "$SKILL" 'name: mermaid-diagrams'
require "$SKILL" 'prose, bullets, or a table'
require "$SKILL" 'flowchart'
require "$SKILL" 'sequenceDiagram'
require "$SKILL" 'stateDiagram-v2'
require "$SKILL" 'erDiagram'
require "$SKILL" 'classDiagram'
require "$SKILL" 'Do not encode palette, fonts, page width, or export settings'
require "$SKILL" 'Route rendering to the `diagram-styler` skill'
require "$SKILL" 'route the final PDF to the `pdf-qa` skill'
require "$OPENAI" 'default_prompt: "Use $mermaid-diagrams'

for reference in selection flowchart sequence state er class architecture; do
  test -s "$ROOT/references/$reference.md"
done

if grep -Fq '[TODO' "$SKILL"; then
  echo 'unfinished template marker found' >&2
  exit 1
fi

echo 'mermaid-diagrams contract: PASS'
