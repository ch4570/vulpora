#!/bin/bash
# Regression suite for the fixed fail-closed Codex agent compatibility entry.

set -u
set -f

PATH='/usr/bin:/bin:/usr/sbin:/sbin'
export PATH

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd -P)"
RUNNER="$REPO_ROOT/skills/codex-agent-runtime/scripts/run_agent.sh"
INSTALL="$REPO_ROOT/install/install.sh"
WORK="$(mktemp -d /tmp/codex-agent-runtime-test.XXXXXX)"
trap 'rm -rf "$WORK"' EXIT

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

mkdir -p "$WORK/home" "$WORK/project" "$WORK/bin"

output="$(bash "$RUNNER" --help 2>&1)"; rc=$?
result=1
[ "$rc" -eq 69 ] && [ "$output" = AGENT_RUNTIME_ERROR:project_execution_disabled ] && result=0
record 'compatibility entry is fail-closed even for help probes' "$result"

cat > "$WORK/bin/codex" <<EOF
#!/bin/bash
printf executed > "$WORK/external-cli-ran"
EOF
chmod 755 "$WORK/bin/codex"

output="$(cd "$WORK/project" && PATH="$WORK/bin:/usr/bin:/bin" CODEX_BIN="$WORK/bin/codex" \
  bash "$RUNNER" --agent java-reviewer --discovery-probe 2>&1)"; rc=$?
result=1
if [ "$rc" -eq 69 ] && [ "$output" = AGENT_RUNTIME_ERROR:project_execution_disabled ] \
  && [ ! -e "$WORK/external-cli-ran" ]; then result=0; fi
record 'discovery probe is fixed fail-closed with zero CLI execution' "$result"

output="$(printf 'review this project\n' | (cd "$WORK/project" && \
  PATH="$WORK/bin:/usr/bin:/bin" bash "$RUNNER" --agent java-reviewer) 2>&1)"; rc=$?
result=1
if [ "$rc" -eq 69 ] && [ "$output" = AGENT_RUNTIME_ERROR:project_execution_disabled ] \
  && [ ! -e "$WORK/external-cli-ran" ]; then result=0; fi
record 'normal agent task is fixed fail-closed with zero project access' "$result"

HOME="$WORK/home" bash "$INSTALL" -t "$WORK/home" --runtime codex --apply codex-agent-runtime \
  >"$WORK/install.out" 2>&1
rc=$?
result=1
if [ "$rc" -eq 0 ] \
  && [ -f "$WORK/home/.agents/skills/codex-agent-runtime/SKILL.md" ] \
  && [ -f "$WORK/home/.agents/skills/codex-agent-runtime/scripts/run_agent.sh" ] \
  && [ ! -e "$WORK/home/.codex/agents" ] \
  && grep -Fq '.agents/skills/codex-agent-runtime' \
       "$WORK/home/.vulpora/receipts/v1/codex.tsv"; then result=0; fi
record 'Codex setup installs only the fail-closed compatibility skill' "$result"

output="$(PATH="$WORK/bin:/usr/bin:/bin" \
  bash "$WORK/home/.agents/skills/codex-agent-runtime/scripts/run_agent.sh" \
    --agent java-reviewer --discovery-probe 2>&1)"; rc=$?
result=1
if [ "$rc" -eq 69 ] && [ "$output" = AGENT_RUNTIME_ERROR:project_execution_disabled ] \
  && [ ! -e "$WORK/external-cli-ran" ]; then result=0; fi
record 'copied compatibility entry cannot self-authorize execution' "$result"

printf '\nPASS=%s FAIL=%s\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
