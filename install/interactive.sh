#!/bin/bash
# Guided Vulpora installer. Uses the public CLI so interactive and scripted
# installs share the same validation, receipts, and safe-uninstall behavior.

set -euo pipefail
set -f

CLI="${1:-}"
MANIFEST="$(cd "$(dirname "$0")" && pwd -P)/manifest.txt"
MCP_CATALOG="$(cd "$(dirname "$0")" && pwd -P)/mcp-packs.txt"
SKILL_CATALOG="$(cd "$(dirname "$0")" && pwd -P)/skill-catalog.txt"
RUNTIME_PATH="${VULPORA_RUNTIME_PATH:-${PATH:-}}"
INCLUDE_AGENTS=0
INCLUDE_SKILLS=0
INCLUDE_MCP=0
SELECT_ALL=0
SELECTED_ASSETS=""
SKILL_SELECT_ALL=0
SELECTED_SKILLS=""
MCP_SELECT_ALL=0
SELECTED_MCPS=""
CATALOG_ALL=0
PURGE_ALL=0
PARTIAL_UNINSTALL=0
UI_MODE="${VULPORA_UI:-auto}"
TUI_KEY=""
TUI_SELECTED_VALUE=""
TUI_SELECTED_VALUES=""
TUI_SELECTED_COUNT=0
TUI_MESSAGE=""
TUI_ACTIVITY_PID=""
TUI_ACTIVITY_STOP=""
TUI_ACTIVITY_DIR=""
TUI_ACTIVITY_OUTPUT=""

case "$UI_MODE" in
  auto)
    if [ -t 0 ] && [ -t 1 ] && [ "${TERM:-dumb}" != dumb ]; then UI_MODE=tui; else UI_MODE=plain; fi
    ;;
  tui|plain) ;;
  *) printf '오류: VULPORA_UI는 auto, tui, plain 중 하나여야 합니다.\n' >&2; exit 1 ;;
esac

ESC="$(printf '\033')"
CTRL_RESET="${ESC}[0m"
CTRL_HOME="${ESC}[H"
CTRL_CLEAR_REST="${ESC}[J"
CTRL_CLEAR_LINE="${ESC}[K"
CTRL_ALT_ENTER="${ESC}[?1049h"
CTRL_ALT_LEAVE="${ESC}[?1049l"
CTRL_CURSOR_HIDE="${ESC}[?25l"
CTRL_CURSOR_SHOW="${ESC}[?25h"
# Synchronized output is ignored by terminals that do not support it and makes
# a complete frame appear at once in terminals that do.
CTRL_SYNC_START="${ESC}[?2026h"
CTRL_SYNC_END="${ESC}[?2026l"
TUI_ACTIVE=0
TUI_FRAME_OPEN=0
if [ "$UI_MODE" = tui ] && [ -z "${NO_COLOR:-}" ]; then
  C_ACCENT="${ESC}[38;5;75m"
  C_GREEN="${ESC}[38;5;42m"
  C_WARN="${ESC}[38;5;214m"
  C_MUTED="${ESC}[38;5;244m"
  C_BOLD="${ESC}[1m"
  C_RESET="$CTRL_RESET"
else
  C_ACCENT=""; C_GREEN=""; C_WARN=""; C_MUTED=""; C_BOLD=""; C_RESET=""
fi

tui_start() {
  [ "$UI_MODE" = tui ] || return 0
  [ "$TUI_ACTIVE" = 0 ] || return 0
  printf '%s%s%s%s' "$CTRL_ALT_ENTER" "$CTRL_HOME" "$CTRL_CLEAR_REST" "$CTRL_CURSOR_HIDE"
  TUI_ACTIVE=1
}

tui_frame_begin() {
  printf '%s%s' "$CTRL_SYNC_START" "$CTRL_HOME"
  TUI_FRAME_OPEN=1
}

tui_frame_end() {
  [ "$TUI_FRAME_OPEN" = 1 ] || return 0
  printf '%s%s' "$CTRL_CLEAR_REST" "$CTRL_SYNC_END"
  TUI_FRAME_OPEN=0
}

tui_cursor_show() { [ "$TUI_ACTIVE" = 0 ] || printf '%s' "$CTRL_CURSOR_SHOW"; }
tui_cursor_hide() { [ "$TUI_ACTIVE" = 0 ] || printf '%s' "$CTRL_CURSOR_HIDE"; }

tui_line_end() {
  [ "$TUI_ACTIVE" = 0 ] || printf '%s' "$CTRL_CLEAR_LINE"
  printf '\n'
}

tui_blank() { tui_line_end; }

tui_print_line() {
  printf '%s' "$1"
  tui_line_end
}

tui_stop_activity() {
  [ -z "$TUI_ACTIVITY_STOP" ] || : > "$TUI_ACTIVITY_STOP"
  if [ -n "$TUI_ACTIVITY_PID" ]; then
    wait "$TUI_ACTIVITY_PID" 2>/dev/null || true
    TUI_ACTIVITY_PID=""
  fi
}

tui_cleanup_activity() {
  if [ -n "$TUI_ACTIVITY_DIR" ] && [ -d "$TUI_ACTIVITY_DIR" ] \
    && [ ! -L "$TUI_ACTIVITY_DIR" ]; then
    rm -f "$TUI_ACTIVITY_DIR/output" "$TUI_ACTIVITY_DIR/stop"
    rmdir "$TUI_ACTIVITY_DIR" 2>/dev/null || true
  fi
  TUI_ACTIVITY_DIR=""
  TUI_ACTIVITY_STOP=""
}

tui_restore() {
  tui_stop_activity
  tui_cleanup_activity
  if [ "$TUI_FRAME_OPEN" = 1 ]; then
    printf '%s%s' "$CTRL_CLEAR_REST" "$CTRL_SYNC_END" || true
    TUI_FRAME_OPEN=0
  fi
  if [ "$TUI_ACTIVE" = 1 ]; then
    printf '%s%s%s' "$CTRL_RESET" "$CTRL_CURSOR_SHOW" "$CTRL_ALT_LEAVE" || true
    TUI_ACTIVE=0
  fi
}

tui_signal_exit() { exit 130; }
trap 'tui_restore' EXIT
trap 'tui_signal_exit' HUP INT TERM

die() {
  tui_restore
  printf '%s오류: %s%s\n' "$C_WARN" "$*" "$C_RESET" >&2
  exit 1
}

[ -n "$CLI" ] && [ -f "$CLI" ] || die "vulpora CLI 경로를 확인할 수 없습니다."
[ -f "$MANIFEST" ] || die "manifest.txt를 찾을 수 없습니다."
[ -f "$MCP_CATALOG" ] || die "mcp-packs.txt를 찾을 수 없습니다."
[ -f "$SKILL_CATALOG" ] || die "skill-catalog.txt를 찾을 수 없습니다."

read_answer() {
  ANSWER=""
  IFS= read -r ANSWER || die "입력이 종료되었습니다."
}

tui_clear() { tui_frame_begin; }

tui_activity_recent_logs() { # output-file
  activity_log_file="$1"
  tui_print_line "  ${C_MUTED}최근 작업 로그${C_RESET}"
  if [ ! -s "$activity_log_file" ]; then
    tui_print_line "  ${C_MUTED}> 작업 출력을 기다리는 중...${C_RESET}"
    return
  fi
  tail -n 5 "$activity_log_file" 2>/dev/null \
    | while IFS= read -r activity_log_line; do
        activity_log_line="$(printf '%s' "$activity_log_line" | tr '\r\t' '  ' | cut -c1-100)"
        [ -z "$activity_log_line" ] || tui_print_line "  ${C_MUTED}> ${activity_log_line}${C_RESET}"
      done
}

tui_activity_frame() { # step title hint message tick output-file
  activity_step="$1"; activity_title="$2"; activity_hint="$3"
  activity_message="$4"; activity_tick="$5"; activity_log_file="$6"
  activity_track='............................'
  activity_pulse='===='
  activity_max_pos=$((${#activity_track} - ${#activity_pulse}))
  activity_phase=$((activity_tick % (activity_max_pos * 2)))
  if [ "$activity_phase" -le "$activity_max_pos" ]; then
    activity_pos="$activity_phase"
  else
    activity_pos=$((activity_max_pos * 2 - activity_phase))
  fi
  activity_after=$((activity_pos + ${#activity_pulse}))
  activity_bar="${activity_track:0:activity_pos}${activity_pulse}${activity_track:activity_after}"
  tui_clear
  tui_header "$activity_step" "$activity_title" "$activity_hint"
  tui_print_line "  ${C_ACCENT}[${activity_bar}]${C_RESET}  경과 $((activity_tick / 5))초"
  tui_print_line "  현재 작업 · ${activity_message}"
  tui_blank
  tui_activity_recent_logs "$activity_log_file"
  tui_blank
  tui_print_line "  ${C_MUTED}완료되면 자동으로 다음 화면으로 이동합니다.${C_RESET}"
  tui_frame_end
}

tui_activity_loop() { # stop-file step title hint message output-file
  trap - EXIT HUP INT TERM
  activity_stop_file="$1"; shift
  activity_tick=1
  while [ ! -e "$activity_stop_file" ]; do
    tui_activity_frame "$1" "$2" "$3" "$4" "$activity_tick" "$5"
    activity_tick=$((activity_tick + 1))
    sleep 0.2
  done
}

tui_run_with_activity() { # step title hint message command [args ...]
  activity_step="$1"; activity_title="$2"; activity_hint="$3"; activity_message="$4"
  shift 4
  TUI_ACTIVITY_DIR="$(mktemp -d "${TMPDIR:-/tmp}/vulpora-activity.XXXXXX")" \
    || die "진행 상태 임시 디렉터리를 만들 수 없습니다."
  TUI_ACTIVITY_STOP="$TUI_ACTIVITY_DIR/stop"
  : > "$TUI_ACTIVITY_DIR/output"
  tui_activity_frame "$activity_step" "$activity_title" "$activity_hint" "$activity_message" 0 \
    "$TUI_ACTIVITY_DIR/output"
  tui_activity_loop "$TUI_ACTIVITY_STOP" "$activity_step" "$activity_title" \
    "$activity_hint" "$activity_message" "$TUI_ACTIVITY_DIR/output" &
  TUI_ACTIVITY_PID=$!
  set +e
  "$@" > "$TUI_ACTIVITY_DIR/output" 2>&1
  activity_rc=$?
  set -e
  tui_stop_activity
  TUI_ACTIVITY_OUTPUT="$(< "$TUI_ACTIVITY_DIR/output")"
  tui_cleanup_activity
  return "$activity_rc"
}

tui_header() { # step title hint
  step="$1"; title="$2"; hint="$3"
  printf '  %s%sVULPORA%s  %s%s%s' "$C_ACCENT" "$C_BOLD" "$C_RESET" "$C_MUTED" "$step" "$C_RESET"
  tui_line_end
  tui_blank
  tui_print_line "  $title"
  [ -z "$hint" ] || tui_print_line "  ${C_MUTED}${hint}${C_RESET}"
  tui_blank
}

tui_read_key() {
  key=""; tail=""
  IFS= read -rsn1 key || die "입력이 종료됐습니다."
  if [ "$key" = "$ESC" ]; then
    IFS= read -rsn2 tail || true
    case "$tail" in
      '[A') TUI_KEY=up ;;
      '[B') TUI_KEY=down ;;
      *) TUI_KEY=unknown ;;
    esac
    return
  fi
  case "$key" in
    '') TUI_KEY=enter ;;
    ' ') TUI_KEY=space ;;
    k|K) TUI_KEY=up ;;
    j|J) TUI_KEY=down ;;
    a|A) TUI_KEY=all ;;
    d|D) TUI_KEY=details ;;
    q|Q) TUI_KEY=quit ;;
    *) TUI_KEY=unknown ;;
  esac
}

tui_abort() {
  tui_restore
  printf '%s취소했습니다. 변경한 파일이 없습니다.%s\n' "$C_MUTED" "$C_RESET"
  exit 0
}

row_at() { # rows one-based-index
  printf '%s\n' "$1" | awk -v wanted="$2" 'NR == wanted { print; exit }'
}

row_count() { printf '%s\n' "$1" | awk 'NF { count++ } END { print count + 0 }'; }

tui_select_one() { # step title hint rows default-zero-based
  step="$1"; title="$2"; hint="$3"; rows="$4"; cursor="${5:-0}"
  count="$(row_count "$rows")"
  [ "$count" -gt 0 ] || die "선택 항목이 없습니다: $title"
  TUI_MESSAGE=""
  while :; do
    tui_clear
    tui_header "$step" "$title" "$hint"
    selected_detail=""
    index=0
    while [ "$index" -lt "$count" ]; do
      row="$(row_at "$rows" "$((index + 1))")"
      value="$(printf '%s' "$row" | awk -F'|' '{print $1}')"
      label="$(printf '%s' "$row" | awk -F'|' '{print $2}')"
      detail="$(printf '%s' "$row" | awk -F'|' '{print $3}')"
      enabled="$(printf '%s' "$row" | awk -F'|' '{print $4}')"
      if [ "$index" -eq "$cursor" ]; then
        marker="${C_ACCENT}>${C_RESET}"
        selected_detail="$detail"
        printf '  %b %s%s%s' "$marker" "$C_ACCENT" "$label" "$C_RESET"
        tui_line_end
      elif [ "$enabled" = 1 ]; then
        tui_print_line "    $label"
      else
        tui_print_line "    ${C_MUTED}${label}${C_RESET}"
      fi
      index=$((index + 1))
    done
    tui_blank
    tui_print_line "  ${C_MUTED}${selected_detail}${C_RESET}"
    tui_blank
    [ -z "$TUI_MESSAGE" ] || tui_print_line "  ${C_WARN}${TUI_MESSAGE}${C_RESET}"
    tui_print_line "  ${C_MUTED}j/k 이동  enter 선택  q 종료${C_RESET}"
    tui_frame_end
    tui_read_key
    case "$TUI_KEY" in
      up) cursor=$(((cursor + count - 1) % count)); TUI_MESSAGE="" ;;
      down) cursor=$(((cursor + 1) % count)); TUI_MESSAGE="" ;;
      enter)
        row="$(row_at "$rows" "$((cursor + 1))")"
        enabled="$(printf '%s' "$row" | awk -F'|' '{print $4}')"
        if [ "$enabled" = 1 ]; then
          TUI_SELECTED_VALUE="$(printf '%s' "$row" | awk -F'|' '{print $1}')"
          return
        fi
        TUI_MESSAGE='선택한 항목을 사용할 수 없습니다.'
        ;;
      quit) tui_abort ;;
    esac
  done
}

selection_contains() { # space-delimited-values value
  case " $1 " in *" $2 "*) return 0 ;; *) return 1 ;; esac
}

tui_select_multi() { # step title hint rows [allow-empty]
  step="$1"; title="$2"; hint="$3"; rows="$4"; allow_empty="${5:-0}"; cursor=0; selected=""
  count="$(row_count "$rows")"
  [ "$count" -gt 0 ] || die "선택 항목이 없습니다: $title"
  view_size=9
  TUI_MESSAGE=""
  while :; do
    start=$((cursor - view_size / 2))
    [ "$start" -ge 0 ] || start=0
    max_start=$((count - view_size))
    [ "$max_start" -ge 0 ] || max_start=0
    [ "$start" -le "$max_start" ] || start="$max_start"
    end=$((start + view_size))
    [ "$end" -le "$count" ] || end="$count"
    selected_count=0
    for selected_value in $selected; do selected_count=$((selected_count + 1)); done

    tui_clear
    tui_header "$step" "$title" "$hint"
    printf '  %s선택 %d%s' "$C_ACCENT" "$selected_count" "$C_RESET"
    [ "$start" -eq 0 ] || printf '  %s/ 위에 항목 더 있음%s' "$C_MUTED" "$C_RESET"
    tui_line_end
    tui_blank
    index="$start"
    focused_detail=""
    focused_meta=""
    while [ "$index" -lt "$end" ]; do
      row="$(row_at "$rows" "$((index + 1))")"
      value="$(printf '%s' "$row" | awk -F'|' '{print $1}')"
      label="$(printf '%s' "$row" | awk -F'|' '{print $2}')"
      detail="$(printf '%s' "$row" | awk -F'|' '{print $3}')"
      enabled="$(printf '%s' "$row" | awk -F'|' '{print $4}')"
      meta="$(printf '%s' "$row" | awk -F'|' '{print $5}')"
      if [ "$index" -eq "$cursor" ]; then
        marker="${C_ACCENT}>${C_RESET}"; row_color="$C_ACCENT"
        focused_detail="$detail"; focused_meta="$meta"
      else
        marker=' '; row_color=''
      fi
      if selection_contains "$selected" "$value"; then check="${C_GREEN}[x]${C_RESET}"; else check="${C_MUTED}[ ]${C_RESET}"; fi
      if [ "$enabled" = 1 ]; then
        printf '  %b %b %s%s%s' "$marker" "$check" "$row_color" "$label" "$C_RESET"
      else
        printf '  %b %s[-] %s%s' "$marker" "$C_MUTED" "$label" "$C_RESET"
      fi
      tui_line_end
      index=$((index + 1))
    done
    if [ "$end" -ne "$count" ]; then
      printf '      %s/ 아래에 %d개 더 있음%s' "$C_MUTED" "$((count - end))" "$C_RESET"
      tui_line_end
    fi
    tui_blank
    [ -z "$focused_detail" ] || tui_print_line "  ${C_MUTED}${focused_detail}${C_RESET}"
    [ -z "$focused_meta" ] || tui_print_line "  ${C_MUTED}${focused_meta}${C_RESET}"
    tui_blank
    [ -z "$TUI_MESSAGE" ] || tui_print_line "  ${C_WARN}${TUI_MESSAGE}${C_RESET}"
    if [ "$allow_empty" = 1 ]; then
      tui_print_line "  ${C_MUTED}j/k 이동  space 선택  a 전체  enter 계속(0개 가능)  q 종료${C_RESET}"
    else
      tui_print_line "  ${C_MUTED}j/k 이동  space 선택  a 전체  enter 계속  q 종료${C_RESET}"
    fi

    tui_frame_end
    tui_read_key
    case "$TUI_KEY" in
      up) cursor=$(((cursor + count - 1) % count)); TUI_MESSAGE="" ;;
      down) cursor=$(((cursor + 1) % count)); TUI_MESSAGE="" ;;
      space)
        row="$(row_at "$rows" "$((cursor + 1))")"
        value="$(printf '%s' "$row" | awk -F'|' '{print $1}')"
        enabled="$(printf '%s' "$row" | awk -F'|' '{print $4}')"
        if [ "$enabled" != 1 ]; then
          TUI_MESSAGE='이 항목은 현재 선택할 수 없습니다.'
        elif selection_contains "$selected" "$value"; then
          next_selected=""
          for item in $selected; do [ "$item" = "$value" ] || next_selected="${next_selected:+$next_selected }$item"; done
          selected="$next_selected"; TUI_MESSAGE=""
        else
          selected="${selected:+$selected }$value"; TUI_MESSAGE=""
        fi
        ;;
      all)
        enabled_values=""
        index=0
        while [ "$index" -lt "$count" ]; do
          row="$(row_at "$rows" "$((index + 1))")"
          enabled="$(printf '%s' "$row" | awk -F'|' '{print $4}')"
          value="$(printf '%s' "$row" | awk -F'|' '{print $1}')"
          [ "$enabled" != 1 ] || enabled_values="${enabled_values:+$enabled_values }$value"
          index=$((index + 1))
        done
        if [ "$selected" = "$enabled_values" ]; then selected=""; else selected="$enabled_values"; fi
        TUI_MESSAGE=""
        ;;
      enter)
        if [ -n "$selected" ] || [ "$allow_empty" = 1 ]; then
          ordered=""
          index=0
          while [ "$index" -lt "$count" ]; do
            row="$(row_at "$rows" "$((index + 1))")"
            value="$(printf '%s' "$row" | awk -F'|' '{print $1}')"
            selection_contains "$selected" "$value" \
              && ordered="${ordered:+$ordered }$value"
            index=$((index + 1))
          done
          TUI_SELECTED_VALUES="$ordered"
          TUI_SELECTED_COUNT="$selected_count"
          return
        fi
        TUI_MESSAGE='하나 이상 선택하세요.'
        ;;
      quit) tui_abort ;;
    esac
  done
}

tui_text_prompt() { # step title hint prompt default
  tui_clear
  tui_header "$1" "$2" "$3"
  tui_print_line "  ${C_MUTED}${4}  [${5}]${C_RESET}"
  printf '%s  %s>%s ' "$CTRL_CLEAR_LINE" "$C_ACCENT" "$C_RESET"
  tui_frame_end
  tui_cursor_show
  read_answer
  tui_cursor_hide
}

runtime_available() {
  PATH="$RUNTIME_PATH" command -v "$1" >/dev/null 2>&1
}

print_runtime_status() {
  printf '\n런타임 감지:\n'
  if runtime_available claude; then printf '  ✓ Claude Code\n'; else printf '  - Claude Code CLI 미감지\n'; fi
  if runtime_available codex; then printf '  ✓ Codex\n'; else printf '  - Codex CLI 미감지\n'; fi
}

# 런타임은 묻지 않고 감지한다. 설치 대상은 사용자가 고르는 취향이 아니라 이 머신에
# 실제로 설치돼 있는지의 사실 문제이고, 고르게 하면 없는 런타임을 골라 실패하거나
# 있는 런타임을 빠뜨리게 된다. VULPORA_RUNTIME 으로 명시 지정할 수 있다.
choose_runtime() {
  requested="${VULPORA_RUNTIME:-auto}"
  case "$requested" in
    auto|claude-code|codex|all) ;;
    *) die "VULPORA_RUNTIME은 auto|claude-code|codex|all 중 하나여야 합니다: $requested" ;;
  esac

  if [ "$requested" = auto ]; then
    claude_found=0
    codex_found=0
    runtime_available claude && claude_found=1
    runtime_available codex && codex_found=1
    if [ "$claude_found" = 1 ] && [ "$codex_found" = 1 ]; then
      RUNTIME=all
    elif [ "$claude_found" = 1 ]; then
      RUNTIME=claude-code
    elif [ "$codex_found" = 1 ]; then
      RUNTIME=codex
    else
      die "Claude Code(claude)와 Codex(codex) CLI를 모두 찾지 못했습니다. 하나 이상 설치한 뒤 다시 실행하거나 VULPORA_RUNTIME으로 직접 지정하세요."
    fi
    printf '\n런타임 자동 감지: %s\n' "$(runtime_label)"
  else
    RUNTIME="$requested"
    printf '\n런타임 지정(VULPORA_RUNTIME): %s\n' "$(runtime_label)"
    case "$RUNTIME" in
      claude-code) runtime_available claude || die "Claude Code CLI를 찾을 수 없습니다." ;;
      codex) runtime_available codex || die "Codex CLI를 찾을 수 없습니다." ;;
      all)
        runtime_available claude || die "Claude Code CLI를 찾을 수 없습니다."
        runtime_available codex || die "Codex CLI를 찾을 수 없습니다."
        ;;
    esac
  fi
}

choose_scope() {
  if [ "$UI_MODE" = tui ]; then
    rows="user|내 계정 전체|모든 프로젝트에서 사용|1
project|현재 프로젝트|이 저장소에만 설치|1"
    tui_select_one '2 / 5' '적용 범위' '변경이 적용될 위치를 고르세요.' "$rows" 1
    SCOPE="$TUI_SELECTED_VALUE"
    if [ "$SCOPE" = user ]; then
      TARGET="${HOME:-}"
      [ -d "$TARGET" ] || die "HOME 경로를 확인할 수 없습니다."
      TARGET="$(cd "$TARGET" && pwd -P)"
      return
    fi
    if command -v git >/dev/null 2>&1; then
      DEFAULT_TARGET="$(git -C "$PWD" rev-parse --show-toplevel 2>/dev/null || pwd -P)"
    else
      DEFAULT_TARGET="$(pwd -P)"
    fi
    tui_text_prompt '2 / 5' '프로젝트 경로' 'Enter를 누르면 현재 Git root를 사용합니다.' '경로' "$DEFAULT_TARGET"
    TARGET="${ANSWER:-$DEFAULT_TARGET}"
    [ -d "$TARGET" ] && [ ! -L "$TARGET" ] || die "프로젝트 디렉터리가 없거나 symlink입니다: $TARGET"
    TARGET="$(cd "$TARGET" && pwd -P)"
    return
  fi
  while :; do
    printf '\n설치 범위를 선택하세요.\n'
    printf '  1) 내 계정 전체 (user)\n  2) 현재 프로젝트 (project)\n> '
    read_answer
    case "$ANSWER" in
      1) SCOPE=user; TARGET="${HOME:-}"; [ -d "$TARGET" ] || die "HOME 경로를 확인할 수 없습니다."; break ;;
      2)
        SCOPE=project
        if command -v git >/dev/null 2>&1; then
          DEFAULT_TARGET="$(git -C "$PWD" rev-parse --show-toplevel 2>/dev/null || pwd -P)"
        else
          DEFAULT_TARGET="$(pwd -P)"
        fi
        printf '프로젝트 경로 [%s]: ' "$DEFAULT_TARGET"
        read_answer
        TARGET="${ANSWER:-$DEFAULT_TARGET}"
        [ -d "$TARGET" ] && [ ! -L "$TARGET" ] || die "프로젝트 디렉터리가 없거나 symlink입니다: $TARGET"
        TARGET="$(cd "$TARGET" && pwd -P)"
        break
        ;;
      *) printf '1 또는 2를 입력하세요.\n' ;;
    esac
  done
}

choose_action() {
  if [ "$UI_MODE" = tui ]; then
    rows="setup|설치 또는 업데이트|선택한 항목을 추가·갱신|1
uninstall|선택 제거|고른 에이전트·스킬·MCP만 안전하게 제거|1
purge|Vulpora 전체 제거|Vulpora이 설치한 항목만 정리|1
doctor|상태 점검|파일과 런타임 설정 검증|1"
    tui_select_one '1 / 5' '무엇을 할까요?' '제거 작업도 적용 전에 변경 내역을 확인합니다.' "$rows" 0
    ACTION="$TUI_SELECTED_VALUE"
    case "$ACTION" in
      setup) ACTION_LABEL='설치/업데이트' ;;
      uninstall) ACTION_LABEL='선택 제거' ;;
      purge) ACTION=uninstall; ACTION_LABEL='전체 제거'; PURGE_ALL=1 ;;
      doctor) ACTION_LABEL='상태 점검' ;;
    esac
    return
  fi
  while :; do
    printf '\n작업을 선택하세요.\n'
    printf '  1) 설치 또는 업데이트\n  2) 선택 제거\n  3) 설치 상태 점검\n  4) 전체 제거\n> '
    read_answer
    case "$ANSWER" in
      1) ACTION=setup; ACTION_LABEL='설치/업데이트'; break ;;
      2) ACTION=uninstall; ACTION_LABEL='선택 제거'; break ;;
      3) ACTION=doctor; ACTION_LABEL='상태 점검'; break ;;
      4) ACTION=uninstall; ACTION_LABEL='전체 제거'; PURGE_ALL=1; break ;;
      *) printf '1, 2, 3, 4 중 하나를 입력하세요.\n' ;;
    esac
  done
}

choose_asset_types() {
  agent_total="$(manifest_agent_ids | awk 'NF { count++ } END { print count + 0 }')"
  skill_total="$(manifest_skill_ids | awk 'NF { count++ } END { print count + 0 }')"
  if [ "$UI_MODE" = tui ]; then
    case "$ACTION" in
      setup) package_title='설치할 종류'; package_hint='추가할 기능 종류만 고르세요.' ;;
      uninstall) package_title='제거할 종류'; package_hint='에이전트, 스킬, MCP를 따로 제거할 수도 있습니다.' ;;
      doctor) package_title='점검할 종류'; package_hint='검증할 기능 종류만 고르세요.' ;;
    esac
    rows="agents-skills|에이전트 + 스킬|에이전트 ${agent_total}개와 스킬 ${skill_total}개에서 선택|1
agents|에이전트만|코드 리뷰·DB·QA 등 ${agent_total}개; 설치·점검은 의존 자산 포함|1
skills|스킬 선택|워크플로·검토·생성 스킬 ${skill_total}개; 설치·점검은 의존 자산 포함|1
mcp|MCP만|Notion·OpenAI Docs|1
agents-mcp|에이전트 + MCP|스킬 없이 에이전트와 MCP만 선택|1"
    if [ "$ACTION" != uninstall ]; then
      rows="$rows
everything|전체 카탈로그|에이전트·스킬·MCP 전부|1"
    fi
    tui_select_one '3 / 5' "$package_title" "$package_hint" "$rows" 0
    case "$TUI_SELECTED_VALUE" in
      agents-skills) INCLUDE_AGENTS=1; INCLUDE_SKILLS=1; INCLUDE_MCP=0 ;;
      agents) INCLUDE_AGENTS=1; INCLUDE_SKILLS=0; INCLUDE_MCP=0 ;;
      skills) INCLUDE_AGENTS=0; INCLUDE_SKILLS=1; INCLUDE_MCP=0 ;;
      mcp) INCLUDE_AGENTS=0; INCLUDE_SKILLS=0; INCLUDE_MCP=1 ;;
      agents-mcp) INCLUDE_AGENTS=1; INCLUDE_SKILLS=0; INCLUDE_MCP=1 ;;
      everything) configure_catalog_all ;;
    esac
    return
  fi
  while :; do
    printf '\n설치 패키지 종류를 선택하세요.\n'
    printf '  1) 에이전트만\n  2) MCP만\n  3) 에이전트 + MCP\n'
    printf '  4) 스킬 선택(설치·점검은 의존 자산 포함)\n  5) 에이전트 + 스킬\n  6) 전체 카탈로그\n> '
    read_answer
    case "$ANSWER" in
      1) INCLUDE_AGENTS=1; INCLUDE_SKILLS=0; INCLUDE_MCP=0; return ;;
      2) INCLUDE_AGENTS=0; INCLUDE_SKILLS=0; INCLUDE_MCP=1; return ;;
      3) INCLUDE_AGENTS=1; INCLUDE_SKILLS=0; INCLUDE_MCP=1; return ;;
      4) INCLUDE_AGENTS=0; INCLUDE_SKILLS=1; INCLUDE_MCP=0; return ;;
      5) INCLUDE_AGENTS=1; INCLUDE_SKILLS=1; INCLUDE_MCP=0; return ;;
      6) configure_catalog_all; return ;;
      *) printf '1부터 6 중 하나를 입력하세요.\n' ;;
    esac
  done
}

vulporael() {
  case "$1" in
    postgres-dba) printf 'PostgreSQL DBA·SQL 검토' ;;
    kotlin-spring-reviewer) printf 'Kotlin + Spring 코드 리뷰' ;;
    code-refactor-agent) printf '코드 리팩토링' ;;
    opensearch-expert) printf 'OpenSearch 전문 분석' ;;
    schema-cartographer) printf 'DB 스키마 문서화' ;;
    code-cartographer) printf '코드 흐름·다이어그램' ;;
    agent-evaluator) printf '에이전트 품질 평가' ;;
    java-reviewer) printf 'Java 코드 리뷰' ;;
    architecture-reviewer) printf '아키텍처 리뷰' ;;
    qa-test-designer) printf 'QA·테스트 설계' ;;
    e2e-test-runner) printf 'E2E 테스트 실행' ;;
    test-runner) printf '테스트 실행' ;;
    search-relevance-evaluator) printf '검색 관련성 평가' ;;
    nl-sql-guardian) printf '자연어 SQL 안전 검증' ;;
    index-migration-architect) printf '인덱스 마이그레이션 설계' ;;
    notion-domain-researcher) printf 'Notion 도메인 조사' ;;
    *) printf '%s' "$1" ;;
  esac
}

manifest_agent_ids() {
  awk -F'|' '
    /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
    {
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", $1)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", $2)
      if ($1 == "agent") print $2
    }
  ' "$MANIFEST"
}

manifest_skill_ids() {
  awk -F'|' '
    /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
    {
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", $1)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", $2)
      if ($1 == "skill") print $2
    }
  ' "$MANIFEST"
}

asset_dependencies() {
  awk -F'|' -v wanted_kind="$1" -v wanted="$2" '
    /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
    {
      for (n = 1; n <= 5; n++) gsub(/^[[:space:]]+|[[:space:]]+$/, "", $n)
      if ($1 == wanted_kind && $2 == wanted) { print $5; exit }
    }
  ' "$MANIFEST"
}

skill_catalog_row() {
  awk -F'|' -v wanted="$1" '
    /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
    {
      for (n = 1; n <= 3; n++) gsub(/^[[:space:]]+|[[:space:]]+$/, "", $n)
      if ($1 == wanted) { print $2 "|" $3; exit }
    }
  ' "$SKILL_CATALOG"
}

skill_label() {
  local catalog_row
  catalog_row="$(skill_catalog_row "$1")"
  [ -n "$catalog_row" ] || die "스킬 설명을 찾을 수 없습니다: $1"
  printf '%s' "${catalog_row%%|*}"
}

skill_description() {
  local catalog_row
  catalog_row="$(skill_catalog_row "$1")"
  [ -n "$catalog_row" ] || die "스킬 설명을 찾을 수 없습니다: $1"
  printf '%s' "${catalog_row#*|}"
}

choose_agents() {
  if [ "$UI_MODE" = tui ]; then
    agent_rows=""
    agent_count=0
    for agent_id in $(manifest_agent_ids); do
      agent_count=$((agent_count + 1))
      dependencies="$(asset_dependencies agent "$agent_id")"
      if [ -n "$dependencies" ] && [ "$dependencies" != - ]; then
        dependency_detail="ID: $agent_id · 의존 자산: $dependencies"
      else
        dependency_detail="ID: $agent_id · 독립 실행"
      fi
      agent_rows="${agent_rows}${agent_rows:+
}$agent_id|$(vulporael "$agent_id")|$agent_id|1|$dependency_detail"
    done
    if [ "$ACTION" = uninstall ]; then
      agent_title='제거할 에이전트'; agent_hint='선택한 항목만 제거하고, 수정된 파일은 보존합니다.'
    else
      agent_title='에이전트 선택'; agent_hint='필요한 역할만 고르세요. 번호를 외울 필요가 없습니다.'
    fi
    tui_select_multi '4 / 5' "$agent_title" "$agent_hint" "$agent_rows"
    SELECTED_ASSETS="$TUI_SELECTED_VALUES"
    if [ "$TUI_SELECTED_COUNT" -eq "$agent_count" ]; then SELECT_ALL=1; SELECTED_ASSETS=all-agents; else SELECT_ALL=0; fi
    return
  fi
  while :; do
    printf '\n대상 기능을 선택하세요.\n'
    printf '  1) 전체 에이전트\n  2) 원하는 에이전트 선택\n> '
    read_answer
    case "$ANSWER" in
      1) SELECT_ALL=1; SELECTED_ASSETS=all-agents; return ;;
      2) SELECT_ALL=0; break ;;
      *) printf '1 또는 2를 입력하세요.\n' ;;
    esac
  done

  agent_ids="$(manifest_agent_ids)"
  index=0
  for agent_id in $agent_ids; do
    index=$((index + 1))
    printf '  %2s) %-28s %s\n' "$index" "$agent_id" "$(vulporael "$agent_id")"
    dependencies="$(asset_dependencies agent "$agent_id")"
    if [ -n "$dependencies" ] && [ "$dependencies" != - ]; then
      printf '      의존 자산: %s\n' "$dependencies"
    fi
  done
  agent_count="$index"

  while :; do
    printf '번호를 쉼표 또는 공백으로 구분해 입력하세요 (예: 2,4,10).\n> '
    read_answer
    normalized="$(printf '%s' "$ANSWER" | tr ',' ' ')"
    selected=""
    valid=1
    for number in $normalized; do
      case "$number" in ''|*[!0-9]*) valid=0; break ;; esac
      if [ "$number" -lt 1 ] || [ "$number" -gt "$agent_count" ]; then valid=0; break; fi
      agent_id="$(printf '%s\n' "$agent_ids" | awk -v wanted="$number" 'NR == wanted { print; exit }')"
      case " $selected " in *" $agent_id "*) ;; *) selected="${selected:+$selected }$agent_id" ;; esac
    done
    if [ "$valid" = 1 ] && [ -n "$selected" ]; then
      SELECTED_ASSETS="$selected"
      return
    fi
    printf '유효한 번호를 하나 이상 입력하세요.\n'
  done
}

choose_skills() {
  allow_empty_skills=0
  if [ "$INCLUDE_AGENTS" = 1 ] || [ "$INCLUDE_MCP" = 1 ]; then allow_empty_skills=1; fi
  if [ "$UI_MODE" = tui ]; then
    skill_rows=""
    skill_count=0
    for skill_id in $(manifest_skill_ids); do
      skill_count=$((skill_count + 1))
      dependencies="$(asset_dependencies skill "$skill_id")"
      if [ -n "$dependencies" ] && [ "$dependencies" != - ]; then
        dependency_detail="ID: $skill_id · 의존 자산: $dependencies"
      else
        dependency_detail="ID: $skill_id · 독립 실행"
      fi
      label="$(skill_label "$skill_id")"
      detail="$(skill_description "$skill_id")"
      skill_rows="${skill_rows}${skill_rows:+
}$skill_id|$label|$detail|1|$dependency_detail"
    done
    if [ "$ACTION" = uninstall ]; then
      skill_title='제거할 스킬'; skill_hint='선택한 스킬만 제거하고, 수정된 파일은 보존합니다.'
    else
      skill_title='스킬 선택'
      if [ "$allow_empty_skills" = 1 ]; then
        skill_hint='필요한 스킬만 고르세요. 선택 없이 Enter를 누르면 0개로 계속합니다.'
      else
        skill_hint='필요한 스킬만 고르거나 a로 전체를 선택하세요.'
      fi
    fi
    tui_select_multi '4 / 5' "$skill_title" "$skill_hint" "$skill_rows" "$allow_empty_skills"
    SELECTED_SKILLS="$TUI_SELECTED_VALUES"
    if [ "$TUI_SELECTED_COUNT" -eq "$skill_count" ]; then
      SKILL_SELECT_ALL=1
      SELECTED_SKILLS=all-skills
    else
      SKILL_SELECT_ALL=0
    fi
    return
  fi

  while :; do
    printf '\n대상 스킬을 선택하세요.\n'
    printf '  1) 전체 스킬\n  2) 원하는 스킬 선택\n> '
    read_answer
    case "$ANSWER" in
      1) SKILL_SELECT_ALL=1; SELECTED_SKILLS=all-skills; return ;;
      2) SKILL_SELECT_ALL=0; break ;;
      *) printf '1 또는 2를 입력하세요.\n' ;;
    esac
  done

  skill_ids="$(manifest_skill_ids)"
  index=0
  for skill_id in $skill_ids; do
    index=$((index + 1))
    printf '  %2s) %-28s %s\n' "$index" "$skill_id" "$(skill_label "$skill_id")"
    dependencies="$(asset_dependencies skill "$skill_id")"
    if [ -n "$dependencies" ] && [ "$dependencies" != - ]; then
      printf '      %s · 의존 자산: %s\n' "$(skill_description "$skill_id")" "$dependencies"
    else
      printf '      %s\n' "$(skill_description "$skill_id")"
    fi
  done
  skill_count="$index"
  while :; do
    if [ "$allow_empty_skills" = 1 ]; then
      printf '번호를 쉼표 또는 공백으로 구분해 입력하세요. 스킬 없이 계속하려면 0을 입력하세요.\n> '
    else
      printf '번호를 쉼표 또는 공백으로 구분해 입력하세요.\n> '
    fi
    read_answer
    if [ "$allow_empty_skills" = 1 ] && { [ "$ANSWER" = 0 ] || [ -z "$ANSWER" ]; }; then
      SELECTED_SKILLS=""
      SKILL_SELECT_ALL=0
      return
    fi
    normalized="$(printf '%s' "$ANSWER" | tr ',' ' ')"
    selected=""; valid=1
    for number in $normalized; do
      case "$number" in ''|*[!0-9]*) valid=0; break ;; esac
      if [ "$number" -lt 1 ] || [ "$number" -gt "$skill_count" ]; then valid=0; break; fi
      skill_id="$(printf '%s\n' "$skill_ids" | awk -v wanted="$number" 'NR == wanted { print; exit }')"
      case " $selected " in *" $skill_id "*) ;; *) selected="${selected:+$selected }$skill_id" ;; esac
    done
    if [ "$valid" = 1 ] && [ -n "$selected" ]; then SELECTED_SKILLS="$selected"; return; fi
    printf '유효한 번호를 하나 이상 입력하세요.\n'
  done
}

mcp_rows() {
  awk -F'|' '
    /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
    {
      for (n = 1; n <= 6; n++) gsub(/^[[:space:]]+|[[:space:]]+$/, "", $n)
      print $1 "|" $2 "|" $3 "|" $4 "|" $5 "|" $6
    }
  ' "$MCP_CATALOG"
}

mcp_ids() {
  mcp_rows | awk -F'|' '{print $1}'
}

choose_mcps() {
  if [ "$UI_MODE" = tui ]; then
    mcp_rows_for_ui=""
    mcp_count=0
    while IFS='|' read -r id transport endpoint auth runtimes description; do
      [ -n "$id" ] || continue
      mcp_count=$((mcp_count + 1))
      case "$id" in notion) label='Notion' ;; openai-docs) label='OpenAI Docs' ;; *) label="$id" ;; esac
      case "$auth" in oauth) auth_label='OAuth' ;; *) auth_label='인증 없음' ;; esac
      mcp_rows_for_ui="${mcp_rows_for_ui}${mcp_rows_for_ui:+
}$id|$label|$auth_label · $description|1"
    done <<EOF
$(mcp_rows)
EOF
    if [ "$ACTION" = uninstall ]; then
      mcp_title='제거할 MCP 연결'; mcp_hint='Vulpora endpoint와 일치하는 설정만 제거합니다.'
    else
      mcp_title='MCP 연결 선택'; mcp_hint='계정 접근은 각 런타임의 안전한 인증 흐름을 사용합니다.'
    fi
    tui_select_multi '4 / 5' "$mcp_title" "$mcp_hint" "$mcp_rows_for_ui"
    SELECTED_MCPS="$TUI_SELECTED_VALUES"
    if [ "$TUI_SELECTED_COUNT" -eq "$mcp_count" ]; then MCP_SELECT_ALL=1; else MCP_SELECT_ALL=0; fi
    return
  fi
  while :; do
    printf '\n대상 MCP pack을 선택하세요.\n'
    printf '  1) 전체 MCP pack\n  2) 원하는 MCP pack 선택\n> '
    read_answer
    case "$ANSWER" in
      1) MCP_SELECT_ALL=1; SELECTED_MCPS="$(mcp_ids | tr '\n' ' ' | awk '{$1=$1; print}')"; return ;;
      2) MCP_SELECT_ALL=0; break ;;
      *) printf '1 또는 2를 입력하세요.\n' ;;
    esac
  done

  rows="$(mcp_rows)"
  index=0
  printf '%s\n' "$rows" | while IFS='|' read -r id transport endpoint auth runtimes description; do
    index=$((index + 1))
    printf '  %2s) %-16s %s\n' "$index" "$id" "$description"
    printf '      %s · auth=%s\n' "$endpoint" "$auth"
  done
  mcp_count="$(printf '%s\n' "$rows" | awk 'NF { count++ } END { print count + 0 }')"
  ids="$(mcp_ids)"

  while :; do
    printf '번호를 쉼표 또는 공백으로 구분해 입력하세요 (예: 1,2).\n> '
    read_answer
    normalized="$(printf '%s' "$ANSWER" | tr ',' ' ')"
    selected=""
    valid=1
    for number in $normalized; do
      case "$number" in ''|*[!0-9]*) valid=0; break ;; esac
      if [ "$number" -lt 1 ] || [ "$number" -gt "$mcp_count" ]; then valid=0; break; fi
      id="$(printf '%s\n' "$ids" | awk -v wanted="$number" 'NR == wanted { print; exit }')"
      case " $selected " in *" $id "*) ;; *) selected="${selected:+$selected }$id" ;; esac
    done
    if [ "$valid" = 1 ] && [ -n "$selected" ]; then
      SELECTED_MCPS="$selected"
      return
    fi
    printf '유효한 MCP 번호를 하나 이상 입력하세요.\n'
  done
}

invoke_cli() { # runtime mode(dry|apply)
  selected_runtime="$1"
  mode="$2"
  cli_args=("$ACTION" --runtime "$selected_runtime" --scope "$SCOPE")
  [ "$SCOPE" != project ] || cli_args+=(--target "$TARGET")

  case "$ACTION" in
    setup)
      [ "$mode" != dry ] || cli_args+=(--dry-run)
      for asset in $SELECTED_ASSETS; do cli_args+=("$asset"); done
      for skill in $SELECTED_SKILLS; do cli_args+=("$skill"); done
      ;;
    doctor)
      for asset in $SELECTED_ASSETS; do cli_args+=("$asset"); done
      for skill in $SELECTED_SKILLS; do cli_args+=("$skill"); done
      ;;
    uninstall)
      [ "$mode" != dry ] || cli_args+=(--dry-run)
      for asset in $SELECTED_ASSETS; do cli_args+=("$asset"); done
      for skill in $SELECTED_SKILLS; do cli_args+=("$skill"); done
      ;;
  esac
  printf '에이전트·스킬 작업 · runtime=%s · mode=%s · action=%s\n' \
    "$selected_runtime" "$mode" "$ACTION"
  if bash "$CLI" "${cli_args[@]}"; then
    return 0
  else
    cli_rc=$?
  fi
  if [ "$ACTION" = uninstall ] && [ "$mode" = apply ] && [ "$cli_rc" = 3 ]; then
    PARTIAL_UNINSTALL=1
    return 0
  fi
  return "$cli_rc"
}

run_selected_runtimes() { # dry|apply
  mode="$1"
  if [ "$RUNTIME" = all ]; then
    invoke_cli codex "$mode"
    invoke_cli claude-code "$mode"
  else
    invoke_cli "$RUNTIME" "$mode"
  fi
}

invoke_mcp_cli() { # runtime mode(dry|apply)
  selected_runtime="$1"
  mode="$2"
  case "$ACTION" in
    setup) mcp_action=install ;;
    uninstall) mcp_action=remove ;;
    doctor) mcp_action=status ;;
  esac
  mcp_args=(mcp "$mcp_action" --runtime "$selected_runtime" --scope "$SCOPE")
  [ "$SCOPE" != project ] || mcp_args+=(--target "$TARGET")
  if [ "$mode" = dry ] && [ "$mcp_action" != status ]; then mcp_args+=(--dry-run); fi
  for pack in $SELECTED_MCPS; do mcp_args+=("$pack"); done
  printf 'MCP 작업 · runtime=%s · mode=%s · action=%s · pack=%s\n' \
    "$selected_runtime" "$mode" "$mcp_action" "$SELECTED_MCPS"
  bash "$CLI" "${mcp_args[@]}"
}

run_mcp_runtimes() { # dry|apply
  mode="$1"
  if [ "$RUNTIME" = all ]; then
    invoke_mcp_cli codex "$mode"
    invoke_mcp_cli claude-code "$mode"
  else
    invoke_mcp_cli "$RUNTIME" "$mode"
  fi
}

run_asset_operations() { # dry|apply
  operation_mode="$1"
  if [ "$INCLUDE_AGENTS" = 1 ] || [ "$INCLUDE_SKILLS" = 1 ]; then
    run_selected_runtimes "$operation_mode"
  fi
  [ "$INCLUDE_MCP" = 0 ] || run_mcp_runtimes "$operation_mode"
}

mcp_pack_requires_oauth() {
  mcp_rows | awk -F'|' -v wanted="$1" '$1 == wanted && $4 == "oauth" { found=1 } END { exit(found ? 0 : 1) }'
}

print_deferred_mcp_auth_note() {
  [ "$ACTION" = setup ] && [ "$INCLUDE_MCP" = 1 ] || return 0
  oauth_packs=""
  for pack in $SELECTED_MCPS; do
    if mcp_pack_requires_oauth "$pack"; then oauth_packs="${oauth_packs:+$oauth_packs }$pack"; fi
  done
  [ -n "$oauth_packs" ] || return 0
  printf '  인증 보류 · %s OAuth는 첫 Notion 호출에서 시작합니다.\n' "$oauth_packs"
}

print_claude_project_mcp_note() {
  [ "$ACTION" = setup ] && [ "$INCLUDE_MCP" = 1 ] && [ "$SCOPE" = project ] || return 0
  case "$RUNTIME" in claude-code|all) ;; *) return 0 ;; esac
  printf '  Claude Code project MCP는 첫 사용 시 /mcp에서 server 승인이 필요합니다.\n'
}

print_project_init_note() {
  [ "$ACTION" = setup ] && [ "$INCLUDE_SKILLS" = 1 ] || return 0
  if [ "$SKILL_SELECT_ALL" != 1 ]; then
    case " $SELECTED_SKILLS " in *' vulpora-init '*) ;; *) return 0 ;; esac
  fi
  printf '  다음 단계 · runtime 재시작 후 작업할 repository에서 vulpora-init 스킬을 가장 먼저 실행하세요.\n'
}

word_count() { set -- $1; printf '%s' "$#"; }

runtime_label() {
  case "$RUNTIME" in claude-code) printf 'Claude Code' ;; codex) printf 'Codex' ;; all) printf 'Claude Code + Codex' ;; esac
}

scope_label() { case "$SCOPE" in user) printf '내 계정 전체' ;; project) printf '현재 프로젝트' ;; esac; }

print_tui_summary() {
  agent_total="$(manifest_agent_ids | awk 'NF { count++ } END { print count + 0 }')"
  skill_total="$(manifest_skill_ids | awk 'NF { count++ } END { print count + 0 }')"
  tui_print_line "  ${C_ACCENT}-${C_RESET} 작업: ${ACTION_LABEL}"
  tui_print_line "  ${C_ACCENT}-${C_RESET} 런타임: $(runtime_label)"
  tui_print_line "  ${C_ACCENT}-${C_RESET} 범위: $(scope_label)"
  tui_print_line "  ${C_ACCENT}-${C_RESET} 경로: ${TARGET}"
  if [ "$PURGE_ALL" = 1 ]; then
    tui_print_line "  ${C_ACCENT}-${C_RESET} 대상: Vulpora 소유 항목 전체"
  fi
  if [ "$INCLUDE_AGENTS" = 1 ]; then
    if [ "$SELECT_ALL" = 1 ]; then agent_summary="전체 ${agent_total}개"; else agent_summary="$(word_count "$SELECTED_ASSETS")개"; fi
    tui_print_line "  ${C_ACCENT}-${C_RESET} 에이전트: ${agent_summary}"
  fi
  if [ "$INCLUDE_SKILLS" = 1 ]; then
    if [ "$SKILL_SELECT_ALL" = 1 ]; then skill_summary="전체 ${skill_total}개"; else skill_summary="$(word_count "$SELECTED_SKILLS")개"; fi
    tui_print_line "  ${C_ACCENT}-${C_RESET} 스킬: ${skill_summary}"
    if [ "$ACTION" != uninstall ]; then
      tui_print_line "  ${C_ACCENT}-${C_RESET} 의존 자산: 설치기가 재귀 해소"
    fi
  fi
  if [ "$INCLUDE_MCP" = 1 ]; then
    tui_print_line "  ${C_ACCENT}-${C_RESET} MCP: ${SELECTED_MCPS}"
  fi
}

collect_preview() {
  if tui_run_with_activity '준비 중' '변경 미리보기 생성' \
    '설치·제거 계획을 안전하게 계산하고 있습니다.' '대상 파일과 설정 확인 중' \
    run_asset_operations dry; then
    PREVIEW_OUTPUT="$TUI_ACTIVITY_OUTPUT"
  else
    preview_rc=$?
    PREVIEW_OUTPUT="$TUI_ACTIVITY_OUTPUT"
    die "변경 미리보기에 실패했습니다.
$PREVIEW_OUTPUT"
  fi
}

tui_show_preview_details() {
  tui_clear
  tui_header '5 / 5' '세부 변경 미리보기' '아직 실제 파일은 바뀌지 않았습니다.'
  printf '%s\n' "$PREVIEW_OUTPUT" | while IFS= read -r preview_line; do
    tui_print_line "$preview_line"
  done
  tui_blank
  tui_print_line "  ${C_MUTED}아무 키나 누르면 요약으로 돌아갑니다.${C_RESET}"
  tui_frame_end
  tui_read_key
}

tui_review_confirm() {
  cursor=0
  preview_lines="$(printf '%s\n' "$PREVIEW_OUTPUT" | awk 'NF { count++ } END { print count + 0 }')"
  while :; do
    tui_clear
    tui_header '5 / 5' '변경 확인' '적용 전 마지막 단계입니다.'
    print_tui_summary
    tui_blank
    tui_print_line "  ${C_GREEN}미리보기 ${preview_lines}줄 검증 완료${C_RESET}"
    tui_blank
    if [ "$cursor" = 0 ]; then apply_marker="${C_ACCENT}>${C_RESET}"; cancel_marker=' '; else apply_marker=' '; cancel_marker="${C_ACCENT}>${C_RESET}"; fi
    printf '  %b %s적용하기%s' "$apply_marker" "$C_ACCENT" "$C_RESET"
    tui_line_end
    printf '  %b 취소' "$cancel_marker"
    tui_line_end
    tui_blank
    tui_print_line "  ${C_MUTED}j/k 이동  enter 선택  d 세부 내역  q 종료${C_RESET}"
    tui_frame_end
    tui_read_key
    case "$TUI_KEY" in
      up|down) cursor=$((1 - cursor)) ;;
      details) tui_show_preview_details ;;
      enter) [ "$cursor" = 0 ] && return 0 || tui_abort ;;
      quit) tui_abort ;;
    esac
  done
}

configure_catalog_all() {
  CATALOG_ALL=1
  INCLUDE_AGENTS=1
  INCLUDE_SKILLS=1
  INCLUDE_MCP=1
  SELECT_ALL=1
  SELECTED_ASSETS=all-agents
  SKILL_SELECT_ALL=1
  SELECTED_SKILLS=all-skills
  MCP_SELECT_ALL=1
  SELECTED_MCPS="$(mcp_ids | tr '\n' ' ' | awk '{$1=$1; print}')"
}

configure_purge_all() {
  CATALOG_ALL=1
  INCLUDE_AGENTS=1
  INCLUDE_SKILLS=1
  INCLUDE_MCP=1
  # No agent/skill selector means whole-receipt uninstall. This also removes
  # retired catalog entries that are no longer present in manifest.txt.
  SELECT_ALL=1
  SELECTED_ASSETS=""
  SKILL_SELECT_ALL=1
  SELECTED_SKILLS=""
  MCP_SELECT_ALL=1
  SELECTED_MCPS="$(mcp_ids | tr '\n' ' ' | awk '{$1=$1; print}')"
}

if [ "$UI_MODE" = plain ]; then
  printf 'Vulpora 대화형 설치기\n'
  printf '에이전트, 스킬과 MCP 연결을 선택해 설치·제거합니다.\n'
  print_runtime_status
  # Keep the established pipe/CI prompt order stable.
  choose_runtime
  choose_scope
  choose_action
else
  # Interactive terminals expose install and removal choices immediately.
  tui_start
  choose_action
  choose_runtime
  choose_scope
fi
if [ "$PURGE_ALL" = 1 ]; then
  configure_purge_all
else
  choose_asset_types
  if [ "$CATALOG_ALL" = 0 ]; then
    [ "$INCLUDE_AGENTS" = 0 ] || choose_agents
    [ "$INCLUDE_SKILLS" = 0 ] || choose_skills
    [ "$INCLUDE_MCP" = 0 ] || choose_mcps
  fi
fi

if [ "$UI_MODE" = plain ]; then
  printf '\n선택 요약:\n'
  printf '  작업: %s\n  런타임: %s\n  범위: %s\n  대상 경로: %s\n' \
    "$ACTION_LABEL" "$RUNTIME" "$SCOPE" "$TARGET"
  [ "$PURGE_ALL" = 0 ] || printf '  대상: Vulpora 소유 항목 전체\n'
  if [ "$INCLUDE_AGENTS" = 1 ]; then
    if [ "$SELECT_ALL" = 1 ]; then
      printf '  에이전트: 전체\n'
    else
      printf '  에이전트: %s\n' "$SELECTED_ASSETS"
    fi
  fi
  if [ "$INCLUDE_SKILLS" = 1 ]; then
    if [ "$SKILL_SELECT_ALL" = 1 ]; then
      printf '  스킬: 전체\n'
    elif [ -z "$SELECTED_SKILLS" ]; then
      printf '  스킬: 선택 안 함 (0개)\n'
    else
      printf '  스킬: %s\n' "$SELECTED_SKILLS"
    fi
  fi
  if [ "$INCLUDE_MCP" = 1 ]; then
    if [ "$MCP_SELECT_ALL" = 1 ]; then
      printf '  MCP: 전체 (%s)\n' "$SELECTED_MCPS"
    else
      printf '  MCP: %s\n' "$SELECTED_MCPS"
    fi
  fi
fi

if [ "$ACTION" = doctor ]; then
  if [ "$UI_MODE" = tui ]; then
    if tui_run_with_activity '점검 중' '설치 상태 확인' \
      '파일과 런타임 설정을 검증하고 있습니다.' '에이전트·스킬·MCP 상태 확인 중' \
      run_asset_operations apply; then
      doctor_output="$TUI_ACTIVITY_OUTPUT"
    else
      doctor_rc=$?
      doctor_output="$TUI_ACTIVITY_OUTPUT"
      die "설치 상태 점검에 실패했습니다 (rc=$doctor_rc).
$doctor_output"
    fi
    tui_restore
    printf '\n  %s%sVULPORA%s  상태 점검\n\n' "$C_ACCENT" "$C_BOLD" "$C_RESET"
    print_tui_summary
    printf '\n%s\n' "$doctor_output"
  else
    printf '\n설치 상태를 점검합니다.\n'
    run_asset_operations apply
  fi
  exit 0
fi

if [ "$UI_MODE" = tui ]; then
  collect_preview
  tui_review_confirm
  if tui_run_with_activity '적용 중' "$ACTION_LABEL" \
    '검증한 변경을 반영하고 결과를 다시 확인합니다.' '파일과 런타임 설정 반영 중' \
    run_asset_operations apply; then
    :
  else
    apply_rc=$?
    apply_output="$TUI_ACTIVITY_OUTPUT"
    die "변경 적용에 실패했습니다 (rc=$apply_rc).
$apply_output"
  fi
else
  printf '\n변경 미리보기:\n'
  if [ "$INCLUDE_AGENTS" = 1 ] || [ "$INCLUDE_SKILLS" = 1 ]; then run_selected_runtimes dry; fi
  [ "$INCLUDE_MCP" = 0 ] || run_mcp_runtimes dry
  printf '\n위 변경을 적용할까요? [y/N] '
  read_answer
  case "$ANSWER" in
    y|Y|yes|YES) ;;
    *) printf '취소했습니다. 변경한 파일이 없습니다.\n'; exit 0 ;;
  esac
  run_asset_operations apply
fi

if [ "$UI_MODE" = tui ]; then
  tui_restore
  printf '\n  %s%sVULPORA%s\n\n' "$C_ACCENT" "$C_BOLD" "$C_RESET"
  if [ "$PARTIAL_UNINSTALL" = 1 ]; then
    printf '  %s!%s 제거 완료 · 수정 파일 보존\n' "$C_WARN" "$C_RESET"
    printf '  안전하게 삭제할 수 있는 나머지 항목은 모두 정리했습니다.\n'
    printf '  수정되었거나 안전하게 판정할 수 없는 에이전트·스킬 경로는 보존했습니다.\n'
    printf '\n%s\n' "$TUI_ACTIVITY_OUTPUT"
  else
    printf '  %s완료%s  Vulpora %s 완료\n' "$C_GREEN" "$C_RESET" "$ACTION_LABEL"
    if [ "$ACTION" = setup ]; then
      printf '  런타임을 재시작하면 새 에이전트, 스킬과 MCP가 보입니다.\n'
      print_project_init_note
      print_claude_project_mcp_note
      print_deferred_mcp_auth_note
    else
      printf '  제거한 항목은 런타임을 재시작한 뒤 목록에서 사라집니다.\n'
    fi
  fi
else
  if [ "$PARTIAL_UNINSTALL" = 1 ]; then
    printf '\n! Vulpora 제거가 완료됐으며 수정되었거나 안전하게 판정할 수 없는 에이전트·스킬 경로는 보존했습니다.\n'
  else
    printf '\n✓ Vulpora %s가 완료됐습니다.\n' "$ACTION_LABEL"
  fi
  print_claude_project_mcp_note
  print_deferred_mcp_auth_note
  print_project_init_note
  printf '런타임이 실행 중이었다면 종료한 뒤 새 세션을 시작하세요.\n'
fi
