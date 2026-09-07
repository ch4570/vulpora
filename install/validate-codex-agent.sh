#!/bin/bash
# Validate source templates and rendered Codex custom-agent adapters.

set -u
set -f

if [ "$#" -lt 2 ] || [ "$#" -gt 3 ]; then
  printf '%s\n' 'usage: validate-codex-agent.sh <path> <expected-id> [--installed]' >&2
  exit 2
fi

path="$1"
expected_id="$2"
mode="${3:-source}"
case "$mode" in source|--installed) ;; *) printf '%s\n' "unknown validation mode: $mode" >&2; exit 2 ;; esac
case "$expected_id" in ''|*[!a-z0-9-]*) printf '%s\n' "$path: expected id must be kebab-case" >&2; exit 1 ;; esac
[ -f "$path" ] && [ ! -L "$path" ] || { printf '%s\n' "$path: adapter must be a regular file" >&2; exit 1; }

case "$expected_id" in
  postgres-dba|code-refactor-agent|opensearch-expert|architecture-reviewer|\
  search-relevance-evaluator|nl-sql-guardian|index-migration-architect|\
  notion-domain-researcher|application-architect|data-modeling-reviewer|\
  domain-driven-design-reviewer|requirement-dialogue|security-auditor|task-splitter|\
  ux-designer|design-reviewer)
    expected_sandbox=read-only
    ;;
  kotlin-spring-reviewer|schema-cartographer|code-cartographer|agent-evaluator|\
  java-reviewer|qa-test-designer|e2e-test-runner|test-runner|\
  backend-test-author|documentation-comment-author|task-orchestrator|product-planner)
    expected_sandbox=workspace-write
    ;;
  *) printf '%s\n' "$path: unsupported strict adapter contract: $expected_id" >&2; exit 1 ;;
esac

awk -v path="$path" -v expected="$expected_id" -v sandbox="$expected_sandbox" -v mode="$mode" '
function fail(message) {
  print path ": " message > "/dev/stderr"
  bad = 1
  exit 1
}
function require_one(value, message) { if (value != 1) fail(message) }
BEGIN {
  section = "top"
  multiline = 0
  bad = 0
  basic_delimiter = "\"\"\""
  literal_delimiter = "\047\047\047"
  expected_delimiter = (mode == "--installed" ? literal_delimiter : basic_delimiter)
}
{
  sub(/\r$/, "", $0)
  line = $0
  if (multiline) {
    if (line == expected_delimiter) { multiline = 0; developer_closed++ }
    else if (mode == "--installed" && index(line, literal_delimiter) > 0) {
      fail("developer_instructions contains the TOML literal-string delimiter")
    }
    else if (line ~ /[^[:space:]]/) developer_body = 1
    next
  }
  if (line ~ /^[[:space:]]*$/ || line ~ /^[[:space:]]*#/) next
  if (line == "developer_instructions = " expected_delimiter) {
    if (section != "top") fail("developer_instructions must be top-level")
    developer_opened++
    multiline = 1
    next
  }
  if (line ~ /^\[/) {
    if (line == "[history]") { section = "history"; history_header++ }
    else if (expected == "notion-domain-researcher" && line == "[mcp_servers.vulpora-notion]") {
      section = "notion_mcp"
      notion_mcp_header++
    }
    else fail("MCP, permission, network, and unknown TOML tables are forbidden")
    next
  }
  if (section == "top") {
    if (line ~ /^name[[:space:]]*=/) {
      if (line != "name = \"" expected "\"") fail("name must equal stable id")
      name_count++
    } else if (line ~ /^description[[:space:]]*=/) {
      if (line !~ /^description = ".+"$/) fail("description must be a non-empty string")
      description_count++
    } else if (line ~ /^model = "[A-Za-z0-9][-A-Za-z0-9._:\/]*"$/ && length(line) <= 138) model_count++
    else if (mode == "--installed" && line ~ /^model_reasoning_effort = "(minimal|low|medium|high|xhigh|max|ultra)"$/) effort_count++
    else if (line == "approval_policy = \"never\"") approval_count++
    else if (line ~ /^sandbox_mode[[:space:]]*=/) {
      if (line != "sandbox_mode = \"" sandbox "\"") fail("sandbox_mode does not match profile")
      sandbox_count++
    } else if (line == "web_search = \"disabled\"") web_count++
    else if (line == "allow_login_shell = false") login_shell_count++
    else fail("unexpected or malformed top-level field")
  } else if (section == "history") {
    if (line == "persistence = \"none\"") history_count++
    else fail("unexpected or malformed history policy")
  } else if (section == "notion_mcp") {
    if (line == "url = \"https://mcp.notion.com/mcp\"") notion_mcp_url++
    else if (line == "enabled_tools = [\"notion-search\", \"notion-fetch\", \"search\", \"fetch\"]") notion_mcp_tools++
    else fail("unexpected or unsafe Notion MCP policy")
  }
}
END {
  if (bad) exit 1
  if (multiline) fail("developer_instructions multiline string is not closed")
  require_one(name_count, "exactly one name is required")
  require_one(description_count, "exactly one description is required")
  if (mode == "--installed") {
    if (model_count > 1) fail("installed adapters allow at most one safe model override")
    if (effort_count > 1) fail("installed adapters allow at most one reasoning effort override")
  } else require_one(model_count, "source templates require exactly one safe model placeholder")
  require_one(approval_count, "approval_policy must be never")
  require_one(sandbox_count, "exactly one sandbox_mode is required")
  require_one(web_count, "web_search must be disabled")
  require_one(login_shell_count, "login shell must be disabled")
  require_one(developer_opened, "developer_instructions is required")
  require_one(developer_closed, "developer_instructions must close")
  if (!developer_body) fail("developer_instructions must be non-empty")
  require_one(history_header, "history policy is required")
  require_one(history_count, "history persistence must be none")
  if (expected == "notion-domain-researcher") {
    require_one(notion_mcp_header, "Notion MCP hard allowlist is required")
    require_one(notion_mcp_url, "official Notion MCP endpoint is required")
    require_one(notion_mcp_tools, "Notion MCP must allow only the official search and fetch aliases")
  } else if (notion_mcp_header || notion_mcp_url || notion_mcp_tools) {
    fail("Notion MCP policy is forbidden for this agent")
  }
}
' "$path" || exit 1

# Parse with the standard-library TOML implementation when available. The
# restricted awk contract remains the dependency-free baseline for hosts whose
# Python predates tomllib.
if command -v python3 >/dev/null 2>&1 \
  && python3 -c 'import tomllib' >/dev/null 2>&1; then
  python3 - "$path" <<'PY' || exit 1
import pathlib
import sys
import tomllib

path = pathlib.Path(sys.argv[1])
try:
    with path.open("rb") as source:
        tomllib.load(source)
except Exception as error:
    print(f"{path}: invalid TOML: {error}", file=sys.stderr)
    raise SystemExit(1)
PY
fi

if [ "$mode" = --installed ]; then
  grep -Fq "Vulpora canonical definition for $expected_id." "$path" \
    || { printf '%s\n' "$path: rendered canonical definition marker is missing" >&2; exit 1; }
  if grep -Fq "AGENT_RUNTIME_REQUIRED:$expected_id" "$path"; then
    printf '%s\n' "$path: installed adapter still contains the disabled runtime marker" >&2
    exit 1
  fi
else
  grep -Fq "Codex native adapter for $expected_id" "$path" \
    || { printf '%s\n' "$path: adapter identity marker is missing" >&2; exit 1; }
  grep -Fq "canonical definition \`$expected_id.md\`" "$path" \
    || { printf '%s\n' "$path: canonical definition marker is missing" >&2; exit 1; }
  grep -Fq 'do not delegate further' "$path" \
    || { printf '%s\n' "$path: nested delegation must be forbidden" >&2; exit 1; }
  grep -Fq "AGENT_RUNTIME_REQUIRED:$expected_id" "$path" \
    || { printf '%s\n' "$path: source adapter template marker is missing" >&2; exit 1; }
fi
