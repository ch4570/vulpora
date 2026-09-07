#!/bin/sh
# agent-memory-gate — raw log/transcript/agent-runtime 같은 "휘발성 산출물"이
# git 에 들어가 원격으로 새는 것을 차단한다.
#
# 설계 원칙(의도적 단순화):
#  - 이 게이트는 오직 "금지 산출물이 들어왔는가" 만 본다.
#  - "메모리 큐레이션이 끝났는가" 와는 분리한다 — push 를 비동기 학습에 묶지 않는다(과설계 회피).
#  - LLM·marker·네트워크 의존 없음. 순수 git + grep 이라 즉시·오프라인 동작.
#  - raw log 는 애초에 repo 밖(~/.agent-runtime/)에 두는 게 정석(최소 수집). 이건 방어선이다.
#
# 사용:
#   agent-memory-gate.sh            → 현재 추적 파일(git ls-files) 검사
#   agent-memory-gate.sh --stdin    → 개행 구분 파일목록을 stdin 으로 받아 검사(예: push 범위 커밋)
# PASS=0, forbidden path FAIL=1, NOT_RUN/INCONCLUSIVE=2.
# --stdin0 accepts NUL-delimited Git paths; --allow-empty preserves NOT_RUN.
set -eu

MODE=tracked
ALLOW_EMPTY=0
for arg in "$@"; do
  case "$arg" in
    --stdin) MODE=stdin ;;
    --stdin0) MODE=stdin0 ;;
    --allow-empty) ALLOW_EMPTY=1 ;;
    *) echo 'agent_memory_gate status=INCONCLUSIVE scanned_files=0 reason=invalid_argument' >&2; exit 2 ;;
  esac
done

ROOT="$(git rev-parse --show-toplevel)" || exit 1
cd "$ROOT" || exit 1

# 금지 경로/확장자: agent 런타임 산출물·transcript·raw 로그·로컬 상태/락.
FORBIDDEN_RE='(^|/)\.agent/(runtime|logs|tmp|state)/|\.agentlog$|\.transcript$|\.transcript\.jsonl$|\.raw\.jsonl$|(^|/)\.claude/hooks/.*\.log$|(^|/)\.claude/hooks/\.[a-z-]*state$|(^|/)\.claude/hooks/\.capture\.lock|(^|/)\.claude/knowledge/auto/\.audit\.lock'

WORK="$(mktemp -d "${TMPDIR:-/tmp}/agent-memory-gate.XXXXXX")" || exit 2
trap 'rm -rf "$WORK"' EXIT HUP INT TERM
if [ "$MODE" = tracked ]; then
  if ! git ls-files -z > "$WORK/paths"; then
    echo 'agent_memory_gate status=INCONCLUSIVE scanned_files=0 reason=git_scan_failed' >&2
    exit 2
  fi
elif [ "$MODE" = stdin0 ]; then
  cat > "$WORK/paths"
else
  sed '/^$/d' | tr '\n' '\000' > "$WORK/paths"
fi
SCANNED="$(tr -cd '\000' < "$WORK/paths" | wc -c | tr -d ' ')"
if [ -s "$WORK/paths" ] && [ "$(tail -c 1 "$WORK/paths" | od -An -tu1 | tr -d '[:space:]')" != 0 ]; then
  echo 'agent_memory_gate status=INCONCLUSIVE scanned_files=0 reason=unterminated_path_record' >&2
  exit 2
fi
if [ "$SCANNED" -eq 0 ]; then
  echo "agent_memory_gate status=NOT_RUN scanned_files=0 source=$MODE allow_empty=$ALLOW_EMPTY"
  [ "$ALLOW_EMPTY" -eq 1 ] && exit 0
  exit 2
fi

tr '\000' '\n' < "$WORK/paths" > "$WORK/lines"
if LC_ALL=C grep -E "$FORBIDDEN_RE" "$WORK/lines" > "$WORK/hits"; then
  echo "agent_memory_gate status=FAIL scanned_files=$SCANNED source=$MODE reason=forbidden_paths"
  LC_ALL=C sort -u "$WORK/hits" | sed 's/^/   - /'
  echo "   조치: git rm --cached <파일> (히스토리면 rebase 로 제거) + .gitignore 확인."
  echo "   원칙: raw log/transcript 는 repo 밖(~/.agent-runtime/<hash>/)에 두고, 정제된 memory 만 커밋한다."
  exit 1
else
  code=$?
  if [ "$code" -ne 1 ]; then
    echo "agent_memory_gate status=INCONCLUSIVE scanned_files=$SCANNED reason=matcher_failed" >&2
    exit 2
  fi
fi

echo "agent_memory_gate status=PASS scanned_files=$SCANNED source=$MODE"
exit 0
