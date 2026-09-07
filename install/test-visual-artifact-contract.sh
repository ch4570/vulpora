#!/usr/bin/env bash
# End-to-end contract for the visual artifact skill pipeline.

set -euo pipefail
set -f

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"

for skill in \
  visual-artifact-router \
  document-designer \
  markdown-publisher \
  pdf-qa \
  mermaid-diagrams \
  diagram-styler; do
  test -f "$REPO_ROOT/skills/$skill/SKILL.md"
  test -f "$REPO_ROOT/skills/$skill/agents/openai.yaml"
done

bash "$REPO_ROOT/skills/visual-artifact-router/tests/contract.test.sh"
bash "$REPO_ROOT/skills/document-designer/tests/contract.test.sh"
bash "$REPO_ROOT/skills/markdown-publisher/tests/contract.test.sh"
bash "$REPO_ROOT/skills/pdf-qa/tests/contract.test.sh"
bash "$REPO_ROOT/skills/mermaid-diagrams/tests/contract.test.sh"
bash "$REPO_ROOT/skills/diagram-styler/tests/contract.test.sh"

node "$REPO_ROOT/skills/markdown-publisher/scripts/render-pdf.mjs" --preflight >/dev/null
python3 "$REPO_ROOT/skills/pdf-qa/scripts/preflight.py" >/dev/null

preflight="$(
  node "$REPO_ROOT/skills/diagram-styler/scripts/render-mermaid.js" --preflight
)"
printf '%s\n' "$preflight" | grep -Eq '"available":[[:space:]]*(true|false)'
printf '%s\n' "$preflight" | grep -Fq '"runtime_download_allowed": false'

if rg -n 'https?://|npx[[:space:]]|npm[[:space:]]+(install|add)|curl[[:space:]]' \
  "$REPO_ROOT/skills/markdown-publisher/scripts" \
  "$REPO_ROOT/skills/pdf-qa/scripts" \
  "$REPO_ROOT/skills/diagram-styler/scripts" >/dev/null; then
  printf 'visual artifact contract: runtime network or install command found\n' >&2
  exit 1
fi

printf 'visual artifact contract: PASS\n'
