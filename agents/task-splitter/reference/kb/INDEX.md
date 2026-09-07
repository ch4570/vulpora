# Task Splitter Knowledge Base — 색인

| 작업 신호 | 읽을 KB | 용도 |
|---|---|---|
| feature를 구현 가능한 결과 단위로 분해 | [decomposition-quality](decomposition-quality.md) | AC→contract→evidence 지도와 분해 품질 gate |
| task·dependency·wave 생성 | [dependency-dag](dependency-dag.md) | DAG 불변식과 병렬 조건 |
| owner와 파일 경계 설정 | [ownership-write-scopes](ownership-write-scopes.md) | bounded ownership과 충돌 방지 |
| acceptance·risk·budget 연결 | [acceptance-risk-budget](acceptance-risk-budget.md) | 추적성과 실행 계약 |
| 비용·난이도별 모델과 실행 주체 선택 | [model-session-routing](model-session-routing.md) | runtime-native profile, deterministic/native-subagent/leader-inline routing |
| provider-neutral route requirement와 fail-closed bounds | [smart-routing-policy](smart-routing-policy.md) | capability/risk/reasoning/cost/policy v2 계약 |
| 최종 machine-readable plan 출력 | [task-dag-schema](task-dag-schema.md) | DAG v2 schema |

상위 판단 기준은 [`../principles.md`](../principles.md)다. 현재 분해 신호에 필요한 topic만 읽는다.
대규모 migration이나 monorepo 교차 모듈 분해 실패가 관찰되면 해당 신호용 회귀 KB를 추가한다.
