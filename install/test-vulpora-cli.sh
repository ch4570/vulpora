#!/usr/bin/env bash
# Regression tests for the user-facing Vulpora setup/doctor/uninstall CLI.

set -u
set -f
umask 077

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"
CLI="$REPO_ROOT/vulpora"
MANIFEST="$REPO_ROOT/install/manifest.txt"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/vulpora-cli-test.XXXXXX")" || exit 1
WORK="$(cd "$WORK" && pwd -P)"
export VULPORA_STATE_HOME="$WORK/state"
mkdir -p "$VULPORA_STATE_HOME"
pass=0
fail=0

cleanup() {
  if [ -n "$WORK" ] && [ -d "$WORK" ] && [ ! -L "$WORK" ]; then
    case "$WORK" in "${TMPDIR:-/tmp}"/vulpora-cli-test.*) rm -rf "$WORK" ;; esac
  fi
}
trap cleanup EXIT HUP INT TERM

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

codex_target="$WORK/codex-project"
claude_target="$WORK/claude-project"
all_target="$WORK/all-project"
dry_target="$WORK/dry-project"
user_target="$WORK/user-home"
interactive_target="$WORK/interactive-project"
interactive_bin="$WORK/interactive-bin"
mkdir -p "$codex_target" "$claude_target" "$all_target" "$dry_target" "$user_target" \
  "$interactive_target" "$interactive_bin" "$WORK/custom-user" "$WORK/custom-codex"
ln -s "$(type -P true)" "$interactive_bin/codex"
ln -s "$(type -P true)" "$interactive_bin/claude"

tui_install_keys() {
  # Action: setup; scope: project; package: agents. 런타임은 자동 감지된다.
  printf '\n'
  printf '\n%s\n' "$WORK/tui-project"
  # Default is agents + skills; choose agents-only for this focused test.
  printf '\033[B\n'
  # Select kotlin-spring-reviewer and test-runner with arrows + Space.
  printf '\033[B '
  key_index=0
  while [ "$key_index" -lt 10 ]; do printf '\033[B'; key_index=$((key_index + 1)); done
  printf ' \n'
  # Apply the compact preview.
  printf '\n'
}

tui_remove_test_runner_keys() {
  # Action: selected removal; scope: project; package: agents. 런타임은 자동 감지된다.
  printf '\033[B\n'
  printf '\n%s\n' "$WORK/tui-project"
  # Default is agents + skills; choose agents-only for this focused test.
  printf '\033[B\n'
  # Select test-runner (12th row), continue, then apply.
  key_index=0
  while [ "$key_index" -lt 11 ]; do printf '\033[B'; key_index=$((key_index + 1)); done
  printf ' \n\n'
}

tui_agent_without_skills_keys() {
  # Setup, project, agents+skills, one agent, zero skills, apply. 런타임은 자동 감지된다.
  printf '\n'
  printf '\n%s\n' "$WORK/tui-no-skills"
  printf '\n'
  printf ' \n'
  printf '\n'
  printf '\n'
}

record 'version exposes the repository release' \
  "[ \"\$(bash '$CLI' version)\" = \"vulpora \$(tr -d '\\r\\n' < '$REPO_ROOT/VERSION')\" ]"
record 'list delegates to the catalog SSOT' \
  "output=\$(bash '$CLI' list) \
   && [ \"\$output\" = \"\$(bash '$REPO_ROOT/install/install.sh' --list)\" ] \
   && [ \"\$(manifest_count agent)\" -gt 0 ] \
   && [ \"\$(manifest_count skill)\" -gt 0 ] \
   && printf '%s\n' \"\$output\" | grep -Fq 'notion-domain-researcher' \
   && printf '%s\n' \"\$output\" | grep -Fq 'task-orchestrator' \
   && printf '%s\n' \"\$output\" | grep -Fq 'pack:product' \
   && printf '%s\n' \"\$output\" | grep -Fq 'product-planner' \
   && printf '%s\n' \"\$output\" | grep -Fq 'ux-designer' \
   && printf '%s\n' \"\$output\" | grep -Fq 'design-reviewer' \
   && printf '%s\n' \"\$output\" | grep -Fq 'architecture-review-workflow' \
   && printf '%s\n' \"\$output\" | grep -Fq 'mssql-code-authoring' \
   && printf '%s\n' \"\$output\" | grep -Fq 'java-spring-review-workflow' \
   && ! printf '%s\n' \"\$output\" | grep -Eq '(^|[^[:alnum:]-])mad-dev([^[:alnum:]-]|$)'"
record 'no-argument non-interactive invocation remains script-safe help' \
  "bash '$CLI' </dev/null | grep -Fq 'vulpora interactive'"
record 'project setup requires an explicit selector' \
  "output=\$(bash '$CLI' setup --runtime codex --target '$codex_target' 2>&1); rc=\$?; \
   [ \$rc -ne 0 ] && printf '%s\n' \"\$output\" | grep -Fq 'project scope에서는 설치할 asset selector가 필요' \
   && [ ! -e '$codex_target/.agents' ]"
record 'user setup defaults to the complete agent and skill catalog' \
  "output=\$(HOME='$user_target' CODEX_HOME= bash '$CLI' setup --runtime codex --scope user --target '$user_target' --dry-run) \
   && printf '%s\n' \"\$output\" | grep -Fq '해소된 에이전트: postgres-dba' \
   && printf '%s\n' \"\$output\" | grep -Fq 'vulpora-installer' \
   && [ -z \"\$(find '$user_target' -mindepth 1 -print -quit)\" ]"
record 'Claude project setup installs the selected agent and bundle' \
  "bash '$CLI' setup --runtime claude-code --target '$claude_target' java-reviewer >/dev/null \
   && [ -f '$claude_target/.claude/agents/java-reviewer.md' ] \
   && [ -f '$claude_target/.claude/agents/java-review/SOUL.md' ] \
   && ! grep -Fq '\${CLAUDE_PLUGIN_ROOT}' '$claude_target/.claude/agents/java-reviewer.md' \
   && grep -Fq '$claude_target/.claude/agents/java-review/SOUL.md' \
        '$claude_target/.claude/agents/java-reviewer.md'"
record 'runtime all project setup installs agent and skill discovery roots' \
  "bash '$CLI' setup --runtime all --target '$all_target' test-runner test-authoring >/dev/null \
   && [ -f '$all_target/.codex/agents/test-runner.toml' ] \
   && [ -f '$all_target/.claude/agents/test-runner.md' ] \
   && [ -f '$all_target/.agents/skills/test-authoring/SKILL.md' ] \
   && [ -f '$all_target/.claude/skills/test-authoring/SKILL.md' ]"
record 'dry-run is non-mutating' \
  "output=\$(bash '$CLI' setup --runtime codex --target '$dry_target' --dry-run java-reviewer) \
   && [ ! -e '$dry_target/.codex' ] && [ ! -e '$dry_target/.agents' ] \
   && printf '%s\n' \"\$output\" | grep -Fq -- '--dry-run을 제거하세요' \
   && ! printf '%s\n' \"\$output\" | grep -Fq -- '--apply'"
record 'guided installer installs only the selected Codex features' \
  "printf '2\n%s\n1\n1\n2\n2,12\ny\n' '$interactive_target' \
     | HOME='$user_target' VULPORA_STATE_HOME='$VULPORA_STATE_HOME' \
       VULPORA_RUNTIME=codex PATH='$interactive_bin:$PATH' bash '$CLI' interactive > '$WORK/interactive-install.log' \
   && [ -f '$interactive_target/.codex/agents/kotlin-spring-reviewer.toml' ] \
   && [ -f '$interactive_target/.codex/agents/test-runner.toml' ] \
   && [ ! -e '$interactive_target/.codex/agents/postgres-dba.toml' ] \
   && grep -Fq '변경 미리보기' '$WORK/interactive-install.log'"
record 'guided installer removes one selected feature and preserves the other' \
  "printf '2\n%s\n2\n1\n2\n12\ny\n' '$interactive_target' \
     | HOME='$user_target' VULPORA_STATE_HOME='$VULPORA_STATE_HOME' \
       VULPORA_RUNTIME=codex PATH='$interactive_bin:$PATH' bash '$CLI' interactive > '$WORK/interactive-uninstall.log' \
   && [ -f '$interactive_target/.codex/agents/kotlin-spring-reviewer.toml' ] \
   && [ ! -e '$interactive_target/.codex/agents/test-runner.toml' ] \
   && grep -Fq 'kept_unselected: .codex/agents/kotlin-spring-reviewer.toml' \
        '$WORK/interactive-uninstall.log'"
record 'guided installer installs a selected Codex skill' \
  "mkdir -p '$WORK/interactive-skill' \
   && printf '2\n%s\n1\n4\n2\n1\ny\n' '$WORK/interactive-skill' \
     | HOME='$user_target' VULPORA_STATE_HOME='$VULPORA_STATE_HOME' \
       VULPORA_RUNTIME=codex PATH='$interactive_bin:$PATH' bash '$CLI' interactive > '$WORK/interactive-skill.log' \
   && [ -f '$WORK/interactive-skill/.agents/skills/agent-eval/SKILL.md' ] \
   && [ ! -e '$WORK/interactive-skill/.codex/agents' ] \
   && grep -Fq '스킬: agent-eval' '$WORK/interactive-skill.log'"
record 'plain agents plus skills accepts zero root skills while resolving agent dependencies' \
  "mkdir -p '$WORK/plain-no-skills' \
   && printf '2\n%s\n1\n5\n2\n1\n2\n0\ny\n' '$WORK/plain-no-skills' \
     | HOME='$user_target' VULPORA_STATE_HOME='$VULPORA_STATE_HOME' \
       VULPORA_RUNTIME=codex PATH='$interactive_bin:$PATH' bash '$CLI' interactive > '$WORK/plain-no-skills.log' \
   && [ -f '$WORK/plain-no-skills/.codex/agents/postgres-dba.toml' ] \
   && [ -f '$WORK/plain-no-skills/.agents/skills/postgres-code-authoring/SKILL.md' ] \
   && [ ! -e '$WORK/plain-no-skills/.agents/skills/agent-eval' ] \
   && grep -Fq '스킬: 선택 안 함 (0개)' '$WORK/plain-no-skills.log' \
   && grep -Fq '에이전트와 스킬의 품질·보안을 평가' '$WORK/plain-no-skills.log'"
record 'guided installer cancellation leaves both runtimes untouched' \
  "mkdir -p '$WORK/cancel-project' \
   && printf '2\n%s\n1\n1\n1\nn\n' '$WORK/cancel-project' \
     | HOME='$user_target' VULPORA_STATE_HOME='$VULPORA_STATE_HOME' \
       PATH='$interactive_bin:$PATH' bash '$CLI' interactive > '$WORK/interactive-cancel.log' \
   && [ ! -e '$WORK/cancel-project/.codex' ] \
   && [ ! -e '$WORK/cancel-project/.claude' ] \
   && grep -Fq '변경한 파일이 없습니다' '$WORK/interactive-cancel.log'"
record 'TTY interface supports arrow and checkbox agent selection' \
  "mkdir -p '$WORK/tui-project' \
   && tui_install_keys \
     | HOME='$user_target' VULPORA_STATE_HOME='$VULPORA_STATE_HOME' \
       VULPORA_RUNTIME=codex VULPORA_UI=tui TERM=xterm PATH='$interactive_bin:$PATH' \
       bash '$CLI' interactive > '$WORK/interactive-tui.log' \
   && [ -f '$WORK/tui-project/.codex/agents/kotlin-spring-reviewer.toml' ] \
   && [ -f '$WORK/tui-project/.codex/agents/test-runner.toml' ] \
   && [ ! -e '$WORK/tui-project/.codex/agents/postgres-dba.toml' ] \
   && grep -Fq 'VULPORA' '$WORK/interactive-tui.log' \
   && grep -Fq 'space 선택' '$WORK/interactive-tui.log' \
   && grep -Fq '[x]' '$WORK/interactive-tui.log' \
   && grep -Fq 'Kotlin + Spring 코드 리뷰' '$WORK/interactive-tui.log' \
   && grep -Fq '변경 미리보기 생성' '$WORK/interactive-tui.log' \
   && grep -Fq '[====' '$WORK/interactive-tui.log' \
   && grep -Fq '현재 작업 · 대상 파일과 설정 확인 중' '$WORK/interactive-tui.log' \
   && grep -Fq '현재 작업 · 파일과 런타임 설정 반영 중' '$WORK/interactive-tui.log' \
   && grep -Fq '최근 작업 로그' '$WORK/interactive-tui.log' \
   && grep -Fq '에이전트·스킬 작업' '$WORK/interactive-tui.log' \
   && grep -Fq '완료되면 자동으로 다음 화면으로 이동합니다' '$WORK/interactive-tui.log' \
   && grep -Fq '미리보기' '$WORK/interactive-tui.log' \
   && grep -Fq \$'\033[?2026h' '$WORK/interactive-tui.log' \
   && ! grep -Fq \$'\033[2J' '$WORK/interactive-tui.log' \
   && ! grep -Fq '번호를 쉼표' '$WORK/interactive-tui.log'"
record 'TTY agents plus skills accepts zero root skills while resolving agent dependencies' \
  "mkdir -p '$WORK/tui-no-skills' \
   && tui_agent_without_skills_keys \
     | HOME='$user_target' VULPORA_STATE_HOME='$VULPORA_STATE_HOME' \
       VULPORA_RUNTIME=codex VULPORA_UI=tui TERM=xterm PATH='$interactive_bin:$PATH' \
       bash '$CLI' interactive > '$WORK/tui-no-skills.log' \
   && [ -f '$WORK/tui-no-skills/.codex/agents/postgres-dba.toml' ] \
   && [ -f '$WORK/tui-no-skills/.agents/skills/postgres-code-authoring/SKILL.md' ] \
   && [ ! -e '$WORK/tui-no-skills/.agents/skills/agent-eval' ] \
   && grep -Fq '스킬: 0개' '$WORK/tui-no-skills.log' \
   && grep -Fq '에이전트와 스킬의 품질·보안을 평가' '$WORK/tui-no-skills.log'"
record 'TTY interface exposes selected and full removal on the first screen' \
  "mkdir -p '$WORK/tui-quit' \
   && printf 'q' \
     | HOME='$user_target' VULPORA_STATE_HOME='$VULPORA_STATE_HOME' \
       VULPORA_RUNTIME=codex VULPORA_UI=tui TERM=xterm PATH='$interactive_bin:$PATH' \
       bash '$CLI' interactive > '$WORK/interactive-tui-quit.log' \
   && [ ! -e '$WORK/tui-quit/.codex' ] \
   && grep -Fq '무엇을 할까요?' '$WORK/interactive-tui-quit.log' \
   && grep -Fq '선택 제거' '$WORK/interactive-tui-quit.log' \
   && grep -Fq '전체 제거' '$WORK/interactive-tui-quit.log' \
   && grep -Fq \$'\033[?1049h' '$WORK/interactive-tui-quit.log' \
   && grep -Fq \$'\033[?1049l' '$WORK/interactive-tui-quit.log' \
   && grep -Fq \$'\033[?25h' '$WORK/interactive-tui-quit.log' \
   && ! grep -Fq \$'\033[2J' '$WORK/interactive-tui-quit.log' \
   && grep -Fq '변경한 파일이 없습니다' '$WORK/interactive-tui-quit.log'"
record 'TTY action-to-runtime transition clears stale text on every row' \
  "printf '\nq' \
     | HOME='$user_target' VULPORA_STATE_HOME='$VULPORA_STATE_HOME' \
       VULPORA_UI=tui NO_COLOR=1 TERM=xterm PATH='$interactive_bin:$PATH' \
       bash '$CLI' interactive > '$WORK/interactive-tui-transition.log' \
   && grep -Fq \$'  > Claude Code\033[K\n' '$WORK/interactive-tui-transition.log' \
   && grep -Fq \$'    Codex\033[K\n' '$WORK/interactive-tui-transition.log' \
   && grep -Fq \$'    둘 다\033[K\n' '$WORK/interactive-tui-transition.log' \
   && grep -Fq \$'  CLI 감지됨\033[K\n' '$WORK/interactive-tui-transition.log' \
   && ! grep -Fq \$'\033[2J' '$WORK/interactive-tui-transition.log'"
record 'TTY selected removal deletes one agent and preserves the other' \
  "tui_remove_test_runner_keys \
     | HOME='$user_target' VULPORA_STATE_HOME='$VULPORA_STATE_HOME' \
       VULPORA_RUNTIME=codex VULPORA_UI=tui TERM=xterm PATH='$interactive_bin:$PATH' \
       bash '$CLI' interactive > '$WORK/interactive-tui-remove.log' \
   && [ -f '$WORK/tui-project/.codex/agents/kotlin-spring-reviewer.toml' ] \
   && [ ! -e '$WORK/tui-project/.codex/agents/test-runner.toml' ] \
   && grep -Fq '제거할 에이전트' '$WORK/interactive-tui-remove.log' \
   && grep -Fq 'Vulpora 선택 제거 완료' '$WORK/interactive-tui-remove.log'"
record 'removed onboarding option fails with a migration message' \
  "output=\$(bash '$CLI' setup --runtime all --target '$all_target' --onboard notion-domain-researcher 2>&1); rc=\$?; \
   [ \$rc -ne 0 ] && printf '%s\\n' \"\$output\" | grep -Fq -- '--onboard는 1.0.0에서 제거'"
record 'unknown runtime fails closed' \
  "output=\$(bash '$CLI' setup --runtime unknown --target '$all_target' 2>&1); rc=\$?; \
   [ \$rc -ne 0 ] && printf '%s\\n' \"\$output\" | grep -Fq -- '--runtime auto|codex|claude-code|all'"
record 'custom CODEX_HOME user scope fails closed instead of misplacing agents' \
  "output=\$(HOME='$WORK/custom-user' CODEX_HOME='$WORK/custom-codex' bash '$CLI' setup --runtime codex --scope user --target '$all_target' 2>&1); rc=\$?; \
   [ \$rc -ne 0 ] && printf '%s\\n' \"\$output\" | grep -Fq 'custom CODEX_HOME의 user scope'"
record 'user scope explicit target cannot escape canonical HOME' \
  "output=\$(HOME='$user_target' CODEX_HOME= bash '$CLI' setup --runtime codex --scope user --target '$all_target' test-runner 2>&1); rc=\$?; \
   [ \$rc -ne 0 ] && printf '%s\\n' \"\$output\" | grep -Fq 'exact canonical HOME'"
record 'help exposes receipt-safe uninstall and complete user defaults' \
  "output=\$(bash '$CLI' --help); printf '%s\n' \"\$output\" | grep -Fq 'vulpora uninstall [--runtime auto|codex|claude-code|all]' \
   && printf '%s\n' \"\$output\" | grep -Fq 'to all agents and skills' \
   && printf '%s\n' \"\$output\" | grep -Fq 'guided installer'"

if command -v codex >/dev/null 2>&1 && command -v claude >/dev/null 2>&1; then
  record 'doctor verifies both installed runtime targets without live calls' \
    "bash '$CLI' doctor --runtime all --target '$all_target' test-runner >/dev/null"

  fake_claude_bin="$WORK/fake-claude-bin"
  fake_codex_bin="$WORK/fake-codex-bin"
  mkdir -p "$fake_claude_bin" "$fake_codex_bin"
  ln -s "$(type -P false)" "$fake_claude_bin/claude"
  ln -s "$(type -P false)" "$fake_codex_bin/codex"
  record 'Codex-only doctor never executes the Claude plugin probe' \
    "PATH='$fake_claude_bin:$PATH' bash '$CLI' doctor --runtime codex --target '$all_target' test-runner >/dev/null"
  record 'Claude-only doctor never executes the Codex plugin probe' \
    "PATH='$fake_codex_bin:$PATH' bash '$CLI' doctor --runtime claude-code --target '$all_target' test-runner >/dev/null"
else
  missing_runtime_clis=''
  for runtime_cli in codex claude; do
    command -v "$runtime_cli" >/dev/null 2>&1 \
      || missing_runtime_clis="${missing_runtime_clis:+$missing_runtime_clis, }$runtime_cli"
  done
  printf '  - real-runtime doctor branch requires both Codex and Claude CLIs; unavailable: %s (skipped)\n' "$missing_runtime_clis"
fi

printf '결과: PASS=%s FAIL=%s\n' "$pass" "$fail"
[ "$fail" = 0 ]
