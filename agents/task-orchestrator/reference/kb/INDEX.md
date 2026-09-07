# Task Orchestrator Knowledge Base — 색인

| 실행 신호 | 읽을 KB | 용도 |
|---|---|---|
| wave 준비와 실행 방식 선택 | [bounded-scheduling](bounded-scheduling.md) | 독립성·routing 계약·runtime-derived capacity |
| 새 context의 native child | [native-subagent-handoff](native-subagent-handoff.md) | 최소 handoff·child ID·중단·회수 |
| route 선택·retry/failover/escalation/repair | [routing-state-machine](routing-state-machine.md) | trusted catalog, immutable attempt, fail-closed transition |
| 모든 child 결과 회수·AC별 취합·완료 판정 | [result-aggregation](result-aggregation.md) | attempt identity, completion matrix, exact inventory gate |
| child 결과 통합·shared file 충돌 | [integration-conflicts](integration-conflicts.md) | 검증과 충돌 해결 |
| complete/partial/failure/cancel | [lifecycle-reporting](lifecycle-reporting.md) | 상태 전이와 report schema |

상위 판단 기준은 [`../principles.md`](../principles.md)다. 현재 phase topic만 읽는다.
interrupted child, stale base, partial atomicity 실패가 관찰되면 해당 신호용 회귀 KB를 추가한다.
