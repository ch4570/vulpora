# Requirement Dialogue Knowledge Base — 색인

| 작업 신호 | 읽을 KB | 용도 |
|---|---|---|
| 목표·범위·완료 기준의 모호성 판정 | [ambiguity-gate](ambiguity-gate.md) | blocking 여부와 ready 조건 |
| 명확도·모호성 점수와 사용자 진행 결정 | [clarity-scoring](clarity-scoring.md) | weighted score와 비우회 blocker |
| 질문 반복, 질문 우선순위, 사용자 선택 | [questioning-policy](questioning-policy.md) | 사용자 결정형 소크라테스식 질의 |
| `ready`/`needs_input` 출력 | [clarified-spec-schema](clarified-spec-schema.md) | commit 상태와 명세 불변식 |

상위 판단 기준은 [`../principles.md`](../principles.md)다. topic KB는 현재 신호와 연결된 것만 읽는다.
`last_fetched`는 출처를 읽은 날짜이며 검증 인증이 아니다.

실제 실패 사례에서 반복 질문 패턴이나 승인 오판이 관찰되면 회귀 KB를 추가한다.
