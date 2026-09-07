#!/usr/bin/env bash
# Focused catalog installer regression tests. Full npm and Claude marketplace
# inventories are exercised by their distribution integration tests.

set -u
set -f
umask 077

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
INSTALL="$SCRIPT_DIR/install.sh"
MANIFEST="$SCRIPT_DIR/manifest.txt"
VALIDATOR="$SCRIPT_DIR/validate-codex-agent.sh"
NOTION_CONTRACT="$SCRIPT_DIR/../skills/notion-domain-context/tests/mcp-contract.test.sh"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/vulpora-install-test.XXXXXX")" || exit 1
WORK="$(cd "$WORK" && pwd -P)"
trap 'rm -rf "$WORK"' EXIT HUP INT TERM
export VULPORA_STATE_HOME="$WORK/state"
mkdir -p "$VULPORA_STATE_HOME"

pass=0
fail=0
record() {
  if eval "$2" 2>/dev/null; then
    printf '  ✓ %s\n' "$1"
    pass=$((pass + 1))
  else
    printf '  ✗ %s\n' "$1"
    fail=$((fail + 1))
  fi
}

manifest_count() {
  awk -F'|' -v wanted="$1" '
    /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
    { gsub(/^[[:space:]]+|[[:space:]]+$/, "", $1); if ($1 == wanted) count++ }
    END { print count + 0 }
  ' "$MANIFEST"
}
expected_agents="$(manifest_count agent)"
expected_skills="$(manifest_count skill)"

normalize_ids() {
  printf '%s\n' "$1" | tr ' ' '\n' | sed '/^$/d' | LC_ALL=C sort | tr '\n' ' ' | sed 's/ $//'
}

valid_toml() {
  if command -v python3 >/dev/null 2>&1 \
    && python3 -c 'import tomllib' >/dev/null 2>&1; then
    python3 -c 'import pathlib, sys, tomllib; tomllib.loads(pathlib.Path(sys.argv[1]).read_text())' "$1"
  else
    # The strict dependency-free validator already checks the supported TOML
    # subset. Python 3.11+ is an optional second parser, not a test dependency.
    return 0
  fi
}

assert_resolution() {
  local selector="$1"
  local expected_agent_ids="$2"
  local expected_skill_ids="$3"
  local resolution_target="$WORK/resolution-$selector"
  local resolution_output actual_agent_ids actual_skill_ids installed_agent_ids installed_skill_ids
  mkdir -p "$resolution_target"
  resolution_output="$(bash "$INSTALL" -t "$resolution_target" --runtime codex --apply "$selector")" || return 1
  actual_agent_ids="$(printf '%s\n' "$resolution_output" | sed -n 's/^해소된 에이전트: //p')"
  actual_skill_ids="$(printf '%s\n' "$resolution_output" | sed -n 's/^해소된 스킬: //p')"
  [ "$actual_agent_ids" = '(없음)' ] && actual_agent_ids=''
  [ "$actual_skill_ids" = '(없음)' ] && actual_skill_ids=''
  installed_agent_ids="$(find "$resolution_target/.codex/agents" -maxdepth 1 -type f -name '*.md' 2>/dev/null \
    | sed 's#.*/##; s/\.md$//' | LC_ALL=C sort | tr '\n' ' ' | sed 's/ $//')"
  installed_skill_ids="$(find "$resolution_target/.agents/skills" -mindepth 1 -maxdepth 1 -type d 2>/dev/null \
    | sed 's#.*/##' | LC_ALL=C sort | tr '\n' ' ' | sed 's/ $//')"
  [ "$(normalize_ids "$actual_agent_ids")" = "$(normalize_ids "$expected_agent_ids")" ] \
    && [ "$(normalize_ids "$actual_skill_ids")" = "$(normalize_ids "$expected_skill_ids")" ] \
    && [ "$installed_agent_ids" = "$(normalize_ids "$expected_agent_ids")" ] \
    && [ "$installed_skill_ids" = "$(normalize_ids "$expected_skill_ids")" ]
}

record 'list exposes the complete agent and skill catalog' \
  "output=\$(bash '$INSTALL' --list) \
   && printf '%s\n' \"\$output\" | grep -Fq 'postgres-dba' \
   && printf '%s\n' \"\$output\" | grep -Fq 'vulpora-installer'"
record 'apply requires an existing target' \
  "output=\$(bash '$INSTALL' -t '$WORK/missing' --runtime codex --apply postgres-dba 2>&1); rc=\$?; \
   [ \$rc -ne 0 ] && printf '%s\n' \"\$output\" | grep -Fq '대상 레포 디렉터리가 없습니다'"
record 'apply rejects a symlinked target before creating assets' \
  "mkdir -p '$WORK/real-target' \
   && ln -s '$WORK/real-target' '$WORK/symlink-target' \
   && output=\$(bash '$INSTALL' -t '$WORK/symlink-target' --runtime codex --apply entity 2>&1); rc=\$?; \
   [ \$rc -ne 0 ] && printf '%s\n' \"\$output\" | grep -Fq 'symlink일 수 없습니다' \
   && [ -z \"\$(find '$WORK/real-target' -mindepth 1 -print -quit)\" ]"
record "all-agents resolves $expected_agents agents and only their typed skill dependencies" \
  "mkdir -p '$WORK/dry' \
   && output=\$(bash '$INSTALL' -t '$WORK/dry' --runtime codex all-agents) \
   && printf '%s\n' \"\$output\" | grep -Fq 'postgres-dba' \
   && actual_skills=\$(printf '%s\n' \"\$output\" | sed -n 's/^해소된 스킬: //p') \
   && [ \"\$(normalize_ids \"\$actual_skills\")\" = \"\$(normalize_ids \
        'code-authoring-router korean-dev-writer opensearch-code-authoring opensearch-optimization opensearch-query-review opensearch-schema-review postgres-code-authoring postgres-query-review postgres-risk-check postgres-schema-design product-ui-design')\" ] \
   && [ ! -e '$WORK/dry/.codex' ] && [ ! -e '$WORK/dry/.agents' ]"
record "all-skills resolves $expected_skills skills and only their typed agent dependencies" \
  "output=\$(bash '$INSTALL' -t '$WORK/dry' --runtime codex all-skills) \
   && printf '%s\n' \"\$output\" | grep -Fq 'vulpora-installer' \
   && actual_agents=\$(printf '%s\n' \"\$output\" | sed -n 's/^해소된 에이전트: //p') \
   && [ \"\$(normalize_ids \"\$actual_agents\")\" = \"\$(normalize_ids \
        'architecture-reviewer application-architect domain-driven-design-reviewer code-cartographer java-reviewer security-auditor opensearch-expert postgres-dba data-modeling-reviewer requirement-dialogue task-splitter task-orchestrator test-runner')\" ] \
   && [ ! -e '$WORK/dry/.codex' ] && [ ! -e '$WORK/dry/.agents' ]"
record 'architecture workflow resolves its complete typed agent and skill closure' \
  "assert_resolution architecture-review-workflow \
     'architecture-reviewer application-architect domain-driven-design-reviewer code-cartographer' \
     'architecture-review-workflow'"
record 'backend review workflow resolves its complete typed agent and skill closure' \
  "assert_resolution backend-code-review-workflow \
     'security-auditor' \
     'backend-code-review-workflow kotlin-spring-review refactoring-catalog design-pattern-apply oop-design-review'"
record 'E2E test workflow resolves its exact author, runner, browser, and renderer closure' \
  "assert_resolution e2e-test-workflow \
     '' \
     'e2e-test-workflow e2e-scenario-author e2e-runner playwright-e2e e2e-report-renderer'"
record 'code authoring router remains a runtime-neutral minimal router' \
  "assert_resolution code-authoring-router \
     '' \
     'code-authoring-router'"
record 'Kotlin Spring review workflow resolves its complete skill suite without unrelated agents' \
  "assert_resolution kotlin-spring-review-workflow \
     '' \
     'kotlin-spring-review-workflow kotlin-spring-review oop-design-review design-pattern-apply refactoring-catalog'"
record 'Java Spring review workflow resolves one exact agent and two exact skill passes' \
  "assert_resolution java-spring-review-workflow \
     'java-reviewer' \
     'java-spring-review-workflow oop-design-review design-pattern-apply'"
record 'OpenSearch workflow resolves its complete typed agent and skill closure' \
  "assert_resolution opensearch-review-workflow \
     'opensearch-expert' \
     'opensearch-review-workflow opensearch-code-authoring opensearch-optimization opensearch-query-review opensearch-schema-review'"
record 'PostgreSQL workflow resolves its complete typed agent and skill closure' \
  "assert_resolution postgres-review-workflow \
     'postgres-dba data-modeling-reviewer' \
     'postgres-review-workflow postgres-code-authoring postgres-query-review postgres-risk-check postgres-schema-design'"
record 'start-task resolves its orchestration agents and Korean question-writing skill' \
  "assert_resolution start-task \
     'requirement-dialogue task-splitter task-orchestrator' \
     'start-task code-authoring-router korean-dev-writer'"
record 'vulpora-init installs only its generic routing dependency' \
  "assert_resolution vulpora-init \
     '' \
     'vulpora-init code-authoring-router'"
record 'test quality refactoring workflow resolves its exact review, refactoring, authoring, and runner closure' \
  "assert_resolution test-quality-refactoring-workflow \
     'test-runner' \
     'test-quality-refactoring-workflow test-quality-review test-refactoring test-authoring kotlin-code-authoring kotlin-spring-review'"
record 'product-requirements resolves the mandatory Korean question-writing skill' \
  "assert_resolution product-requirements \
     '' \
     'product-requirements korean-dev-writer'"
record 'visual-artifact-router resolves the complete document, rendering, and QA pipeline' \
  "assert_resolution visual-artifact-router \
     '' \
     'visual-artifact-router document-designer markdown-publisher pdf-qa mermaid-diagrams diagram-styler'"
record 'backend test author resolves the mandatory Korean prose skill' \
  "assert_resolution backend-test-author \
     'backend-test-author' \
     'korean-dev-writer'"
record 'documentation comment author resolves the mandatory Korean prose skill' \
  "assert_resolution documentation-comment-author \
     'documentation-comment-author' \
     'korean-dev-writer'"

claude_target="$WORK/claude"
mkdir -p "$claude_target"
bash "$INSTALL" -t "$claude_target" --runtime claude-code --apply postgres-dba >/dev/null 2>&1
claude_rc=$?
record 'Claude selected install copies the definition, bundle, and declared skill closure' \
  "[ '$claude_rc' = 0 ] \
   && [ -f '$claude_target/.claude/agents/postgres-dba.md' ] \
   && [ -f '$claude_target/.claude/agents/dba/reference/kb/INDEX.md' ] \
   && [ -f '$claude_target/.claude/skills/postgres-code-authoring/SKILL.md' ] \
   && ! grep -Fq '\${CLAUDE_PLUGIN_ROOT}' '$claude_target/.claude/agents/postgres-dba.md' \
   && grep -Fq '$claude_target/.claude/agents/dba/SOUL.md' \
        '$claude_target/.claude/agents/postgres-dba.md'"
record 'Claude selected install verifies against the source catalog' \
  "bash '$INSTALL' -t '$claude_target' --runtime claude-code --verify postgres-dba \
     | grep -Fq '모든 자산과 의존성'"

opencode_target="$WORK/opencode"
mkdir -p "$opencode_target"
bash "$INSTALL" -t "$opencode_target" --runtime opencode --apply postgres-dba >/dev/null 2>&1
opencode_rc=$?
record 'OpenCode project install renders native metadata, paths, bundle, and skills' \
  "[ '$opencode_rc' = 0 ] \
   && [ -f '$opencode_target/.opencode/agents/postgres-dba.md' ] \
   && [ -f '$opencode_target/.opencode/agents/dba/reference/kb/INDEX.md' ] \
   && [ -f '$opencode_target/.opencode/skills/postgres-code-authoring/SKILL.md' ] \
   && grep -Fq 'mode: subagent' '$opencode_target/.opencode/agents/postgres-dba.md' \
   && grep -Fq 'edit: deny' '$opencode_target/.opencode/agents/postgres-dba.md' \
   && grep -Fq '$opencode_target/.opencode/agents/dba/SOUL.md' \
        '$opencode_target/.opencode/agents/postgres-dba.md' \
   && ! grep -Fq '\${CLAUDE_PLUGIN_ROOT}' \
        '$opencode_target/.opencode/agents/postgres-dba.md'"
record 'OpenCode project install verifies against the rendered catalog' \
  "bash '$INSTALL' -t '$opencode_target' --runtime opencode --verify postgres-dba \
     | grep -Fq '모든 자산과 의존성'"

codex_target="$WORK/codex"
mkdir -p "$codex_target"
VULPORA_CODEX_MODEL= VULPORA_CODEX_REASONING_EFFORT= \
  bash "$INSTALL" -t "$codex_target" --runtime codex --apply postgres-dba >/dev/null 2>&1
codex_rc=$?
record 'Codex selected install creates native adapter, definition, bundle, and declared skill closure' \
  "[ '$codex_rc' = 0 ] \
   && [ -f '$codex_target/.codex/agents/postgres-dba.toml' ] \
   && [ -f '$codex_target/.codex/agents/postgres-dba.md' ] \
   && [ -f '$codex_target/.codex/agents/dba/reference/kb/INDEX.md' ] \
   && [ -f '$codex_target/.agents/skills/postgres-code-authoring/SKILL.md' ]"
record 'installed Codex adapter embeds the canonical definition' \
  "bash '$VALIDATOR' '$codex_target/.codex/agents/postgres-dba.toml' postgres-dba --installed \
   && valid_toml '$codex_target/.codex/agents/postgres-dba.toml' \
   && grep -Fq '\d <table>' '$codex_target/.codex/agents/postgres-dba.toml' \
   && grep -Fq 'Vulpora canonical definition for postgres-dba.' \
        '$codex_target/.codex/agents/postgres-dba.toml' \
   && ! grep -Fq 'AGENT_RUNTIME_REQUIRED:postgres-dba' \
        '$codex_target/.codex/agents/postgres-dba.toml' \
   && ! grep -Eq '^model[[:space:]]*=|^model_reasoning_effort[[:space:]]*=' \
        '$codex_target/.codex/agents/postgres-dba.toml'"
record 'Codex selected install verifies against the rendered catalog' \
  "bash '$INSTALL' -t '$codex_target' --runtime codex --verify postgres-dba \
     | grep -Fq '모든 자산과 의존성'"

codex_model_target="$WORK/codex-model"
mkdir -p "$codex_model_target"
VULPORA_CODEX_MODEL='provider/model-v1' VULPORA_CODEX_REASONING_EFFORT=medium \
  bash "$INSTALL" -t "$codex_model_target" --runtime codex --apply postgres-dba >/dev/null 2>&1
record 'Codex explicit model and reasoning policy remain verifiable with different ambient settings' \
  "grep -Fq 'model = \"provider/model-v1\"' '$codex_model_target/.codex/agents/postgres-dba.toml' \
   && grep -Fq 'model_reasoning_effort = \"medium\"' '$codex_model_target/.codex/agents/postgres-dba.toml' \
   && VULPORA_CODEX_MODEL=provider/other VULPORA_CODEX_REASONING_EFFORT=ultra \
      bash '$INSTALL' -t '$codex_model_target' --runtime codex --verify postgres-dba \
        | grep -Fq '모든 자산과 의존성'"
record 'unsafe Codex model overrides fail closed without writing assets' \
  "mkdir -p '$WORK/codex-model-invalid' \
   && output=\$(VULPORA_CODEX_MODEL='bad\"model' bash '$INSTALL' -t '$WORK/codex-model-invalid' --runtime codex --apply postgres-dba 2>&1); rc=\$?; \
   [ \$rc -ne 0 ] && printf '%s\n' \"\$output\" | grep -Fq '형식이 안전하지 않습니다' \
   && [ ! -e '$WORK/codex-model-invalid/.codex' ]"

claude_skill_target="$WORK/claude-skills"
codex_skill_target="$WORK/codex-skills"
mkdir -p "$claude_skill_target" "$codex_skill_target"
bash "$INSTALL" -t "$claude_skill_target" --runtime claude-code --apply entity >/dev/null 2>&1
bash "$INSTALL" -t "$codex_skill_target" --runtime codex --apply test-authoring >/dev/null 2>&1
record 'Claude selected skill install closes declared dependencies' \
  "[ -f '$claude_skill_target/.claude/skills/entity/SKILL.md' ] \
   && [ -f '$claude_skill_target/.claude/skills/repository/SKILL.md' ] \
   && [ -f '$claude_skill_target/.claude/skills/service/SKILL.md' ] \
   && [ -f '$claude_skill_target/.claude/skills/mapper/SKILL.md' ] \
   && [ -f '$claude_skill_target/.claude/skills/enum/SKILL.md' ] \
   && [ ! -e '$claude_skill_target/.claude/agents' ] \
   && bash '$INSTALL' -t '$claude_skill_target' --runtime claude-code --verify entity >/dev/null"
record 'Codex selected skill install uses the shared Agent Skills discovery root' \
  "[ -f '$codex_skill_target/.agents/skills/test-authoring/SKILL.md' ] \
   && [ ! -e '$codex_skill_target/.codex/agents' ] \
   && bash '$INSTALL' -t '$codex_skill_target' --runtime codex --verify test-authoring >/dev/null"

workflow_skill_target="$WORK/workflow-skills"
mkdir -p "$workflow_skill_target"
bash "$INSTALL" -t "$workflow_skill_target" --runtime codex --apply test-quality-refactoring-workflow >/dev/null 2>&1
record 'Codex workflow install includes review, refactoring, authoring, and test-runner dependencies' \
  "[ -f '$workflow_skill_target/.agents/skills/test-quality-review/SKILL.md' ] \
   && [ -f '$workflow_skill_target/.agents/skills/test-refactoring/SKILL.md' ] \
   && [ -f '$workflow_skill_target/.agents/skills/test-quality-refactoring-workflow/SKILL.md' ] \
   && [ -f '$workflow_skill_target/.agents/skills/test-authoring/SKILL.md' ] \
   && [ -f '$workflow_skill_target/.codex/agents/test-runner.md' ] \
   && bash '$INSTALL' -t '$workflow_skill_target' --runtime codex --verify test-quality-refactoring-workflow >/dev/null"

printf '%s\n' '# user modification' >> "$codex_target/.codex/agents/postgres-dba.toml"
record 'reinstall refuses to overwrite a modified receipt-owned adapter' \
  "output=\$(bash '$INSTALL' -t '$codex_target' --runtime codex --apply postgres-dba 2>&1); rc=\$?; \
   [ \$rc -ne 0 ] && printf '%s\n' \"\$output\" | grep -Fq existing_path_conflict \
   && tail -1 '$codex_target/.codex/agents/postgres-dba.toml' | grep -Fq '# user modification'"

extras_target="$WORK/extras"
mkdir -p "$extras_target"
bash "$INSTALL" -t "$extras_target" --runtime codex --apply commands >/dev/null 2>&1
record 'optional template selectors remain explicit and installable' \
  "[ -f '$extras_target/.codex/commands/ship.md' ] \
   && bash '$INSTALL' -t '$extras_target' --runtime codex --verify commands \
        | grep -Fq '모든 자산과 의존성'"

record 'manifest and all source adapters remain valid' \
  "bash '$SCRIPT_DIR/check-manifest.sh' >/dev/null"
record 'Notion skill and researcher use the installed read-only MCP contract' \
  "bash '$NOTION_CONTRACT' >/dev/null"

printf '결과: PASS=%s FAIL=%s\n' "$pass" "$fail"
[ "$fail" = 0 ]
