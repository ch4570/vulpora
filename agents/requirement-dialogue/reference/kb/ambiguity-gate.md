---
title: 구현 전 모호성 게이트
source: ISO/IEC/IEEE 29148:2018 Requirements engineering; Vulpora STANDARD.md section 6
last_fetched: 2026-08-11
consumers: [requirement-dialogue]
---

# 구현 전 모호성 게이트

다음 축을 각각 `resolved`, `non_blocking`, `blocking`으로 분류한다.

| 축 | ready에 필요한 관찰 가능 조건 |
|---|---|
| 목표 | 사용자 또는 시스템이 얻을 결과가 한 문장으로 설명됨 |
| 범위 | 포함·제외 대상과 주요 경계가 구분됨 |
| 인수기준 | 각 핵심 결과를 관찰하거나 실행해 판정할 수 있음 |
| 제약 | 호환성·성능·보안·dependency·시간 제약이 알려졌거나 비적용으로 확인됨 |
| authority | 읽기·쓰기·외부 부작용·파괴적 작업 범위가 상위 정책과 모순 없음 |
| 검증 | 관련 test/lint/build 또는 수동 판정 방법이 존재함 |
| unknown | 남은 unknown이 모두 가역적이고 작은 영향이거나 명시적으로 제외됨 |

blocking 항목이 0개이고 `clarity-scoring.md`의 gate가 `passed|skipped`이면 현재 구현 요청 digest에
결합된 `ready` candidate를 반환한다. Generic freeze confirmation은 만들지 않는다.
명세의 길이, 질문 횟수, 구현 아이디어의 구체성은 ready 근거가 아니다. 점수와 미결정 영역을 사용자에게
보여준 뒤 사용자가 현재 상태로 구현을 명시하면 숫자 gate만 skip할 수 있다. 이 경우에도 권한,
실행 가능한 목표 부재, 파괴적·비가역 작업, credential/security, 외부 write, 공개 계약, material
data-model blocker는 남는다.

## 리뷰 훅

- [ ] 완료를 pass/fail로 판정할 수 있는가?
- [ ] 공개 API·schema·데이터 삭제·외부 전송 선택을 가정하지 않았는가?
- [ ] scope 밖 항목과 남은 unknown이 명시되었는가?
- [ ] `ready`와 `blocking: true`가 동시에 존재하지 않는가?
- [ ] 점수가 85점 미만이면 사용자가 점수·미결정 영역을 본 뒤 구현을 선택한 evidence가 있는가?
