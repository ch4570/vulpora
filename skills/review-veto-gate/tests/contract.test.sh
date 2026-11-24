#!/usr/bin/env bash
set -eu
set -o pipefail

DIR="$(cd "$(dirname "$0")" && pwd -P)"
SKILL_DIR="$(cd "$DIR/.." && pwd -P)"
ROOT="$(cd "$SKILL_DIR/../.." && pwd -P)"
SKILL="$SKILL_DIR/SKILL.md"

# Package shape: one skill, observation only.
test "$(sed -n 's/^name: //p' "$SKILL" | head -1)" = "review-veto-gate"
test "$(awk '/^---$/{n++} n==1 && /^[a-z_]+:/{print $1}' "$SKILL" | tr -d ':' | sort | tr '\n' ' ')" = "description name "
test "$(wc -l < "$SKILL")" -lt 500
grep -Fq 'reference/principles.md' "$SKILL"
grep -Fq 'reference/kb/INDEX.md' "$SKILL"
grep -Fq 'never changing a verdict' "$SKILL"
grep -Fq 'the `veto` mode does not exist yet' "$SKILL"
grep -Fq 'is not a review pass' "$SKILL"
grep -Fq '`isolation_verified: true`' "$SKILL"

# Every KB topic has frontmatter, a review hook, and an INDEX route.
for kb in "$SKILL_DIR"/reference/kb/*.md; do
  name="$(basename "$kb")"
  [ "$name" = "INDEX.md" ] && continue
  head -1 "$kb" | grep -Fxq -- '---'
  for key in title source last_fetched skills; do grep -q "^$key:" "$kb"; done
  grep -Fq '## 리뷰 훅' "$kb"
  grep -Fq "($name)" "$SKILL_DIR/reference/kb/INDEX.md"
done

# The post-processing step is wired into four review workflows (not the security scan workflow, whose installed set is pinned to its canonical auditor) without adding a pass.
for workflow in java-spring-review-workflow kotlin-spring-review-workflow backend-code-review-workflow architecture-review-workflow; do
  workflow_skill="$ROOT/skills/$workflow/SKILL.md"
  grep -Fq '`review-veto-gate`' "$workflow_skill"
  grep -Fq 'not a pass' "$workflow_skill"
  grep -Eq "^skill \| $workflow \|.*\breview-veto-gate\b" "$ROOT/install/manifest.txt"
done
grep -Eq '^skill \| review-veto-gate \| skills/review-veto-gate \| - \| - \| -$' "$ROOT/install/manifest.txt"

# The reviewer agents emit the fields the ledger needs, and their severity rules are untouched.
for agent in java-reviewer kotlin-spring-reviewer security-auditor architecture-reviewer; do
  grep -Fq '`repro_attempt`' "$ROOT/agents/$agent.md"
  grep -Fq '`contract_source`' "$ROOT/agents/$agent.md"
  grep -Fq '`cause_key`' "$ROOT/agents/$agent.md"
done

node --test "$SKILL_DIR/tests/review-gate.test.js" >/dev/null
# The security workflow keeps its exact dependency binding: it must not depend on the gate.
! grep -Fq 'review-veto-gate' "$ROOT/skills/security-scan-workflow/SKILL.md"
grep -Eq '^skill \| security-scan-workflow \| skills/security-scan-workflow \| - \| agent:security-auditor \| -$' "$ROOT/install/manifest.txt"

printf '{"outcome":"pass","skill":"review-veto-gate","verdict_impact":"none","veto_mode_refused":true,"workflows_wired":4}\n'
