#!/usr/bin/env bash
# runtime 자동 감지 계약을 검증한다.
#
# 핵심 요구: 설치할 때 codex/claude 전용을 따지지 않고, 이 머신에 실제로 있는
# runtime을 감지해 감지된 곳 전부에 설치한다.
#
# 사용법: bash install/test-runtime-autodetect.sh

set -u
set -o pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"
CLI="$REPO_ROOT/vulpora"
DETECT="$SCRIPT_DIR/runtime-detect.sh"
POSTINSTALL="$SCRIPT_DIR/npm-postinstall.sh"
PREUNINSTALL="$SCRIPT_DIR/npm-preuninstall.sh"

WORK="$(mktemp -d "${TMPDIR:-/tmp}/vulpora-autodetect.XXXXXX")" || exit 1
cleanup() {
  case "$WORK" in "${TMPDIR:-/tmp}"/vulpora-autodetect.*) rm -rf "$WORK" ;; esac
}
trap cleanup EXIT HUP INT TERM

pass=0
fail=0
record() {
  if eval "$2" >/dev/null 2>&1; then
    printf '  ✓ %s\n' "$1"
    pass=$((pass + 1))
  else
    printf '  ✗ %s\n' "$1"
    fail=$((fail + 1))
  fi
}

# 감지 대상 CLI만 담은 PATH를 만든다. 실제 실행 능력은 필요 없고 존재 여부만 본다.
make_bin() { # dir cli...
  bin_dir="$1"; shift
  mkdir -p "$bin_dir"
  for stub_name in "$@"; do
    printf '#!/bin/sh\nexit 0\n' > "$bin_dir/$stub_name"
    chmod +x "$bin_dir/$stub_name"
  done
}

make_bin "$WORK/bin-both" claude codex
make_bin "$WORK/bin-claude" claude
make_bin "$WORK/bin-codex" codex
mkdir -p "$WORK/bin-none"

printf 'runtime autodetect contract\n'

# --- helper 단위 계약 -------------------------------------------------------

record 'helper가 두 CLI를 모두 감지한다' \
  "[ \"\$(VULPORA_DETECT_PATH='$WORK/bin-both' bash -c '. \"\$1\"; vulpora_detect_runtimes' _ '$DETECT')\" \
     = 'claude-code codex' ]"

record 'helper가 Claude Code만 감지한다' \
  "[ \"\$(VULPORA_DETECT_PATH='$WORK/bin-claude' bash -c '. \"\$1\"; vulpora_detect_runtimes' _ '$DETECT')\" \
     = 'claude-code' ]"

record 'helper가 Codex만 감지한다' \
  "[ \"\$(VULPORA_DETECT_PATH='$WORK/bin-codex' bash -c '. \"\$1\"; vulpora_detect_runtimes' _ '$DETECT')\" \
     = 'codex' ]"

record '감지 결과가 없으면 auto resolve가 실패한다' \
  "! VULPORA_DETECT_PATH='$WORK/bin-none' bash -c '. \"\$1\"; vulpora_resolve_runtimes auto' _ '$DETECT'"

record 'all selector는 감지와 무관하게 두 runtime을 유지한다' \
  "[ \"\$(VULPORA_DETECT_PATH='$WORK/bin-none' bash -c '. \"\$1\"; vulpora_resolve_runtimes all' _ '$DETECT')\" \
     = 'claude-code codex' ]"

record '지원하지 않는 selector는 rc=2로 구분된다' \
  "bash -c '. \"\$1\"; vulpora_resolve_runtimes bogus; [ \$? = 2 ]' _ '$DETECT'"

record '비표준 IFS에서도 목록 순회가 동작한다' \
  "[ \"\$(bash -c 'IFS=; . \"\$1\"; vulpora_runtime_list_label \"claude-code codex\"' _ '$DETECT')\" \
     = 'Claude Code + Codex' ]"

# --- CLI 통합 계약 ----------------------------------------------------------

run_cli() { # bin-dir args...
  bin_dir="$1"; shift
  VULPORA_RUNTIME_PATH="$bin_dir" bash "$CLI" "$@"
}

mkdir -p "$WORK/both" "$WORK/only-codex" "$WORK/only-claude" "$WORK/none" "$WORK/explicit"

record 'runtime 미지정 설치가 감지된 두 runtime 모두에 설치한다' \
  "run_cli '$WORK/bin-both' setup --scope project --target '$WORK/both' entity \
   && [ -f '$WORK/both/.claude/skills/entity/SKILL.md' ] \
   && [ -f '$WORK/both/.agents/skills/entity/SKILL.md' ]"

record 'Codex만 있으면 Codex discovery 경로에만 설치한다' \
  "run_cli '$WORK/bin-codex' setup --scope project --target '$WORK/only-codex' entity \
   && [ -f '$WORK/only-codex/.agents/skills/entity/SKILL.md' ] \
   && [ ! -e '$WORK/only-codex/.claude' ]"

record 'Claude Code만 있으면 Claude discovery 경로에만 설치한다' \
  "run_cli '$WORK/bin-claude' setup --scope project --target '$WORK/only-claude' entity \
   && [ -f '$WORK/only-claude/.claude/skills/entity/SKILL.md' ] \
   && [ ! -e '$WORK/only-claude/.agents' ]"

record '감지된 runtime이 없으면 아무것도 바꾸지 않고 안내와 함께 실패한다' \
  "output=\$(run_cli '$WORK/bin-none' setup --scope project --target '$WORK/none' entity 2>&1); rc=\$?; \
   [ \$rc -ne 0 ] \
   && printf '%s\\n' \"\$output\" | grep -Fq 'CLI를 모두 찾지 못했습니다' \
   && [ -z \"\$(find '$WORK/none' -mindepth 1 -print -quit)\" ]"

record '자동 감지 결과를 사용자에게 표시한다' \
  "output=\$(run_cli '$WORK/bin-both' setup --scope project --target '$WORK/both' --dry-run entity 2>&1) \
   && printf '%s\\n' \"\$output\" | grep -Fq '런타임 자동 감지: Claude Code + Codex'"

record '명시 --runtime은 감지 결과를 무시하고 그대로 쓴다' \
  "run_cli '$WORK/bin-both' setup --runtime codex --scope project --target '$WORK/explicit' entity \
   && [ -f '$WORK/explicit/.agents/skills/entity/SKILL.md' ] \
   && [ ! -e '$WORK/explicit/.claude' ]"

record '명시 --runtime에는 자동 감지 안내를 붙이지 않는다' \
  "output=\$(run_cli '$WORK/bin-both' setup --runtime codex --scope project --target '$WORK/explicit' --dry-run entity 2>&1) \
   && ! printf '%s\\n' \"\$output\" | grep -Fq '런타임 자동 감지'"

record '잘못된 selector는 auto를 포함한 사용법으로 실패한다' \
  "output=\$(run_cli '$WORK/bin-both' setup --runtime bogus --scope project --target '$WORK/explicit' entity 2>&1); rc=\$?; \
   [ \$rc -ne 0 ] && printf '%s\\n' \"\$output\" | grep -Fq -- '--runtime auto|codex|claude-code|all'"

record 'doctor도 runtime 미지정으로 감지된 runtime을 검증한다' \
  "output=\$(run_cli '$WORK/bin-both' doctor --scope project --target '$WORK/both' entity 2>&1) \
   && printf '%s\\n' \"\$output\" | grep -Fq '런타임 자동 감지'"

record 'uninstall도 runtime 미지정으로 감지된 runtime에서 제거한다' \
  "run_cli '$WORK/bin-both' uninstall --scope project --target '$WORK/both' entity >/dev/null 2>&1; \
   [ ! -e '$WORK/both/.claude/skills/entity' ] && [ ! -e '$WORK/both/.agents/skills/entity' ]"

# --- 다중 runtime setup의 preflight/부분 실패 계약 --------------------------

# 실제 installer와 같은 CLI 호출 계약을 가지는 작은 harness로 phase 순서와
# 실패 후 계속 실행/재시도를 결정적으로 관찰한다.
HARNESS="$WORK/setup-harness"
HARNESS_LOG="$WORK/setup-harness.log"
HARNESS_STATE="$WORK/setup-harness-state"
HARNESS_TARGET="$WORK/setup-harness-target"
mkdir -p "$HARNESS/install" "$HARNESS_STATE" "$HARNESS_TARGET"
cp "$CLI" "$HARNESS/vulpora"
cp "$DETECT" "$HARNESS/install/runtime-detect.sh"
printf '#!/bin/sh\nexit 0\n' > "$HARNESS/install/check-manifest.sh"
printf '#!/bin/sh\nexit 0\n' > "$HARNESS/install/uninstall.sh"
printf '#!/bin/sh\nexit 0\n' > "$HARNESS/install/interactive.sh"
printf '#!/bin/sh\nexit 0\n' > "$HARNESS/install/mcp-manager.sh"
printf 'test\n' > "$HARNESS/VERSION"
cat > "$HARNESS/install/install.sh" <<'HARNESS_INSTALL'
#!/bin/bash
set -u
runtime=''
phase=preflight
while [ "$#" -gt 0 ]; do
  case "$1" in
    --runtime) runtime="$2"; shift 2 ;;
    --apply) phase=apply; shift ;;
    --verify) phase=verify; shift ;;
    *) shift ;;
  esac
done
printf '%s %s\n' "$phase" "$runtime" >> "$FAKE_INSTALL_LOG"
if [ "$phase" = preflight ] && [ "$runtime" = codex ] \
  && [ -f "$FAKE_INSTALL_STATE/fail-preflight-codex" ]; then
  exit 7
fi
if [ "$phase" = apply ] && [ "$runtime" = claude-code ] \
  && [ -f "$FAKE_INSTALL_STATE/fail-apply-claude" ]; then
  exit 8
fi
if [ "$phase" = apply ]; then
  mkdir -p "$FAKE_INSTALL_STATE/applied"
  : > "$FAKE_INSTALL_STATE/applied/$runtime"
fi
exit 0
HARNESS_INSTALL
chmod +x "$HARNESS/vulpora" "$HARNESS/install/"*.sh

touch "$HARNESS_STATE/fail-preflight-codex"
record '한 runtime의 preflight 실패 시 모든 runtime을 검사하고 apply 전부를 중단한다' \
  "output=\$(FAKE_INSTALL_LOG='$HARNESS_LOG' FAKE_INSTALL_STATE='$HARNESS_STATE' \
      VULPORA_RUNTIME_PATH='$WORK/bin-both' bash '$HARNESS/vulpora' setup \
      --runtime all --scope project --target '$HARNESS_TARGET' entity 2>&1); rc=\$?; \
   [ \$rc = 7 ] \
   && [ \"\$(cat '$HARNESS_LOG')\" = \"preflight claude-code
preflight codex\" ] \
   && [ ! -e '$HARNESS_STATE/applied' ] \
   && printf '%s\n' \"\$output\" | grep -Fq 'setup_preflight_aborted: 변경 없음'"

: > "$HARNESS_LOG"
rm -f "$HARNESS_STATE/fail-preflight-codex"
touch "$HARNESS_STATE/fail-apply-claude"
record 'preflight 후 한 runtime 적용 실패는 다른 대상을 계속하고 부분 실패를 보고한다' \
  "output=\$(FAKE_INSTALL_LOG='$HARNESS_LOG' FAKE_INSTALL_STATE='$HARNESS_STATE' \
      VULPORA_RUNTIME_PATH='$WORK/bin-both' bash '$HARNESS/vulpora' setup \
      --runtime all --scope project --target '$HARNESS_TARGET' entity 2>&1); rc=\$?; \
   [ \$rc = 8 ] \
   && [ -f '$HARNESS_STATE/applied/codex' ] \
   && grep -Fqx 'apply codex' '$HARNESS_LOG' \
   && grep -Fqx 'verify codex' '$HARNESS_LOG' \
   && printf '%s\n' \"\$output\" | grep -Fq 'setup_partial_failure:' \
   && printf '%s\n' \"\$output\" | grep -Fq 'setup_retry:'"

: > "$HARNESS_LOG"
rm -f "$HARNESS_STATE/fail-apply-claude"
record '부분 실패 뒤 동일 setup 명령 재시도가 모든 runtime에서 멱등 완료된다' \
  "FAKE_INSTALL_LOG='$HARNESS_LOG' FAKE_INSTALL_STATE='$HARNESS_STATE' \
      VULPORA_RUNTIME_PATH='$WORK/bin-both' bash '$HARNESS/vulpora' setup \
      --runtime all --scope project --target '$HARNESS_TARGET' entity >/dev/null 2>&1 \
   && [ -f '$HARNESS_STATE/applied/claude-code' ] \
   && [ -f '$HARNESS_STATE/applied/codex' ] \
   && [ \"\$(grep -c '^preflight ' '$HARNESS_LOG')\" = 2 ] \
   && [ \"\$(grep -c '^apply ' '$HARNESS_LOG')\" = 2 ] \
   && [ \"\$(grep -c '^verify ' '$HARNESS_LOG')\" = 2 ]"

record 'mcp list는 runtime 없이 그대로 동작한다' \
  "output=\$(run_cli '$WORK/bin-both' mcp list) \
   && printf '%s\\n' \"\$output\" | grep -Fq 'https://mcp.notion.com/mcp'"

record 'mcp 작업은 감지된 runtime이 없으면 안내와 함께 실패한다' \
  "output=\$(run_cli '$WORK/bin-none' mcp status --scope project --target '$WORK/none' notion 2>&1); rc=\$?; \
   [ \$rc -ne 0 ] && printf '%s\\n' \"\$output\" | grep -Fq 'CLI를 모두 찾지 못했습니다'"

record 'npm postinstall이 runtime을 고정하지 않는다' \
  "grep -Fq 'setup --runtime auto --scope user' '$SCRIPT_DIR/npm-postinstall.sh' \
   && ! grep -Fq 'setup --runtime codex' '$SCRIPT_DIR/npm-postinstall.sh'"

# --- npm lifecycle auto-detection matrix ------------------------------------

lifecycle_bin_for() {
  case "$1" in
    none) printf '%s' "$WORK/bin-none" ;;
    claude) printf '%s' "$WORK/bin-claude" ;;
    codex) printf '%s' "$WORK/bin-codex" ;;
    both) printf '%s' "$WORK/bin-both" ;;
  esac
}

lifecycle_postinstall_case() { # none|claude|codex|both
  lifecycle_case="$1"
  lifecycle_home="$WORK/lifecycle-$lifecycle_case-home"
  lifecycle_state="$WORK/lifecycle-$lifecycle_case-state"
  lifecycle_log="$WORK/lifecycle-$lifecycle_case-post.log"
  lifecycle_bin="$(lifecycle_bin_for "$lifecycle_case")"
  mkdir -p "$lifecycle_home" "$lifecycle_state"
  HOME="$lifecycle_home" CODEX_HOME= CLAUDE_CONFIG_DIR= \
    VULPORA_STATE_HOME="$lifecycle_state" VULPORA_RUNTIME_PATH="$lifecycle_bin" \
    npm_config_global=true /bin/bash "$POSTINSTALL" > "$lifecycle_log" 2>&1 \
    || return 1
  case "$lifecycle_case" in
    none)
      [ ! -e "$lifecycle_home/.claude" ] && [ ! -e "$lifecycle_home/.codex" ] \
        && grep -Fq 'auto-setup이 완료되지 않았습니다' "$lifecycle_log"
      ;;
    claude)
      [ -f "$lifecycle_home/.claude/agents/task-orchestrator.md" ] \
        && [ -f "$lifecycle_home/.claude/skills/test-authoring/SKILL.md" ] \
        && [ ! -e "$lifecycle_home/.codex" ]
      ;;
    codex)
      [ -f "$lifecycle_home/.codex/agents/task-orchestrator.md" ] \
        && [ -f "$lifecycle_home/.agents/skills/test-authoring/SKILL.md" ] \
        && [ ! -e "$lifecycle_home/.claude" ]
      ;;
    both)
      [ -f "$lifecycle_home/.claude/agents/task-orchestrator.md" ] \
        && [ -f "$lifecycle_home/.codex/agents/task-orchestrator.md" ] \
        && [ -f "$lifecycle_home/.claude/skills/test-authoring/SKILL.md" ] \
        && [ -f "$lifecycle_home/.agents/skills/test-authoring/SKILL.md" ]
      ;;
  esac
}

lifecycle_preuninstall_case() { # none|claude|codex|both
  lifecycle_case="$1"
  lifecycle_home="$WORK/lifecycle-$lifecycle_case-home"
  lifecycle_state="$WORK/lifecycle-$lifecycle_case-state"
  lifecycle_log="$WORK/lifecycle-$lifecycle_case-pre.log"
  lifecycle_bin="$(lifecycle_bin_for "$lifecycle_case")"
  HOME="$lifecycle_home" CODEX_HOME= CLAUDE_CONFIG_DIR= \
    VULPORA_STATE_HOME="$lifecycle_state" VULPORA_RUNTIME_PATH="$lifecycle_bin" \
    npm_config_global=true /bin/bash "$PREUNINSTALL" > "$lifecycle_log" 2>&1 \
    || return 1
  [ ! -e "$lifecycle_home/.claude/agents/task-orchestrator.md" ] \
    && [ ! -e "$lifecycle_home/.codex/agents/task-orchestrator.md" ] \
    && [ ! -e "$lifecycle_home/.claude/skills/test-authoring" ] \
    && [ ! -e "$lifecycle_home/.agents/skills/test-authoring" ] \
    && [ ! -e "$lifecycle_home/.vulpora/receipts/v1/claude-code.tsv" ] \
    && [ ! -e "$lifecycle_home/.vulpora/receipts/v1/codex.tsv" ]
}

for lifecycle_case in none claude codex both; do
  record "npm postinstall auto 감지: $lifecycle_case" \
    "lifecycle_postinstall_case '$lifecycle_case'"
  record "npm preuninstall auto 정리: $lifecycle_case" \
    "lifecycle_preuninstall_case '$lifecycle_case'"
done

record 'npm preuninstall도 runtime을 고정하지 않는다' \
  "grep -Fq 'uninstall --runtime auto --scope user' '$SCRIPT_DIR/npm-preuninstall.sh' \
   && ! grep -Fq 'uninstall --runtime codex' '$SCRIPT_DIR/npm-preuninstall.sh'"

record '대화형 설치기가 런타임을 더 이상 묻지 않는다' \
  "! grep -Fq '사용할 런타임을 선택하세요' '$SCRIPT_DIR/interactive.sh' \
   && grep -Fq '런타임 자동 감지' '$SCRIPT_DIR/interactive.sh'"

printf '결과: PASS=%s FAIL=%s\n' "$pass" "$fail"
[ "$fail" = 0 ]
