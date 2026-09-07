#!/bin/bash
# Notion skill/agent contract regression. No live MCP or credential access.

set -u
set -f

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd -P)"
SKILL="$REPO_ROOT/skills/notion-domain-context/SKILL.md"
AGENT="$REPO_ROOT/agents/notion-domain-researcher.md"
CODEX_ADAPTER="$REPO_ROOT/agents/notion-domain-researcher.codex.toml"
EVIDENCE_KB="$REPO_ROOT/agents/notion-domain-researcher/reference/kb/evidence-packet.md"
OPENAI_YAML="$REPO_ROOT/skills/notion-domain-context/agents/openai.yaml"
INSTALL="$REPO_ROOT/install/install.sh"
VALIDATE_CODEX="$REPO_ROOT/install/validate-codex-agent.sh"
MCP_CATALOG="$REPO_ROOT/install/mcp-packs.txt"
MCP_MANAGER="$REPO_ROOT/install/mcp-manager.sh"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/vulpora-notion-contract.XXXXXX")" || exit 1
trap 'rm -rf "$WORK"' EXIT HUP INT TERM

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

result=1
if grep -Fq '### Codex or OMX' "$SKILL" \
  && grep -Fq 'Use the parent session' "$SKILL" \
  && grep -Fq 'MCP tools directly' "$SKILL" \
  && grep -Fq 'Do not require, spawn, or substitute' "$SKILL" \
  && grep -Fq 'the endpoint alone never proves' "$SKILL" \
  && grep -Fq '### Claude Code' "$SKILL" \
  && grep -Fq 'Invoke the exact `notion-domain-researcher` custom subagent' "$SKILL" \
  && grep -Fq 'restart_required' "$SKILL" \
  && grep -Fq 'auth_required' "$SKILL"; then result=0; fi
record 'skill uses executable Codex direct and Claude exact-agent paths' "$result"

result=1
if grep -Fq 'Start deferred authentication on first use' "$SKILL" \
  && grep -Fq 'the `vulpora-installer` skill once for the' "$SKILL" \
  && grep -Fq 'current runtime/scope' "$SKILL" \
  && grep -Fq 'before any Notion content is read' "$SKILL" \
  && grep -Fq 'configured_read_only' "$SKILL" \
  && grep -Fq 'absent inventory means an absent MCP config' "$SKILL" \
  && grep -Fq 'Do not retry login in a' "$SKILL"; then result=0; fi
record 'first Notion use starts bounded deferred auth without a login loop' "$result"

result=1
if ! grep -Fq 'Return this fixed status' "$SKILL" \
  && ! grep -Fq 'Call no tools' "$SKILL" \
  && ! grep -Fq 'secure_research_unavailable' "$SKILL"; then result=0; fi
record 'skill no longer returns the fixed disabled status' "$result"

result=1
if grep -Fqx 'tools: mcp__vulpora-notion__notion-search, mcp__vulpora-notion__notion-fetch' "$AGENT" \
  && grep -Fqx 'mcpServers: [vulpora-notion]' "$AGENT"; then
  result=0
fi
record 'Claude researcher hard-allows only Notion search and fetch' "$result"

result=1
if grep -Fq 'notion-search,notion-fetch,search,fetch' "$MCP_CATALOG" \
  && grep -Fq 'enabled_tools = ["notion-search", "notion-fetch", "search", "fetch"]' "$MCP_MANAGER" \
  && grep -Fq 'existing_mcp_policy_conflict' "$MCP_MANAGER"; then result=0; fi
record 'Codex MCP pack owns the parent-session read-only boundary' "$result"

result=1
if grep -Fq '[mcp_servers.vulpora-notion]' "$CODEX_ADAPTER" \
  && grep -Fq 'url = "https://mcp.notion.com/mcp"' "$CODEX_ADAPTER" \
  && grep -Fq 'enabled_tools = ["notion-search", "notion-fetch", "search", "fetch"]' "$CODEX_ADAPTER"; then result=0; fi
record 'Codex researcher hard-allows only official Notion read aliases' "$result"

sed 's/enabled_tools = \["notion-search", "notion-fetch", "search", "fetch"\]/enabled_tools = ["notion-search", "notion-fetch", "search", "fetch", "notion-create-pages"]/' \
  "$CODEX_ADAPTER" > "$WORK/unsafe-notion-adapter.toml"
result=1
if ! bash "$VALIDATE_CODEX" "$WORK/unsafe-notion-adapter.toml" notion-domain-researcher >/dev/null 2>&1; then
  result=0
fi
record 'Codex validator rejects a widened Notion tool profile' "$result"

mkdir -p "$WORK/target"
bash "$INSTALL" -t "$WORK/target" --runtime codex --apply notion-domain-researcher >/dev/null 2>&1
install_rc=$?
result=1
if [ "$install_rc" -eq 0 ] \
  && grep -Fq 'vulpora-notion' \
       "$WORK/target/.codex/agents/notion-domain-researcher.toml" \
  && grep -Fq 'notion-search' \
       "$WORK/target/.codex/agents/notion-domain-researcher.toml" \
  && grep -Fq 'enabled_tools = ["notion-search", "notion-fetch", "search", "fetch"]' \
       "$WORK/target/.codex/agents/notion-domain-researcher.toml" \
  && ! grep -Fq 'AGENT_RUNTIME_REQUIRED:notion-domain-researcher' \
       "$WORK/target/.codex/agents/notion-domain-researcher.toml"; then result=0; fi
record 'rendered Codex adapter embeds the active contract and hard tool allowlist' "$result"

result=1
if grep -Fq 'value: "vulpora-notion"' "$OPENAI_YAML" \
  && grep -Fq 'https://mcp.notion.com/mcp' "$OPENAI_YAML" \
  && ! grep -Fq 'MCP restricted to search and fetch' "$OPENAI_YAML"; then result=0; fi
record 'skill metadata does not mislabel the full MCP server as read-only' "$result"

result=1
if ! grep -Fq 'compatibility runner' "$EVIDENCE_KB" \
  && ! grep -Fq 'isolated runner' "$CODEX_ADAPTER" \
  && grep -Fq 'Vulpora installer renders' "$CODEX_ADAPTER"; then result=0; fi
record 'deleted runners are not promised by active contracts' "$result"

result=1
if [ ! -e "$REPO_ROOT/skills/notion-domain-context/scripts/ensure_notion_mcp_auth.sh" ] \
  && [ ! -e "$REPO_ROOT/skills/notion-domain-context/scripts/run_notion_domain_researcher.sh" ]; then result=0; fi
record 'obsolete fixed-status runtime scripts are absent' "$result"

printf '결과: PASS=%s FAIL=%s\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
