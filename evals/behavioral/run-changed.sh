#!/usr/bin/env bash
# run-changed.sh — git diff로 "변경된 에이전트"만 골라 behavioral eval을 돌린다.
#
#   bash run-changed.sh [--validate|--run] [BASE_REF]
#
# 목적: 전체 케이스를 매번 돌리지 않고, 이번 변경이 건드린 에이전트의 케이스만 평가한다.
#
# 변경 감지 범위(합집합):
#   - 워킹트리 변경      : git diff --name-only
#   - staged 변경        : git diff --cached --name-only
#   - BASE_REF 주면 추가 : git diff --name-only BASE_REF...HEAD   (예: origin/master)
#
# 변경 경로 → 자산(에이전트) 매핑:
#   - agents/<name>.md           → 자산 <name>                         (정의 직접 변경)
#   - agents/<dir>/... (번들)     → 그 <dir> 토큰을 참조하는 agents/*.md 의 자산
# 매핑된 자산 집합을 run-behavioral-evals.sh 에 --only 로 넘겨 해당 케이스만 평가한다.
#
# 종료코드: 대상 케이스가 모두 통과하면 0, 하나라도 실패하거나 매핑 자산의 케이스가 0건이면 1.
# 의존성: git + bash + coreutils. --run 의 실제 호출은 VULPORA_BEHAVIORAL_RUNNER_CMD 가 있을 때만.

set -eu
set -o pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
RUNNER="$DIR/run-behavioral-evals.sh"
ROOT="$(git -C "$DIR" rev-parse --show-toplevel 2>/dev/null)" || { echo "git 저장소가 아님" >&2; exit 2; }

MODE_FLAG="--validate"; BASE=""; ALLOW_EMPTY=0
for a in "$@"; do
  case "$a" in
    --validate) MODE_FLAG="--validate" ;;
    --run)      MODE_FLAG="--run" ;;
    --allow-empty) ALLOW_EMPTY=1 ;;
    -h|--help)  sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)          BASE="$a" ;;   # 그 외 인자는 BASE_REF로 취급
  esac
done

# 1) 변경 경로 수집(워킹트리 + staged + 선택적 BASE...HEAD)
tmp_changed="$(mktemp "${TMPDIR:-/tmp}/rc-changed.XXXXXX")"
trap 'rm -f "$tmp_changed"' EXIT HUP INT TERM
if ! git -C "$ROOT" diff --name-only > "$tmp_changed" || ! git -C "$ROOT" diff --cached --name-only >> "$tmp_changed"; then
  echo 'status: INCONCLUSIVE; reason: unreadable_git_diff' >&2
  exit 2
fi
if [ -n "$BASE" ] && ! git -C "$ROOT" diff --name-only "$BASE...HEAD" >> "$tmp_changed"; then
  echo 'status: INCONCLUSIVE; reason: unreadable_git_diff' >&2
  exit 2
fi
changed="$(LC_ALL=C sort -u "$tmp_changed")"

if [ -z "$changed" ]; then
  echo "status: NOT_RUN; scanned_cases: 0; reason: no_changed_files; allow_empty: $ALLOW_EMPTY"
  [ "$ALLOW_EMPTY" = 1 ] && exit 0
  exit 2
fi

# 2) 변경 → 자산 집합
assets=""
add_asset() { case " $assets " in *" $1 "*) ;; *) assets="$assets $1" ;; esac; }

# 2a) 직접 정의 변경: agents/<name>.md
while IFS= read -r p; do
  case "$p" in
    agents/*/*) : ;;                                  # 번들 하위는 2b에서 처리
    agents/*.md) n="${p#agents/}"; add_asset "${n%.md}" ;;
    agents/*.codex.toml) n="${p#agents/}"; add_asset "${n%.codex.toml}" ;;
    skills/*/*) n="${p#skills/}"; add_asset "${n%%/*}" ;;
  esac
done <<EOF
$changed
EOF

# 2b) 번들 디렉터리 변경 → 토큰을 참조하는 에이전트 정의를 자산으로
tokens=""
add_token() { case " $tokens " in *" $1 "*) ;; *) tokens="$tokens $1" ;; esac; }
while IFS= read -r p; do
  case "$p" in
    agents/*/*) d="${p#agents/}"; add_token "${d%%/*}" ;;
  esac
done <<EOF
$changed
EOF

for tok in $tokens; do
  [ -n "$tok" ] || continue
  # tok(번들 디렉터리명)을 본문에서 참조하는 에이전트 정의를 찾는다.
  while IFS= read -r def; do
    [ -n "$def" ] || continue
    base="$(basename "$def" .md)"
    add_asset "$base"
  done < <(grep -rlF "$tok" "$ROOT"/agents/*.md 2>/dev/null)
done

assets="$(printf '%s' "$assets" | tr -s ' ' | sed -e 's/^ //' -e 's/ $//')"

echo "변경 감지: $(printf '%s\n' "$changed" | wc -l | tr -d ' ')개 파일"
if [ -z "$assets" ]; then
  echo "status: NOT_RUN; scanned_cases: 0; reason: no_mapped_assets; allow_empty: $ALLOW_EMPTY"
  [ "$ALLOW_EMPTY" = 1 ] && exit 0
  exit 2
fi
echo "대상 자산: $assets"
echo ""

# 3) 변경 자산 케이스만 평가
VULPORA_ONLY_ASSETS="$assets" bash "$RUNNER" "$MODE_FLAG"
