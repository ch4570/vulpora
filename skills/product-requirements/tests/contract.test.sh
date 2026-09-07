#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILL="$ROOT/SKILL.md"
OPENAI="$ROOT/agents/openai.yaml"

require() {
  local file="$1" text="$2"
  grep -Fq -- "$text" "$file" || { echo "missing '$text' in $file" >&2; exit 1; }
}

test -s "$SKILL"
test -s "$OPENAI"

require "$SKILL" 'name: product-requirements'
require "$SKILL" '설치된 `korean-dev-writer`의 `SKILL.md`'
require "$SKILL" '스킬이 없거나 읽을 수 없으면 질문과 PRD를 출력하지 말고'
require "$SKILL" '한 응답에는 한국어 자유형 질문 하나만 출력한다.'
require "$SKILL" '침묵, 기본값, 업계 관행은 확인이 아니다.'
require "$SKILL" 'FR-001'
require "$SKILL" 'AC-001 (FR-001)'
require "$SKILL" '`Given`, `When`, `Then`'
require "$SKILL" '성공 지표의 이름, 기준선, 목표값, 측정 기간이나 데이터 출처를 추측하지 않는다.'
require "$SKILL" '구현, 배포, 결제, 삭제,'
require "$OPENAI" 'default_prompt: "Use $product-requirements'

actual_headings="$(
  sed -n '/<!-- PRD_TEMPLATE_START -->/,/<!-- PRD_TEMPLATE_END -->/p' "$SKILL" |
    grep '^## '
)"
expected_headings='## 문제
## 대상 사용자
## 목표
## 비목표
## 사용자 흐름
## 기능 요구사항
## 인수 기준
## 경계 조건과 실패 처리
## 성공 지표
## 우선순위
## 가정과 미확정 사항
## 위험과 의사결정 필요 항목
## 개발 handoff'

if [[ "$actual_headings" != "$expected_headings" ]]; then
  echo 'PRD headings differ from the required order or spelling' >&2
  printf 'actual:\n%s\n' "$actual_headings" >&2
  exit 1
fi

for decision in '비용' '보안' '개인정보' '외부 전송' '결제' '삭제' '공개 API'; do
  require "$SKILL" "$decision"
done

for handoff_field in '사용자 결과' '변경 범위' '인수 기준' '검증' '위험' '차단 요인'; do
  require "$SKILL" "- $handoff_field"
done

if grep -Fq '[TODO' "$SKILL"; then
  echo 'unfinished template marker found' >&2
  exit 1
fi

echo 'product-requirements contract: PASS'
