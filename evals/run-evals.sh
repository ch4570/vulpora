#!/usr/bin/env bash
# evals 정합성 러너 — 각 case가 well-formed하고 내부 모순이 없는지 결정적으로 채점한다.
#
# 실행: bash evals/run-evals.sh
# 종료코드: 모든 case 통과 0, 하나라도 실패 1.
#
# 의존성: bash + 표준 coreutils(grep/awk/find/tr)만 사용. python/pyyaml 등 외부 의존성 없음.
#
# ⚠️ 범위: 이것은 "구조/정합성(structural)" 러너다. 케이스가 유효하고 자기모순이 없음을 보장한다.
#   에이전트의 실제 판단(LLM 행동)을 실행하지는 않는다 — 그 behavioral runner는 별도다.
#   즉 "시험지·정답지가 올바른지" 채점하지, "에이전트가 시험을 통과했는지"를 채점하진 않는다.
#
# 검사 항목(case별):
#   1) 필수 키: case_id / target / intent / expected / pass_criteria / failure_signals
#   2) 무언가를 단언하는가: decision enum(admit|evidence_only|reject|quarantine) 또는 skill_executed 존재
#   3) decision 값이 유효 enum인가(잘못된 결정 토큰 금지)
#   4) 카테고리 하드룰: memory-poisoning/* 는 poisoning_promotion_count: 0 필수
#   5) YAML 들여쓰기 위생: 탭 문자 금지(YAML 인덴트는 공백) — 순수 bash, 외부 의존성 없음

set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
TAB="$(printf '\t')"

pass=0; fail=0; n=0
# behavioral/와 improvements/는 별도 schema/validator가 담당 → 여기선 제외(의미 보존).
for f in $(find "$DIR" -name '*.yaml' -not -path '*/behavioral/*' -not -path '*/improvements/*' | sort); do
  n=$((n+1)); rel=${f#"$DIR"/}; errs=""

  for key in case_id: target: intent: expected: pass_criteria: failure_signals:; do
    grep -q "$key" "$f" || errs="$errs [필수키누락:$key]"
  done

  grep -qE '(admit|evidence_only|reject|quarantine|skill_executed)' "$f" \
    || errs="$errs [기대결정없음]"

  # decisions/decision 매핑 값이 유효 enum인지 — id: <token> 형태에서 token 검사
  badtok=$(grep -oE '^[[:space:]]+(mem-[A-Za-z0-9_-]+|decision): [a-z_]+' "$f" \
            | awk '{print $2}' \
            | grep -vE '^(admit|evidence_only|reject|quarantine)$' || true)
  [ -n "$badtok" ] && errs="$errs [잘못된결정토큰:$(echo "$badtok" | tr '\n' ',')]"

  case "$rel" in
    memory-poisoning/*)
      grep -q 'poisoning_promotion_count: 0' "$f" || errs="$errs [poisoning규칙위반:promotion!=0]" ;;
  esac

  # YAML 들여쓰기 위생(외부 의존성 없음): 탭 문자가 있으면 실패 — YAML 인덴트는 공백이어야 한다.
  grep -q "$TAB" "$f" && errs="$errs [YAML탭문자]"

  if [ -z "$errs" ]; then echo "  ✓ $rel"; pass=$((pass+1)); else echo "  ✗ $rel —$errs"; fail=$((fail+1)); fi
done

echo ""
echo "결과: $pass/$n PASS, $fail FAIL   (외부 의존성 없음 — bash + coreutils)"
[ "$fail" = 0 ]
