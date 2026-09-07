#!/usr/bin/env bash
# deterministic-text grader — 에이전트 출력 텍스트를 케이스 기대값으로 결정적 채점한다.
# 외부 의존성 없음(bash + grep/awk). LLM 채점 아님 — 텍스트 신호 기반.
#
# 사용: deterministic-text.sh <output_text_file> <case_yaml_file>
# 출력(key=value, stdout): outcome_score / must_find_total / must_find_hit /
#                          mustnot_violations / failure_signals
# 종료코드: 항상 0(채점은 데이터다. pass/fail은 호출자가 pass_threshold로 판정).

set -u
OUT="${1:?output file}"; CASE="${2:?case file}"

# 케이스에서 KEY: 아래의 '- item' 리스트를 추출(들여쓰기 블록).
ylist() {
  awk -v k="$1" '
    $0 ~ "^[[:space:]]*"k":[[:space:]]*$" { depth=match($0,/[^ ]/); inlist=1; next }
    inlist {
      if ($0 ~ /^[[:space:]]*-[[:space:]]/) { sub(/^[[:space:]]*-[[:space:]]*/,""); print; next }
      if ($0 ~ /^[[:space:]]*[^[:space:]#]/ && match($0,/[^ ]/) <= depth) inlist=0
    }
  ' "$2"
}

lc() { tr '[:upper:]' '[:lower:]'; }
# This is deliberately a small YAML-scalar normalizer, not a YAML parser.  Case
# lists use plain scalars or one pair of outer quotes.  Removing that pair makes
# quoted OR groups (for example 'ready|status: ready') behave like their plain
# scalar equivalents while retaining grep -F matching semantics.
unquote_scalar() {
  local value
  value="$(printf '%s' "$1" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
  if [[ "$value" =~ ^\'.*\'$ ]] || [[ "$value" =~ ^\".*\"$ ]]; then
    value="${value:1:${#value}-2}"
  fi
  printf '%s' "$value"
}
matches_term() {
  # Explicit matcher contract:
  #   literal:<text>  fixed string (also the unmarked default)
  #   any_of:a|b      one or more fixed-string alternatives
  #   regex:<ERE>     POSIX extended regular expression
  # The runner validates regex syntax before this grader is called.
  local term="$1" alt
  case "$term" in
    literal:*) printf '%s' "$body_lc" | grep -qiF -- "${term#literal:}" ;;
    any_of:*)
      local -a alternatives
      IFS='|' read -r -a alternatives <<< "${term#any_of:}"
      for alt in "${alternatives[@]}"; do
        if [ -n "$alt" ] && printf '%s' "$body_lc" | grep -qiF -- "$alt"; then return 0; fi
      done
      return 1 ;;
    regex:*) printf '%s' "$body_lc" | grep -qiE -- "${term#regex:}" ;;
    *) printf '%s' "$body_lc" | grep -qiF -- "$term" ;;
  esac
}
body_lc="$(cat "$OUT" 2>/dev/null | lc)"

mf_total=0; mf_hit=0
while IFS= read -r term; do
  term="$(unquote_scalar "$term")"
  [ -z "$term" ] && continue
  mf_total=$((mf_total+1))
  hit=0
  matches_term "$(printf '%s' "$term" | lc)" && hit=1
  [ "$hit" -eq 1 ] && mf_hit=$((mf_hit+1))
done < <(ylist must_find "$CASE")

mn_viol=0; signals=""
while IFS= read -r term; do
  term="$(unquote_scalar "$term")"
  [ -z "$term" ] && continue
  if matches_term "$(printf '%s' "$term" | lc)"; then
    mn_viol=$((mn_viol+1)); signals="${signals}must_not_claim:'${term}'; "
  fi
done < <(ylist must_not_claim "$CASE")

# outcome score = must_find 충족 비율 (must_not_claim 위반이 있으면 0으로 강등)
if [ "$mf_total" -eq 0 ]; then score="1.000"; else
  score=$(awk -v h="$mf_hit" -v t="$mf_total" 'BEGIN{printf "%.3f", h/t}')
fi
[ "$mn_viol" -gt 0 ] && score="0.000"
[ "$mf_hit" -lt "$mf_total" ] && signals="${signals}must_find 누락 $((mf_total-mf_hit))건; "

echo "outcome_score=$score"
echo "must_find_total=$mf_total"
echo "must_find_hit=$mf_hit"
echo "mustnot_violations=$mn_viol"
echo "failure_signals=${signals:-none}"
