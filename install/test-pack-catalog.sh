#!/usr/bin/env bash
# Built-in capability-pack registry and selector contract.

set -eu
set -f
umask 077

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
INSTALL="$SCRIPT_DIR/install.sh"
UNINSTALL="$SCRIPT_DIR/uninstall.sh"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/vulpora-packs.XXXXXX")"
PACK_TEMP_PARENT="$(cd "$(dirname "$WORK")" && pwd -P)"
WORK="$(cd "$WORK" && pwd -P)"
cleanup() {
  case "$WORK" in "$PACK_TEMP_PARENT"/vulpora-packs.*) rm -rf "$WORK" ;; esac
}
trap cleanup EXIT HUP INT TERM
export VULPORA_STATE_HOME="$WORK/state"

mkdir -p "$WORK/core" "$WORK/jvm" "$WORK/postgres" "$WORK/shared" "$WORK/unknown" \
  "$WORK/standalone-agent" "$WORK/standalone-skill" "$WORK/explicit-removal" \
  "$WORK/codex product"

list_output="$(bash "$INSTALL" --list)"
printf '%s\n' "$list_output" | grep -Fq 'pack:core'
printf '%s\n' "$list_output" | grep -Fq 'pack:jvm-spring-postgres-opinionated'
printf '%s\n' "$list_output" | grep -Fq 'pack:qa-e2e'

bash "$INSTALL" -t "$WORK/core" --runtime claude-code --apply pack:core >/dev/null
test -f "$WORK/core/.claude/skills/vulpora-init/SKILL.md"
test -f "$WORK/core/.claude/skills/code-authoring-router/SKILL.md"
test ! -e "$WORK/core/.claude/skills/git-flow"
test ! -e "$WORK/core/.claude/skills/kotlin-code-authoring"
bash "$INSTALL" -t "$WORK/core" --runtime claude-code --verify pack:core >/dev/null

bash "$INSTALL" -t "$WORK/jvm" --runtime claude-code --apply pack:jvm-spring-postgres-opinionated >/dev/null
test -f "$WORK/jvm/.claude/skills/entity/SKILL.md"
test -f "$WORK/jvm/.claude/skills/repository/SKILL.md"
test -f "$WORK/jvm/.claude/skills/service/SKILL.md"
test -f "$WORK/jvm/.claude/skills/mapper/SKILL.md"
test -f "$WORK/jvm/.claude/skills/postgres-risk-check/SKILL.md"

bash "$INSTALL" -t "$WORK/postgres" --runtime claude-code --apply pack:postgres >/dev/null
test -f "$WORK/postgres/.claude/agents/postgres-dba.md"
test -f "$WORK/postgres/.claude/agents/data-modeling-reviewer.md"
test -f "$WORK/postgres/.claude/skills/postgres-query-review/SKILL.md"
bash "$UNINSTALL" -t "$WORK/postgres" --runtime claude-code --apply pack:postgres >/dev/null
test ! -e "$WORK/postgres/.claude/agents/postgres-dba.md"
test ! -e "$WORK/postgres/.claude/agents/data-modeling-reviewer.md"
test ! -e "$WORK/postgres/.claude/skills/postgres-query-review"
test ! -e "$WORK/postgres/.vulpora"

bash "$INSTALL" -t "$WORK/shared" --runtime claude-code --apply pack:core pack:orchestration >/dev/null
bash "$UNINSTALL" -t "$WORK/shared" --runtime claude-code --apply pack:core >/dev/null
test ! -e "$WORK/shared/.claude/skills/vulpora-init"
test -f "$WORK/shared/.claude/skills/code-authoring-router/SKILL.md"
bash "$INSTALL" -t "$WORK/shared" --runtime claude-code --verify pack:orchestration >/dev/null
bash "$UNINSTALL" -t "$WORK/shared" --runtime claude-code --apply pack:orchestration >/dev/null
test ! -e "$WORK/shared/.vulpora"

# A standalone orchestrator is not a complete orchestration pack, but its
# router dependency must survive removal of the unrelated core pack.
bash "$INSTALL" -t "$WORK/standalone-agent" --runtime claude-code --apply pack:core task-orchestrator >/dev/null
bash "$UNINSTALL" -t "$WORK/standalone-agent" --runtime claude-code --apply pack:core >/dev/null
test ! -e "$WORK/standalone-agent/.claude/skills/vulpora-init"
bash "$INSTALL" -t "$WORK/standalone-agent" --runtime claude-code --verify task-orchestrator >/dev/null

# The same protection applies to a retained standalone skill's transitive
# dependency, even when no complete JVM pack remains installed.
bash "$INSTALL" -t "$WORK/standalone-skill" --runtime claude-code --apply pack:jvm-spring test-refactoring >/dev/null
bash "$UNINSTALL" -t "$WORK/standalone-skill" --runtime claude-code --apply pack:jvm-spring >/dev/null
test ! -e "$WORK/standalone-skill/.claude/skills/java-spring-review-workflow"
bash "$INSTALL" -t "$WORK/standalone-skill" --runtime claude-code --verify test-refactoring >/dev/null

# Explicitly removing both the pack and its standalone dependent must not
# leave their former dependency behind just because that dependent existed.
bash "$INSTALL" -t "$WORK/explicit-removal" --runtime claude-code --apply pack:core task-orchestrator >/dev/null
bash "$UNINSTALL" -t "$WORK/explicit-removal" --runtime claude-code --apply pack:core task-orchestrator >/dev/null
test ! -e "$WORK/explicit-removal/.vulpora"

# Agent bundle and skill dependency references resolve to separate Codex roots,
# including workspace paths with spaces, and installed verification agrees.
bash "$INSTALL" -t "$WORK/codex product" --runtime codex --apply pack:product >/dev/null
codex_ux="$WORK/codex product/.codex/agents/ux-designer.toml"
test -f "$WORK/codex product/.agents/skills/product-ui-design/SKILL.md"
grep -Fq "$WORK/codex product/.agents/skills/product-ui-design/SKILL.md" "$codex_ux"
grep -Fq "$WORK/codex product/.codex/agents/ux-designer/SOUL.md" "$codex_ux"
if grep -Fq "$WORK/codex product/.codex/skills/" "$codex_ux"; then
  echo 'Codex skill dependency was rendered under the agent root' >&2
  exit 1
fi
bash "$INSTALL" -t "$WORK/codex product" --runtime codex --verify pack:product >/dev/null

if bash "$INSTALL" -t "$WORK/unknown" --runtime claude-code --apply pack:not-a-pack >/dev/null 2>&1; then
  echo 'unknown pack was accepted' >&2
  exit 1
fi
test -z "$(find "$WORK/unknown" -mindepth 1 -print -quit)"

bash "$UNINSTALL" -t "$WORK/core" --runtime claude-code --apply pack:core >/dev/null
test ! -e "$WORK/core/.claude/skills/vulpora-init"
test ! -e "$WORK/core/.claude/skills/code-authoring-router"

printf 'capability pack catalog: PASS\n'
