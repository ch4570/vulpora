#!/usr/bin/env bash
# Offline native-rendering and ownership smoke tests for the product pack.
set -euo pipefail
set -f
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/vulpora-product-pack.XXXXXX")"
WORK="$(cd "$WORK" && pwd -P)"
trap 'rm -rf "$WORK"' EXIT HUP INT TERM
export VULPORA_STATE_HOME="$WORK/state"
for runtime in codex claude-code opencode; do
  target="$WORK/$runtime"
  mkdir -p "$target"
  bash "$SCRIPT_DIR/install.sh" -t "$target" --runtime "$runtime" --apply pack:product >/dev/null
  bash "$SCRIPT_DIR/install.sh" -t "$target" --runtime "$runtime" --verify pack:product >/dev/null
  case "$runtime" in
    codex) agent_dir="$target/.codex/agents"; skill_dir="$target/.agents/skills" ;;
    claude-code) agent_dir="$target/.claude/agents"; skill_dir="$target/.claude/skills" ;;
    opencode) agent_dir="$target/.opencode/agents"; skill_dir="$target/.opencode/skills" ;;
  esac
  for id in product-planner ux-designer design-reviewer; do
    test -f "$agent_dir/$id.md"
    test -f "$agent_dir/$id/SOUL.md"
    test -f "$agent_dir/$id/reference/kb/INDEX.md"
  done
  test -f "$skill_dir/product-ui-design/SKILL.md"
  if [ "$runtime" = codex ]; then
    grep -Fq "$skill_dir/product-ui-design/SKILL.md" "$agent_dir/ux-designer.toml"
    grep -Fq 'sandbox_mode = "read-only"' "$agent_dir/ux-designer.toml"
    grep -Fq 'sandbox_mode = "read-only"' "$agent_dir/design-reviewer.toml"
  fi
  if [ "$runtime" = opencode ]; then
    grep -Fq '  bash: deny' "$agent_dir/product-planner.md"
    grep -Fq '    "*.env": deny' "$agent_dir/product-planner.md"
    grep -Fq '  edit: deny' "$agent_dir/ux-designer.md"
    grep -Fq '  task: deny' "$agent_dir/ux-designer.md"
  fi
  bash "$SCRIPT_DIR/uninstall.sh" -t "$target" --runtime "$runtime" --apply pack:product >/dev/null
  test ! -e "$agent_dir/product-planner.md"
  test ! -e "$agent_dir/ux-designer.md"
  test ! -e "$agent_dir/design-reviewer.md"
  test ! -e "$skill_dir/product-ui-design"
done

target="$WORK/hooks"
mkdir -p "$target"
bash "$SCRIPT_DIR/install.sh" -t "$target" --runtime codex --apply githooks >/dev/null
test -f "$target/.githooks/pre-commit"
test -f "$target/scripts/agent-memory-gate.sh"
bash "$SCRIPT_DIR/install.sh" -t "$target" --runtime codex --verify githooks >/dev/null
printf 'product pack and hook dependency rendering: PASS (offline; no native agents invoked)\n'
