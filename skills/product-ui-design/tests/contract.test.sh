#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT/../.." && pwd)"

for file in \
  "$ROOT/SKILL.md" \
  "$ROOT/agents/openai.yaml" \
  "$ROOT/references/anti-slop.md" \
  "$ROOT/references/quality-gates.md"; do
  test -s "$file"
done

grep -Fq 'name: product-ui-design' "$ROOT/SKILL.md"
grep -Fq '[anti-slop.md](references/anti-slop.md)' "$ROOT/SKILL.md"
grep -Fq '[quality-gates.md](references/quality-gates.md)' "$ROOT/SKILL.md"
grep -Fq 'visual verification: NOT_RUN' "$ROOT/SKILL.md"
grep -Fq 'A style catalog or generated design-system suggestion is input to evaluate' "$ROOT/SKILL.md"
grep -Fq 'Could this screen belong to an unrelated product' "$ROOT/references/anti-slop.md"
grep -Fq '`visual verification: PASS | REVISE | NOT_RUN`' "$ROOT/references/quality-gates.md"
grep -Fq 'default_prompt: "Use $product-ui-design' "$ROOT/agents/openai.yaml"
grep -Eq '^skill[[:space:]]*\|[[:space:]]*product-ui-design[[:space:]]*\|' "$REPO_ROOT/install/manifest.txt"
grep -Eq '^product-ui-design[[:space:]]*\|' "$REPO_ROOT/install/skill-catalog.txt"

if grep -Fq '[TODO' "$ROOT/SKILL.md" "$ROOT/agents/openai.yaml" "$ROOT"/references/*.md; then
  echo 'unfinished template marker found' >&2
  exit 1
fi

echo 'product-ui-design contract: PASS'
