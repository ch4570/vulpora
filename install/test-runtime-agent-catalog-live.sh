#!/bin/bash
# Opt-in smoke test for the catalogs installed in the real user runtimes.

set -u
set -f

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"
MANIFEST="$SCRIPT_DIR/manifest.txt"
runtime=all

usage() { printf '%s\n' 'Usage: test-runtime-agent-catalog-live.sh [--runtime codex|claude-code|all]'; }
while [ "$#" -gt 0 ]; do
  case "$1" in
    --runtime) [ "$#" -ge 2 ] || { usage >&2; exit 2; }; runtime="$2"; shift 2 ;;
    --runtime=*) runtime="${1#--runtime=}"; shift ;;
    --deadline-seconds) [ "$#" -ge 2 ] || { usage >&2; exit 2; }; shift 2 ;;
    --deadline-seconds=*) shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; exit 2 ;;
  esac
done
case "$runtime" in codex|claude-code|all) ;; *) usage >&2; exit 2 ;; esac

WORK="$(mktemp -d "${TMPDIR:-/tmp}/vulpora-runtime-live.XXXXXX")" || exit 1
trap 'rm -rf "$WORK"' EXIT HUP INT TERM
pass=0
fail=0

manifest_count() {
  awk -F'|' -v wanted="$1" '
    /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
    { gsub(/^[[:space:]]+|[[:space:]]+$/, "", $1); if ($1 == wanted) count++ }
    END { print count + 0 }
  ' "$MANIFEST"
}
manifest_ids() {
  awk -F'|' -v wanted="$1" '
    /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
    {
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", $1)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", $2)
      if ($1 == wanted) print $2
    }
  ' "$MANIFEST"
}
expected_agents="$(manifest_count agent)"
expected_skills="$(manifest_count skill)"

record() {
  if [ "$2" -eq 0 ]; then
    printf '  ✓ %s\n' "$1"
    pass=$((pass + 1))
  else
    printf '  ✗ %s\n' "$1"
    fail=$((fail + 1))
  fi
}

run_codex() {
  installed_agents=0
  command -v codex >/dev/null 2>&1 || { record 'Codex CLI is installed' 1; return; }
  for id in $(manifest_ids agent); do
    if [ -f "$HOME/.codex/agents/$id.toml" ] \
      && [ -f "$HOME/.codex/agents/$id.md" ]; then
      installed_agents=$((installed_agents + 1))
    fi
  done
  result=1
  if [ "$installed_agents" = "$expected_agents" ] \
    && [ "$(find "$HOME/.agents/skills" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l | tr -d ' ')" = "$expected_skills" ] \
    && bash "$SCRIPT_DIR/validate-codex-agent.sh" \
         "$HOME/.codex/agents/postgres-dba.toml" postgres-dba --installed >/dev/null 2>&1; then
    result=0
  fi
  record "Codex user paths contain Agents($expected_agents) and Skills($expected_skills)" "$result"
}

run_claude() {
  command -v claude >/dev/null 2>&1 || { record 'Claude CLI is installed' 1; return; }
  details="$(claude plugin details vulpora@vulpora 2>/dev/null)"; rc=$?
  result=1
  if [ "$rc" -eq 0 ] \
    && printf '%s\n' "$details" | grep -Fq "Skills ($expected_skills)" \
    && printf '%s\n' "$details" | grep -Fq "Agents ($expected_agents)" \
    && printf '%s\n' "$details" | grep -Fq 'Hooks (0)' \
    && printf '%s\n' "$details" | grep -Fq 'MCP servers (0)'; then
    result=0
  fi
  record "Claude plugin exposes Agents($expected_agents) and Skills($expected_skills)" "$result"
}

case "$runtime" in
  codex) run_codex ;;
  claude-code) run_claude ;;
  all) run_codex; run_claude ;;
esac

printf '결과: PASS=%s FAIL=%s\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
