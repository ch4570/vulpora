#!/usr/bin/env bash
set -eu
DIR="$(cd "$(dirname "$0")" && pwd -P)"; ROOT="$(cd "$DIR/.." && pwd -P)"
VALIDATOR="$ROOT/skills/start-task/scripts/validate-question-frame.js"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/vulpora-question-frame.XXXXXX")" || exit 1
trap 'rm -rf "$WORK"' EXIT HUP INT TERM

printf '%s\n' \
  '현재 명확도는 62/100이고 모호성은 38/100입니다.' \
  '사용자가 확인할 성공 결과와 검증 방법이 아직 충분히 정해지지 않았습니다.' \
  '원하시면 남은 가정과 위험을 기록하고 현재 내용으로 작업 명세를 확정해 구현을 시작할 수 있습니다.' \
  '추천 기본값: 기존 성공 응답을 유지해 호환성 위험을 줄입니다.' \
  '`추천 기본값으로 진행` 또는 원하는 다른 성공 결과를 알려주시겠어요?' > "$WORK/valid.txt"

printf '%s\n' \
  '지금은 명확도 62/100, 모호성 38/100 정도입니다.' \
  '사용자가 직접 확인할 성공 결과가 아직 덜 정해졌습니다.' \
  '더 다듬을 수도 있고, 원하시면 불확실성과 위험을 남긴 채 현재 요구사항을 확정하고 구현할 수 있습니다.' \
  '추천 기본값: 기존 성공 결과를 유지해 회귀 위험을 줄입니다.' \
  '`추천 기본값으로 진행` 또는 직접 원하는 다른 성공 결과를 알려주시겠어요?' > "$WORK/natural-variant.txt"

printf '%s\n' \
  '지금은 명확도 62/100, 모호성 38/100 정도입니다. 직접 확인할 성공 결과가 아직 덜 정해졌습니다. 불확실성과 위험을 남긴 채 현재 요구사항을 확정하고 구현해도 됩니다. 추천 기본값: 기존 성공 결과를 유지해 회귀 위험을 줄입니다. `추천 기본값으로 진행` 또는 직접 원하는 다른 성공 결과를 알려주시겠어요?' > "$WORK/one-paragraph.txt"

printf '%s\n' \
  '지금은 명확도 62/100, 모호성 38/100 정도입니다.' \
  '사용자가 확인할 성공 결과가 아직 덜 정해졌습니다.' \
  '불확실성을 기록한 채 현재 작업 명세를 확정하고 바로 진행해도 괜찮습니다.' \
  '추천 기본값: 기존 성공 결과를 유지해 회귀 위험을 줄입니다.' \
  '`추천 기본값으로 진행` 또는 원하는 다른 성공 결과를 알려주시겠어요?' > "$WORK/natural-proceed.txt"

printf '%s\n' \
  '지금은 명확도 62/100, 모호성 38/100 정도입니다.' \
  '사용자가 확인할 성공 결과가 아직 덜 정해졌습니다.' \
  '원하시면 남은 가정과 위험을 기록하고 현재 작업 명세를 확정해 구현하겠습니다.' \
  '추천 기본값: 기존 성공 결과를 유지해 회귀 위험을 줄입니다.' \
  '`추천 기본값으로 진행` 또는 원하는 다른 성공 결과를 알려주시겠어요?' > "$WORK/natural-commitment.txt"

printf '%s\n' \
  '현재 명확도는 62/100이고 모호성은 38/100입니다.' \
  '사용자가 확인할 성공 결과와 검증 방법이 아직 충분히 정해지지 않았습니다.' \
  '원하시면 남은 가정과 위험을 기록하고 현재 작업 명세를 확정해 작업을 시작하겠습니다.' \
  '추천 기본값: 기존 성공 결과를 유지해 회귀 위험을 줄입니다.' \
  '`추천 기본값으로 진행` 또는 원하는 다른 성공 결과를 알려주시겠어요?' > "$WORK/natural-start.txt"

printf '%s\n' \
  '현재 명확도는 62/100이고 모호성은 38/100입니다.' \
  '사용자가 확인할 성공 결과와 검증 방법이 아직 충분히 정해지지 않았습니다.' \
  '원하시면 남은 가정과 위험을 기록하고 현재 요구사항을 확정해 일단 만들어 보겠습니다.' \
  '추천 기본값: 기존 성공 결과를 유지해 회귀 위험을 줄입니다.' \
  '`추천 기본값으로 진행` 또는 원하는 다른 성공 결과를 알려주시겠어요?' > "$WORK/natural-build.txt"

printf '%s\n' \
  '현재 명확도는 40/100이고 모호성은 60/100입니다.' \
  '파괴적 작업의 대상과 복구 범위가 아직 정해지지 않았습니다.' \
  '이 결정이 확인되기 전에는 실행을 시작할 수 없습니다.' \
  '삭제 대상의 복구 범위를 알려주시겠어요?' > "$WORK/safety-blocked.txt"

printf '%s\n' \
  '현재 명확도는 40/100이고 모호성은 60/100입니다.' \
  '파괴적 작업의 대상과 복구 범위가 아직 정해지지 않았습니다.' \
  '이 결정이 확인될 때까지 실행을 시작하지 않겠습니다.' \
  '삭제 대상의 복구 범위를 알려주시겠어요?' > "$WORK/natural-safety-blocked.txt"

printf '%s\n' \
  '현재 명확도는 40/100이고 모호성은 60/100입니다.' \
  '외부 변경의 대상과 영향 범위가 아직 정해지지 않았습니다.' \
  '이 결정이 확인되기 전에는 실행을 시작할 수 없습니다.' \
  '릴리스 대상의 영향 범위를 알려주시겠어요?' > "$WORK/external-safety-blocked.txt"

printf '%s\n' \
  '현재 명확도는 40/100이고 모호성은 60/100입니다.' \
  '삭제 대상과 복구 범위가 아직 정해지지 않았습니다.' \
  '원하시면 위험을 기록하고 지금 구현을 시작할 수 있습니다.' \
  '이 결정이 확인되기 전에는 구현을 시작할 수 없습니다.' \
  '삭제해도 되는 데이터의 범위를 알려주시겠어요?' > "$WORK/unsafe-mixed.txt"

printf '%s\n' \
  '현재 명확도는 40/100이고 모호성은 60/100입니다.' \
  '삭제 대상과 복구 범위가 아직 정해지지 않았습니다.' \
  '이 결정이 확인되기 전에는 실행을 시작할 수 없습니다.' \
  '그래도 지금 삭제 작업을 진행해도 괜찮습니다.' \
  '삭제해도 되는 데이터의 범위를 알려주시겠어요?' > "$WORK/unsafe-permission-variant.txt"

printf '%s\n' \
  '현재 명확도는 40/100이고 모호성은 60/100입니다.' \
  '운영 데이터 제거 범위와 복구 방법이 아직 정해지지 않았습니다.' \
  '이 결정이 확인되기 전에는 구현을 시작할 수 없습니다.' \
  '원하시면 위험을 감수하고 데이터 제거에 착수하셔도 됩니다.' \
  '운영 데이터 제거 범위를 알려주시겠어요?' > "$WORK/unsafe-removal-synonym.txt"

printf '%s\n' \
  '현재 명확도는 40/100이고 모호성은 60/100입니다.' \
  '삭제 대상과 복구 범위가 아직 정해지지 않았습니다.' \
  '삭제하면 안 된다는 우려가 있지만 원하시면 지금 삭제를 진행해도 괜찮습니다.' \
  '삭제 대상의 복구 범위를 알려주시겠어요?' > "$WORK/unsafe-denial-mask.txt"

printf '%s\n' \
  '현재 명확도는 40/100이고 모호성은 60/100입니다.' \
  '삭제 대상과 복구 범위가 아직 정해지지 않았습니다.' \
  '이 결정이 확인되기 전에는 구현을 시작할 수 없습니다만 실제 작업은 계속 진행하겠습니다.' \
  '삭제 대상의 복구 범위를 알려주시겠어요?' > "$WORK/unsafe-continued-work.txt"

printf '%s\n' \
  '현재 명확도는 40/100이고 모호성은 60/100입니다.' \
  '운영 데이터 삭제 범위와 복구 방법이 아직 정해지지 않았습니다.' \
  '원하시면 위험을 기록하고 지금 삭제 작업을 진행해도 괜찮습니다.' \
  '운영 데이터 삭제 범위를 알려주시겠어요?' > "$WORK/destructive-clarification.txt"

printf '%s\n' \
  '현재 명확도는 40/100이고 모호성은 60/100입니다.' \
  'PR 병합 대상과 배포 영향이 아직 정해지지 않았습니다.' \
  '이 결정이 확인되기 전에는 실행을 시작할 수 없습니다.' \
  '원하시면 확인 전에 PR을 병합하겠습니다.' \
  '병합 대상의 배포 영향은 무엇인가요?' > "$WORK/unsafe-merge.txt"

printf '%s\n' \
  '현재 명확도는 40/100이고 모호성은 60/100입니다.' \
  '외부 저장소 공유 대상과 접근 범위가 아직 정해지지 않았습니다.' \
  '이 결정이 확인되기 전에는 실행을 시작할 수 없습니다.' \
  '원하시면 확인 전에 외부 저장소에 공유하겠습니다.' \
  '외부 저장소 공유 대상은 무엇인가요?' > "$WORK/unsafe-share.txt"

for action in \
  '새 버전을 릴리스하겠습니다' \
  '새 버전을 release하겠습니다' \
  '외부 이슈를 생성하겠습니다' \
  '운영 설정을 덮어쓰겠습니다'; do
  slug="$(printf '%s' "$action" | shasum -a 256 | cut -c1-12)"
  printf '%s\n' \
    '현재 명확도는 40/100이고 모호성은 60/100입니다.' \
    '릴리스 대상과 공개 범위가 아직 정해지지 않았습니다.' \
    '이 결정이 확인되기 전에는 실행을 시작할 수 없습니다.' \
    "원하시면 확인 전에 $action." \
    '릴리스 대상의 공개 범위는 무엇인가요?' > "$WORK/unsafe-generic-$slug.txt"
done

printf '%s\n' \
  '현재 명확도는 40/100이고 모호성은 60/100입니다. 원하시면 확인 전에 새 버전을 릴리스하겠습니다.' \
  '릴리스 대상과 공개 범위가 아직 정해지지 않았습니다.' \
  '이 결정이 확인되기 전에는 실행을 시작할 수 없습니다.' \
  '릴리스 대상의 공개 범위는 무엇인가요?' > "$WORK/unsafe-score-injection.txt"

printf '%s\n' \
  '현재 명확도는 40/100이고 모호성은 60/100입니다.' \
  '릴리스 대상과 공개 범위가 아직 정해지지 않았습니다. 원하시면 확인 전에 새 버전을 릴리스하겠습니다.' \
  '이 결정이 확인되기 전에는 실행을 시작할 수 없습니다.' \
  '릴리스 대상의 공개 범위는 무엇인가요?' > "$WORK/unsafe-uncertainty-injection.txt"

printf '%s\n' \
  '현재 명확도는 40/100이고 모호성은 60/100입니다.' \
  '릴리스 대상과 공개 범위가 아직 정해지지 않았습니다.' \
  '확인 전에 새 버전을 릴리스하겠습니다. 이 결정이 확인되기 전에는 실행을 시작할 수 없습니다.' \
  '릴리스 대상의 공개 범위는 무엇인가요?' > "$WORK/unsafe-block-injection.txt"

printf '%s\n' \
  '현재 명확도는 40/100이고 모호성은 60/100입니다.' \
  '릴리스 대상과 공개 범위가 아직 정해지지 않았지만 확인 전에 새 버전을 릴리스하겠습니다.' \
  '이 결정이 확인되기 전에는 실행을 시작할 수 없습니다.' \
  '릴리스 대상의 공개 범위는 무엇인가요?' > "$WORK/unsafe-contrast-injection.txt"

printf '%s\n' \
  '현재 명확도는 62/100이고 모호성은 38/100입니다.' \
  '검색 목표와 성공 결과가 아직 충분히 정해지지 않았습니다.' \
  '원하시면 불확실성과 위험을 기록하고 구현할 수 있습니다.' \
  '좋아하는 색을 알려주시겠어요?' > "$WORK/unrelated-focus.txt"

printf '%s\n' \
  '현재 명확도는 62/100이고 모호성은 38/100입니다.' \
  '검색 목표와 성공 결과가 아직 충분히 정해지지 않았습니다.' \
  '원하시면 불확실성과 위험을 기록하고 구현할 수 있습니다.' \
  '검색 화면의 배경색은 무엇인가요?' > "$WORK/one-token-focus.txt"

printf '%s\n' \
  '현재 명확도는 62/100이고 모호성은 38/100입니다.' \
  '검색 목표와 성공 결과가 아직 충분히 정해지지 않았습니다.' \
  '원하시면 불확실성과 위험을 기록하고 구현할 수 있습니다.' \
  '검색 검색 화면의 배경색은 무엇인가요?' > "$WORK/repeated-token-focus.txt"

printf '%s\n' \
  '현재 명확도는 62/100이고 모호성은 38/100입니다.' \
  '검색 목표와 성공 결과가 아직 충분히 정해지지 않았습니다.' \
  '먼저 제외 범위도 알려주세요.' \
  '원하시면 불확실성과 위험을 기록하고 구현할 수 있습니다.' \
  '검색 목표의 성공 결과는 무엇인가요?' > "$WORK/extra-request.txt"

printf '%s\n' \
  '현재 명확도는 62/100이고 모호성은 38/100입니다.' \
  '완료 기준과 제외 범위가 아직 충분히 정해지지 않았습니다.' \
  '원하시면 불확실성과 위험을 기록하고 구현할 수 있습니다.' \
  '완료 기준은 무엇이며 제외 범위는 어디인가요?' > "$WORK/compound-interrogatives.txt"

printf '%s\n' \
  '현재 명확도는 62/100이고 모호성은 38/100입니다.' \
  '구현 성공 기준이 아직 불확실하고 위험합니다.' \
  '구현할 수 있을지와 성공 기준이 아직 불확실하고 위험합니다.' \
  '구현 성공 기준은 무엇인가요?' > "$WORK/false-proceed-description.txt"

printf '%s\n' \
  '현재 명확도는 62/100이고 모호성은 38/100입니다.' \
  '구현 성공 기준이 아직 불확실합니다.' \
  '불확실성과 위험을 기록해도 지금 구현할 수 있지 않습니다.' \
  '구현 성공 기준은 무엇인가요?' > "$WORK/negated-proceed.txt"

printf '%s\n' \
  '현재 명확도는 62/100이고 모호성은 38/100입니다.' \
  '구현 성공 기준이 아직 불확실하고 위험합니다.' \
  '불확실성 때문에 지금은 구현하지 않기로 하겠습니다.' \
  '구현 성공 기준은 무엇인가요?' > "$WORK/negative-commitment.txt"

printf '%s\n' \
  '현재 명확도는 62/100이고 모호성은 38/100입니다.' \
  '로그인 세션 복구 방법과 성공 기준이 아직 충분히 정해지지 않았습니다.' \
  '원하시면 남은 가정과 위험을 기록하고 현재 작업 명세를 확정해 구현하겠습니다.' \
  '추천 기본값: 기존 세션 복구 동작을 유지해 회귀 위험을 줄입니다.' \
  '`추천 기본값으로 진행` 또는 원하는 다른 세션 복구 성공 기준을 알려주시겠어요?' > "$WORK/benign-recovery.txt"

printf '%s\n' \
  '현재 명확도는 62/100이고 모호성은 38/100입니다.' \
  '현재 명확도는 80/100이고 모호성은 20/100입니다.' \
  '사용자가 확인할 성공 결과가 아직 덜 정해졌습니다.' \
  '원하시면 불확실성과 위험을 기록하고 구현할 수 있습니다.' \
  '사용자가 확인할 성공 결과는 무엇인가요?' > "$WORK/duplicate-score.txt"

printf '%s\n' \
  '현재 명확도는 62/100이고 모호성은 38/100입니다.' \
  '성공 기준이 아직 불확실하다는 뜻은 아닙니다.' \
  '원하시면 남은 가정과 위험을 기록하고 지금 구현할 수 있습니다.' \
  '성공 기준의 검증 방법은 무엇인가요?' > "$WORK/negated-uncertainty.txt"

printf '%s\n' \
  '현재 명확도는 85/100이고 모호성은 15/100입니다.' \
  '성공 기준의 검증 방법이 아직 덜 정해졌습니다.' \
  '원하시면 남은 가정과 위험을 기록하고 지금 구현할 수 있습니다.' \
  '성공 기준의 검증 방법은 무엇인가요?' > "$WORK/above-threshold-question.txt"

printf '%s\n' \
  '이 디렉터리에서 설치할 시스템 범위를 어디까지로 잡을까요?' > "$WORK/vague-install.txt"

printf '%s\n' \
  '다음 중 하나를 선택하세요?' > "$WORK/objective.txt"

cp "$WORK/valid.txt" "$WORK/two-questions.txt"
printf '%s\n' '추가로 제외 범위도 알려주시겠어요?' >> "$WORK/two-questions.txt"

printf '%s\n' \
  '완료 기준과 제외 범위를 각각 알려주실 수 있나요?' > "$WORK/compound.txt"

printf '%s\n' \
  '현재 명확도는 62/100이고 모호성은 41/100입니다.' \
  '완료 기준이 아직 충분히 정해지지 않았습니다.' \
  '원하시면 지금 구현을 시작할 수 있습니다.' \
  '성공 결과를 알려주시겠어요?' > "$WORK/mismatched-score.txt"

printf '%s\n' \
  '현재 명확도는 62/100이고 모호성은 38/100입니다.' \
  '완료 기준이 아직 충분히 정해지지 않았습니다.' \
  '성공 결과를 알려주시겠어요?' > "$WORK/no-proceed-choice.txt"

printf '%s\n' \
  '현재 명확도는 62/100이고 모호성은 38/100입니다.' \
  '사용자가 확인할 성공 결과와 검증 방법이 아직 충분히 정해지지 않았습니다.' \
  '원하시면 남은 가정과 위험을 기록하고 지금 구현을 시작할 수 있습니다.' \
  '추천 기본값: 기존 성공 응답을 유지해 호환성 위험을 줄입니다.' \
  '`추천 기본값으로 진행` 또는 원하는 다른 성공 결과를 알려주시겠어요?' > "$WORK/missing-spec-confirmation.txt"

printf '%s\n' '질문: 이번 작업의 목표는 무엇인가요?' > "$WORK/labeled.txt"
printf '%s\n' \
  '명확도: 27/100 (gate: blocked, threshold: 85)' \
  '이번 작업의 목표는 무엇인가요?' > "$WORK/metadata.txt"

printf '%s\n' \
  '구현 범위를 확정하려면 아래 세 가지만 알려주세요.' \
  '1. 우선 대상: 첫 번째 항목 또는 두 번째 항목 중 무엇인가요?' \
  '2. 최적화 목표: 무엇이 핵심인가요?' \
  '3. 변경 범위: DB migration도 포함할까요?' > "$WORK/batched.txt"

printf '%s\n' \
  '현재 명확도는 62/100이고 모호성은 38/100입니다.' \
  '사용자가 확인할 성공 결과와 검증 방법이 아직 충분히 정해지지 않았습니다.' \
  '원하시면 남은 가정과 위험을 기록하고 지금 구현을 시작할 수 있습니다.' \
  '사용자가 확인할 수 있는 성공 결과를 알려주시겠어요?' > "$WORK/missing-default.txt"

printf '%s\n' \
  '현재 명확도는 62/100이고 모호성은 38/100입니다.' \
  '사용자가 확인할 성공 결과와 검증 방법이 아직 충분히 정해지지 않았습니다.' \
  '원하시면 남은 가정과 위험을 기록하고 지금 구현을 시작할 수 있습니다.' \
  '추천 기본값: 기존 성공 응답을 유지해 호환성 위험을 줄입니다.' \
  '`추천 기본값`과 `새 성공 결과` 중 하나를 선택하시겠어요?' > "$WORK/closed-choice.txt"

clarify() { node "$VALIDATOR" --risk-category scope "$@"; }
safety() { node "$VALIDATOR" --mode safety-blocked --risk-category destructive "$@"; }
safety_external() { node "$VALIDATOR" --mode safety-blocked --risk-category external_write "$@"; }

clarify --expected-clarity 62 < "$WORK/valid.txt" >/dev/null
clarify --expected-clarity 62 < "$WORK/natural-variant.txt" >/dev/null
clarify --expected-clarity 62 < "$WORK/one-paragraph.txt" >/dev/null
clarify --expected-clarity 62 < "$WORK/natural-proceed.txt" >/dev/null
clarify --expected-clarity 62 < "$WORK/natural-commitment.txt" >/dev/null
clarify --expected-clarity 62 < "$WORK/natural-start.txt" >/dev/null
clarify --expected-clarity 62 < "$WORK/natural-build.txt" >/dev/null
clarify --expected-clarity 62 < "$WORK/benign-recovery.txt" >/dev/null
safety --expected-clarity 40 < "$WORK/safety-blocked.txt" >/dev/null
safety --expected-clarity 40 < "$WORK/natural-safety-blocked.txt" >/dev/null
safety_external --expected-clarity 40 < "$WORK/external-safety-blocked.txt" >/dev/null
if node "$VALIDATOR" --risk-category destructive --expected-clarity 40 < "$WORK/safety-blocked.txt" >/dev/null 2>&1; then exit 1; fi
if safety --expected-clarity 40 < "$WORK/unsafe-mixed.txt" >/dev/null 2>&1; then exit 1; fi
if safety --expected-clarity 40 < "$WORK/unsafe-permission-variant.txt" >/dev/null 2>&1; then exit 1; fi
if safety --expected-clarity 40 < "$WORK/unsafe-removal-synonym.txt" >/dev/null 2>&1; then exit 1; fi
if safety --expected-clarity 40 < "$WORK/unsafe-denial-mask.txt" >/dev/null 2>&1; then exit 1; fi
if safety --expected-clarity 40 < "$WORK/unsafe-continued-work.txt" >/dev/null 2>&1; then exit 1; fi
if safety --expected-clarity 40 < "$WORK/unsafe-merge.txt" >/dev/null 2>&1; then exit 1; fi
if safety --expected-clarity 40 < "$WORK/unsafe-share.txt" >/dev/null 2>&1; then exit 1; fi
for file in "$WORK"/unsafe-generic-*.txt; do
  if safety_external --expected-clarity 40 < "$file" >/dev/null 2>&1; then exit 1; fi
done
for file in "$WORK"/unsafe-*-injection.txt; do
  if safety_external --expected-clarity 40 < "$file" >/dev/null 2>&1; then exit 1; fi
done
if node "$VALIDATOR" --risk-category destructive --expected-clarity 40 < "$WORK/destructive-clarification.txt" >/dev/null 2>&1; then exit 1; fi
if clarify --expected-clarity 62 < "$WORK/unrelated-focus.txt" >/dev/null 2>&1; then exit 1; fi
if clarify --expected-clarity 62 < "$WORK/one-token-focus.txt" >/dev/null 2>&1; then exit 1; fi
if clarify --expected-clarity 62 < "$WORK/repeated-token-focus.txt" >/dev/null 2>&1; then exit 1; fi
if clarify --expected-clarity 62 < "$WORK/extra-request.txt" >/dev/null 2>&1; then exit 1; fi
if clarify --expected-clarity 62 < "$WORK/compound-interrogatives.txt" >/dev/null 2>&1; then exit 1; fi
if clarify --expected-clarity 62 < "$WORK/false-proceed-description.txt" >/dev/null 2>&1; then exit 1; fi
if clarify --expected-clarity 62 < "$WORK/negated-proceed.txt" >/dev/null 2>&1; then exit 1; fi
if clarify --expected-clarity 62 < "$WORK/negative-commitment.txt" >/dev/null 2>&1; then exit 1; fi
if clarify --expected-clarity 62 < "$WORK/duplicate-score.txt" >/dev/null 2>&1; then exit 1; fi
if clarify --expected-clarity 62 < "$WORK/negated-uncertainty.txt" >/dev/null 2>&1; then exit 1; fi
if clarify --expected-clarity 85 < "$WORK/above-threshold-question.txt" >/dev/null 2>&1; then exit 1; fi
if node "$VALIDATOR" --risk-category scope < "$WORK/valid.txt" >/dev/null 2>&1; then exit 1; fi
if node "$VALIDATOR" --expected-clarity 62 < "$WORK/valid.txt" >/dev/null 2>&1; then exit 1; fi
if clarify --expected-clarity 61 < "$WORK/valid.txt" >/dev/null 2>&1; then exit 1; fi
if node "$VALIDATOR" --mode freeze-confirmation --risk-category scope --expected-clarity 62 < "$WORK/valid.txt" >/dev/null 2>&1; then exit 1; fi
if clarify --expected-clarity 62 < "$WORK/vague-install.txt" >/dev/null 2>&1; then exit 1; fi
if clarify --expected-clarity 62 < "$WORK/objective.txt" >/dev/null 2>&1; then exit 1; fi
if clarify --expected-clarity 62 < "$WORK/two-questions.txt" >/dev/null 2>&1; then exit 1; fi
if clarify --expected-clarity 62 < "$WORK/compound.txt" >/dev/null 2>&1; then exit 1; fi
if clarify --expected-clarity 62 < "$WORK/mismatched-score.txt" >/dev/null 2>&1; then exit 1; fi
if clarify --expected-clarity 62 < "$WORK/no-proceed-choice.txt" >/dev/null 2>&1; then exit 1; fi
if clarify --expected-clarity 62 < "$WORK/missing-spec-confirmation.txt" >/dev/null 2>&1; then exit 1; fi
if clarify --expected-clarity 62 < "$WORK/batched.txt" >/dev/null 2>&1; then exit 1; fi
if clarify --expected-clarity 62 < "$WORK/labeled.txt" >/dev/null 2>&1; then exit 1; fi
if clarify --expected-clarity 62 < "$WORK/metadata.txt" >/dev/null 2>&1; then exit 1; fi
if clarify --expected-clarity 62 < "$WORK/missing-default.txt" >/dev/null 2>&1; then exit 1; fi
if clarify --expected-clarity 62 < "$WORK/closed-choice.txt" >/dev/null 2>&1; then exit 1; fi

printf '{"semantic_ac_key":"single_decision_frame_validation","outcome":"pass","clarification_frame_lines":5,"freeze_confirmation_mode_rejected":true,"clarity_and_ambiguity_visible":true,"canonical_score_bound":true,"structured_risk_category_bound":true,"duplicate_score_rejected":true,"user_can_proceed_with_uncertainty":true,"user_can_confirm_spec_below_threshold":true,"actionable_default_required":true,"custom_answer_path_required":true,"natural_commitment_variants":true,"safety_blocked_mode":true,"safety_canonical_allowlist":true,"destructive_wrong_mode_rejected":true,"external_write_synonyms_rejected":true,"benign_recovery_allowed":true,"score_math_checked":true,"question_count":1,"extra_request_rejected":true,"turn_ends_with_question":true,"closed_objective_choice_rejected":true,"compound_focus_rejected":true,"batched_prompt_rejected":true,"vague_install_scope_rejected":true}\n'
