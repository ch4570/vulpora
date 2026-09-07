#!/bin/bash
# Catalog setup and receipt-safe uninstall regressions.

set -u
set -f
umask 077

PATH='/usr/bin:/bin:/usr/sbin:/sbin'
export PATH

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"
CLI="$REPO_ROOT/vulpora"
RECEIPT_LIB="$SCRIPT_DIR/receipt-lib.sh"
WORK="$(mktemp -d /tmp/vulpora-uninstall-test.XXXXXX)"
WORK="$(cd "$WORK" && pwd -P)"
trap 'rm -rf "$WORK"' EXIT
export VULPORA_STATE_HOME="$WORK/state"
mkdir -p "$VULPORA_STATE_HOME"

pass=0
fail=0
record() {
  if [ "$2" -eq 0 ]; then
    printf '  ✓ %s\n' "$1"
    pass=$((pass + 1))
  else
    printf '  ✗ %s\n' "$1"
    fail=$((fail + 1))
  fi
}

setup_catalog() { # target runtime
  HOME="$1" CODEX_HOME= bash "$CLI" setup --scope user --runtime "$2" \
    --target "$1" test-runner >/dev/null 2>&1
}

uninstall_target() { # target runtime [dry]
  if [ "${3:-}" = dry ]; then
    HOME="$1" CODEX_HOME= bash "$CLI" uninstall --scope user --runtime "$2" \
      --target "$1" --dry-run
  else
    HOME="$1" CODEX_HOME= bash "$CLI" uninstall --scope user --runtime "$2" \
      --target "$1"
  fi
}

make_legacy_fixture() { # target runtime
  target="$1"
  runtime="$2"
  mkdir -p "$target/.agents/skills/test-authoring"
  printf 'legacy-data\n' > "$target/.agents/skills/test-authoring/SKILL.md"
  HOME="$target" bash -c \
    '. "$1"; receipt_record_path "$2" "$3" .agents/skills/test-authoring "$2/.agents/skills/test-authoring"' \
    _ "$RECEIPT_LIB" "$target" "$runtime"
}

FRESH="$WORK/fresh"
mkdir -p "$FRESH"
setup_catalog "$FRESH" codex; setup_rc=$?
result=1
if [ "$setup_rc" -eq 0 ] \
  && [ -f "$FRESH/.codex/agents/test-runner.toml" ] \
  && [ -f "$FRESH/.vulpora/receipts/v1/codex.tsv" ]; then result=0; fi
record 'fresh Codex setup installs the selected agent and receipt' "$result"

mkdir -p "$FRESH/.agents/skills/company-skill"
printf 'stale metadata\n' > "$FRESH/.vulpora/retired-state"
printf 'company agent\n' > "$FRESH/.codex/agents/company-agent.toml"
printf 'company skill\n' > "$FRESH/.agents/skills/company-skill/SKILL.md"

output="$(uninstall_target "$FRESH" codex dry 2>&1)"; rc=$?
result=1
if [ "$rc" -eq 0 ] \
  && printf '%s\n' "$output" | grep -Fq 'remove: .codex/agents/test-runner.toml' \
  && [ -f "$FRESH/.codex/agents/test-runner.toml" ]; then result=0; fi
record 'catalog uninstall dry-run plans removal without mutation' "$result"

output="$(uninstall_target "$FRESH" codex 2>&1)"; rc=$?
result=1
if [ "$rc" -eq 0 ] && printf '%s\n' "$output" | grep -Fq 'uninstall_complete: codex' \
  && [ ! -e "$FRESH/.codex/agents/test-runner.toml" ] \
  && [ -d "$FRESH/.codex/agents" ] \
  && grep -Fq 'company agent' "$FRESH/.codex/agents/company-agent.toml" \
  && grep -Fq 'company skill' "$FRESH/.agents/skills/company-skill/SKILL.md" \
  && [ ! -e "$FRESH/.vulpora" ]; then result=0; fi
record 'catalog uninstall removes Vulpora state but preserves runtime folders and foreign assets' "$result"

output="$(uninstall_target "$FRESH" codex 2>&1)"; rc=$?
result=1
if [ "$rc" -eq 0 ] && printf '%s\n' "$output" | grep -Fq nothing_installed; then result=0; fi
record 'catalog uninstall is idempotent after removal' "$result"

MULTI_RUNTIME="$WORK/multi-runtime"
mkdir -p "$MULTI_RUNTIME"
setup_catalog "$MULTI_RUNTIME" codex
setup_catalog "$MULTI_RUNTIME" claude-code
output="$(uninstall_target "$MULTI_RUNTIME" codex 2>&1)"; rc=$?
result=1
if [ "$rc" -eq 0 ] \
  && [ ! -e "$MULTI_RUNTIME/.codex/agents/test-runner.toml" ] \
  && [ -f "$MULTI_RUNTIME/.claude/agents/test-runner.md" ] \
  && [ -f "$MULTI_RUNTIME/.vulpora/receipts/v1/claude-code.tsv" ]; then result=0; fi
record 'one runtime uninstall preserves another runtime receipt and assets' "$result"

output="$(uninstall_target "$MULTI_RUNTIME" claude-code 2>&1)"; rc=$?
result=1
if [ "$rc" -eq 0 ] \
  && [ ! -e "$MULTI_RUNTIME/.claude/agents/test-runner.md" ] \
  && [ -d "$MULTI_RUNTIME/.claude/agents" ] \
  && [ ! -e "$MULTI_RUNTIME/.vulpora" ]; then result=0; fi
record 'last runtime uninstall removes Vulpora metadata only' "$result"

SELECTIVE="$WORK/selective"
mkdir -p "$SELECTIVE"
HOME="$SELECTIVE" CODEX_HOME= bash "$CLI" setup --scope user --runtime codex \
  --target "$SELECTIVE" kotlin-spring-reviewer test-runner test-authoring >/dev/null 2>&1
setup_rc=$?
output="$(HOME="$SELECTIVE" CODEX_HOME= bash "$CLI" uninstall --scope user --runtime codex \
  --target "$SELECTIVE" --dry-run test-runner 2>&1)"; dry_rc=$?
result=1
if [ "$setup_rc" -eq 0 ] && [ "$dry_rc" -eq 0 ] \
  && printf '%s\n' "$output" | grep -Fq 'remove: .codex/agents/test-runner.toml' \
  && printf '%s\n' "$output" | grep -Fq 'kept_unselected: .codex/agents/kotlin-spring-reviewer.toml' \
  && [ -f "$SELECTIVE/.codex/agents/test-runner.toml" ]; then result=0; fi
record 'selected uninstall dry-run separates selected and retained agents' "$result"

output="$(HOME="$SELECTIVE" CODEX_HOME= bash "$CLI" uninstall --scope user --runtime codex \
  --target "$SELECTIVE" test-runner 2>&1)"; rc=$?
result=1
if [ "$rc" -eq 0 ] \
  && [ ! -e "$SELECTIVE/.codex/agents/test-runner.toml" ] \
  && [ -f "$SELECTIVE/.codex/agents/kotlin-spring-reviewer.toml" ] \
  && [ -f "$SELECTIVE/.agents/skills/test-authoring/SKILL.md" ] \
  && grep -Fq '.codex/agents/kotlin-spring-reviewer.toml' \
       "$SELECTIVE/.vulpora/receipts/v1/codex.tsv" \
  && ! grep -Fq '.codex/agents/test-runner.toml' \
       "$SELECTIVE/.vulpora/receipts/v1/codex.tsv"; then result=0; fi
record 'selected uninstall removes one agent and retains receipt ownership for the rest' "$result"

output="$(HOME="$SELECTIVE" CODEX_HOME= bash "$CLI" uninstall --scope user --runtime codex \
  --target "$SELECTIVE" --dry-run test-authoring 2>&1)"; dry_rc=$?
result=1
if [ "$dry_rc" -eq 0 ] \
  && printf '%s\n' "$output" | grep -Fq 'remove: .agents/skills/test-authoring' \
  && printf '%s\n' "$output" | grep -Fq 'kept_unselected: .codex/agents/kotlin-spring-reviewer.toml' \
  && [ -f "$SELECTIVE/.agents/skills/test-authoring/SKILL.md" ]; then result=0; fi
record 'selected uninstall dry-run separates a skill from retained agents' "$result"

output="$(HOME="$SELECTIVE" CODEX_HOME= bash "$CLI" uninstall --scope user --runtime codex \
  --target "$SELECTIVE" test-authoring 2>&1)"; rc=$?
result=1
if [ "$rc" -eq 0 ] \
  && [ ! -e "$SELECTIVE/.agents/skills/test-authoring" ] \
  && [ -f "$SELECTIVE/.codex/agents/kotlin-spring-reviewer.toml" ] \
  && ! grep -Fq '.agents/skills/test-authoring' \
       "$SELECTIVE/.vulpora/receipts/v1/codex.tsv"; then result=0; fi
record 'selected uninstall removes one skill and retains installed agents' "$result"

output="$(HOME="$SELECTIVE" CODEX_HOME= bash "$CLI" uninstall --scope user --runtime codex \
  --target "$SELECTIVE" unknown-agent 2>&1)"; rc=$?
result=1
if [ "$rc" -ne 0 ] && printf '%s\n' "$output" | grep -Fq '알 수 없는 에이전트' \
  && [ -f "$SELECTIVE/.codex/agents/kotlin-spring-reviewer.toml" ]; then result=0; fi
record 'unknown uninstall selector fails before deleting retained agents' "$result"

FORGED="$WORK/forged"
mkdir -p "$FORGED/.vulpora/receipts/v1" "$FORGED/.agents/skills/test-authoring"
printf '.agents/skills/test-authoring\n' > "$FORGED/.vulpora/receipts/v1/codex.tsv"
printf 'user-data\n' > "$FORGED/.agents/skills/test-authoring/SKILL.md"
output="$(uninstall_target "$FORGED" codex 2>&1)"; rc=$?
result=1
if [ "$rc" -ne 0 ] && printf '%s\n' "$output" | grep -Fq untrusted_receipt_provenance \
  && grep -Fq user-data "$FORGED/.agents/skills/test-authoring/SKILL.md"; then result=0; fi
record 'forged target-local receipt cannot authorize deletion' "$result"

LEGACY="$WORK/legacy"
mkdir -p "$LEGACY"
make_legacy_fixture "$LEGACY" codex; fixture_rc=$?
asset_before="$(cksum "$LEGACY/.agents/skills/test-authoring/SKILL.md")"
receipt_before="$(cksum "$LEGACY/.vulpora/receipts/v1/codex.tsv")"
output="$(uninstall_target "$LEGACY" codex dry 2>&1)"; dry_rc=$?
result=1
if [ "$fixture_rc" -eq 0 ] && [ "$dry_rc" -eq 0 ] \
  && printf '%s\n' "$output" | grep -Fq 'remove: .agents/skills/test-authoring' \
  && [ "$(cksum "$LEGACY/.agents/skills/test-authoring/SKILL.md")" = "$asset_before" ] \
  && [ "$(cksum "$LEGACY/.vulpora/receipts/v1/codex.tsv")" = "$receipt_before" ]; then result=0; fi
record 'valid legacy receipt dry-run plans removal without mutation' "$result"

output="$(uninstall_target "$LEGACY" codex 2>&1)"; rc=$?
result=1
if [ "$rc" -eq 0 ] && printf '%s\n' "$output" | grep -Fq 'uninstall_complete: codex' \
  && [ ! -e "$LEGACY/.agents/skills/test-authoring" ] \
  && [ -d "$LEGACY/.agents/skills" ] \
  && [ ! -e "$LEGACY/.vulpora/receipts/v1/codex.tsv" ]; then result=0; fi
record 'valid legacy receipt removes only its owned skill and preserves the skills root' "$result"

MODIFIED="$WORK/modified"
mkdir -p "$MODIFIED"
make_legacy_fixture "$MODIFIED" codex
printf 'operator-change\n' >> "$MODIFIED/.agents/skills/test-authoring/SKILL.md"
output="$(uninstall_target "$MODIFIED" codex 2>&1)"; rc=$?
result=1
if [ "$rc" -eq 3 ] && printf '%s\n' "$output" | grep -Fq preserved_modified \
  && grep -Fq operator-change "$MODIFIED/.agents/skills/test-authoring/SKILL.md" \
  && [ -f "$MODIFIED/.vulpora/receipts/v1/codex.tsv" ]; then result=0; fi
record 'modified legacy path is preserved with partial status' "$result"

TAMPER="$WORK/tamper"
mkdir -p "$TAMPER"
make_legacy_fixture "$TAMPER" codex
printf '../victim\n' >> "$TAMPER/.vulpora/receipts/v1/codex.tsv"
printf 'keep\n' > "$TAMPER/victim"
output="$(uninstall_target "$TAMPER" codex 2>&1)"; rc=$?
result=1
if [ "$rc" -ne 0 ] && grep -Fq keep "$TAMPER/victim" \
  && [ -d "$TAMPER/.agents/skills/test-authoring" ]; then result=0; fi
record 'tampered legacy receipt fails before deleting any path' "$result"

SYMLINK_STORE="$WORK/symlink-store"
OUTSIDE="$WORK/outside-store"
mkdir -p "$SYMLINK_STORE" "$OUTSIDE"
ln -s "$OUTSIDE" "$SYMLINK_STORE/.vulpora"
output="$(uninstall_target "$SYMLINK_STORE" codex 2>&1)"; rc=$?
result=1
if [ "$rc" -ne 0 ] && printf '%s\n' "$output" | grep -Fq unsafe_receipt_store; then result=0; fi
record 'symlinked receipt store fails closed' "$result"

UNOWNED="$WORK/unowned-current"
mkdir -p "$UNOWNED/.codex/agents"
printf 'unowned\n' > "$UNOWNED/.codex/agents/test-runner.toml"
output="$(HOME="$UNOWNED" bash "$CLI" setup --scope user --runtime codex \
  --target "$UNOWNED" test-runner 2>&1)"; rc=$?
result=1
if [ "$rc" -ne 0 ] && printf '%s\n' "$output" | grep -Fq existing_path_conflict \
  && grep -Fq unowned "$UNOWNED/.codex/agents/test-runner.toml"; then result=0; fi
record 'setup blocks and preserves an unowned existing discovery path' "$result"

printf '결과: PASS=%s FAIL=%s\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
