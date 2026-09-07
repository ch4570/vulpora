#!/bin/bash
# Installer skill execution contract. No package download, OAuth, or live MCP access.

set -u
set -f

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd -P)"
SKILL="$REPO_ROOT/skills/vulpora-installer/SKILL.md"
PRINCIPLES="$REPO_ROOT/skills/vulpora-installer/reference/principles.md"
ROUTING="$REPO_ROOT/skills/vulpora-installer/reference/kb/install-routing.md"
OPENAI_YAML="$REPO_ROOT/skills/vulpora-installer/agents/openai.yaml"
MCP_MANAGER="$REPO_ROOT/install/mcp-manager.sh"

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
if grep -Fq 'public repository npx launcher' "$SKILL" \
  && grep -Fq "npx --yes --package='git+https://github.com/ch4570/vulpora.git' -- vulpora" "$SKILL" \
  && grep -Fq 'explicit subcommand' "$SKILL" \
  && grep -Fq 'Do not hand the command back to the user' "$SKILL"; then result=0; fi
record 'missing global CLI falls back to executable npx subcommands' "$result"

result=1
if grep -Fq 'claude mcp get vulpora-notion' "$SKILL" \
  && grep -Fq 'approval_required' "$SKILL" \
  && grep -Fq 'Pending approval' "$SKILL" \
  && grep -Fq '/mcp' "$SKILL" \
  && grep -Fq 'auth_deferred' "$SKILL" \
  && grep -Fq 'first Notion invocation' "$SKILL"; then result=0; fi
record 'Claude project approval and first-use OAuth are separate actionable states' "$result"

result=1
if ! grep -Fq '다음 한 줄만 안내한다' "$SKILL" \
  && ! grep -Fq '둘 다 없으면 임의 installer를 만들지 않고 위 npx 명령을 사용한다' "$ROUTING" \
  && grep -Fq 'deterministic install' "$PRINCIPLES"; then result=0; fi
record 'installed automation no longer degrades into a guidance-only response' "$result"

result=1
if grep -Fq 'approval_required: %s' "$MCP_MANAGER" \
  && grep -Fq 'auth_deferred: %s' "$MCP_MANAGER" \
  && grep -Fq 'connect the requested MCP pack' "$OPENAI_YAML"; then result=0; fi
record 'runtime status and skill metadata expose the corrected MCP flow' "$result"

printf '결과: PASS=%s FAIL=%s\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
