#!/usr/bin/env bash
# Vulpora runtime 자동 감지 — 설치 계층이 공유하는 단일 판정 로직.
#
# 이 파일은 실행하지 않고 source 한다. bash 3.2(macOS 기본)/zsh 호환.
#
#   . "$SCRIPT_DIR/runtime-detect.sh"
#   detected="$(vulpora_detect_runtimes)"          # "claude-code codex"
#   resolved="$(vulpora_resolve_runtimes auto)"    # selector -> runtime 목록
#   vulpora_for_each_runtime "$resolved" my_fn     # 목록 순회(IFS 비의존)
#
# 감지 신호는 PATH 위의 runtime CLI 존재 여부 하나다. `~/.claude` 같은 config
# 디렉터리는 신호로 쓰지 않는다 — CLI 없이 남은 흔적만 보고 설치하면 실제로는
# 쓸 수 없는 runtime에 자산을 흩뿌리게 된다.
#
# 탐색 PATH는 VULPORA_DETECT_PATH > VULPORA_RUNTIME_PATH > PATH 순으로 고른다.
# 설치기들은 PATH를 안전한 최소값으로 좁히므로 사용자의 원래 PATH를 따로 넘긴다.
#
# runtime 목록은 호출자의 IFS에 의존하지 않는다. 호출 환경의 IFS가 비표준이면
# 공백 분리가 조용히 실패해 "감지된 runtime 없음"으로 잘못 판정되기 때문이다.

VULPORA_SUPPORTED_RUNTIMES='claude-code codex'

vulpora_detect_path() {
  printf '%s' "${VULPORA_DETECT_PATH:-${VULPORA_RUNTIME_PATH:-${PATH:-}}}"
}

# runtime id -> 해당 runtime의 CLI 실행 파일 이름
vulpora_runtime_cli() {
  case "$1" in
    claude-code) printf 'claude' ;;
    codex) printf 'codex' ;;
    *) return 1 ;;
  esac
}

vulpora_runtime_label() {
  case "$1" in
    claude-code) printf 'Claude Code' ;;
    codex) printf 'Codex' ;;
    all) printf 'Claude Code + Codex' ;;
    auto) printf '자동 감지' ;;
    *) printf '%s' "$1" ;;
  esac
}

vulpora_runtime_supported() { # runtime-id
  case "$1" in claude-code|codex) return 0 ;; *) return 1 ;; esac
}

vulpora_runtime_available() { # runtime-id
  vulpora_cli_name="$(vulpora_runtime_cli "$1")" || return 1
  PATH="$(vulpora_detect_path)" command -v "$vulpora_cli_name" >/dev/null 2>&1
}

# 목록 문자열을 IFS와 무관하게 순회한다. callback은 runtime id 하나를 받는다.
vulpora_for_each_runtime() { # "rt1 rt2" callback [callback-args...]
  vulpora_remaining="$1"
  shift
  while [ -n "$vulpora_remaining" ]; do
    case "$vulpora_remaining" in
      *' '*)
        vulpora_head="${vulpora_remaining%% *}"
        vulpora_remaining="${vulpora_remaining#* }"
        ;;
      *)
        vulpora_head="$vulpora_remaining"
        vulpora_remaining=''
        ;;
    esac
    [ -z "$vulpora_head" ] || "$@" "$vulpora_head" || return $?
  done
}

# 감지된 runtime id를 공백 구분으로 출력한다. 없으면 빈 문자열.
vulpora_detect_runtimes() {
  vulpora_detected=''
  # 지원 runtime을 리터럴로 순회한다(호출자 IFS 비의존).
  for vulpora_candidate in claude-code codex; do
    if vulpora_runtime_available "$vulpora_candidate"; then
      vulpora_detected="${vulpora_detected:+$vulpora_detected }$vulpora_candidate"
    fi
  done
  printf '%s' "$vulpora_detected"
}

# selector(auto|all|codex|claude-code) -> 실제 작업할 runtime 목록.
# auto  : 감지된 runtime 전부. 하나도 없으면 rc=1.
# all   : 지원 runtime 전부(감지 여부와 무관 — 기존 동작 유지).
# 명시값: 그대로. 지원하지 않는 값이면 rc=2.
vulpora_resolve_runtimes() { # selector
  case "$1" in
    auto)
      vulpora_resolved="$(vulpora_detect_runtimes)"
      [ -n "$vulpora_resolved" ] || return 1
      printf '%s' "$vulpora_resolved"
      ;;
    all)
      printf '%s' "$VULPORA_SUPPORTED_RUNTIMES"
      ;;
    claude-code|codex)
      printf '%s' "$1"
      ;;
    *)
      return 2
      ;;
  esac
}

# 목록을 사람이 읽는 라벨로 합친다: "Claude Code + Codex"
vulpora_runtime_list_label() { # "rt1 rt2"
  vulpora_labels=''
  vulpora_rest="$1"
  while [ -n "$vulpora_rest" ]; do
    case "$vulpora_rest" in
      *' '*) vulpora_one="${vulpora_rest%% *}"; vulpora_rest="${vulpora_rest#* }" ;;
      *) vulpora_one="$vulpora_rest"; vulpora_rest='' ;;
    esac
    [ -n "$vulpora_one" ] || continue
    vulpora_labels="${vulpora_labels:+$vulpora_labels + }$(vulpora_runtime_label "$vulpora_one")"
  done
  printf '%s' "${vulpora_labels:-없음}"
}

# 감지 결과를 사람이 읽는 한 줄로 출력한다.
vulpora_print_detection() { # resolved-runtime-list
  printf '런타임 자동 감지: %s\n' "$(vulpora_runtime_list_label "$1")"
}

# auto 감지 실패 시 공통 안내 문구.
vulpora_no_runtime_message() {
  printf '%s' 'Claude Code(claude)와 Codex(codex) CLI를 모두 찾지 못했습니다. 하나 이상 설치한 뒤 다시 실행하거나 --runtime codex|claude-code|all 로 직접 지정하세요.'
}
