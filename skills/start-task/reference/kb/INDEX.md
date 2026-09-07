# Start Task Knowledge Base — 색인

| phase·신호 | 읽을 KB | 용도 |
|---|---|---|
| 기본 실행 | [lightweight-path](lightweight-path.md) | 위험도 기반 profile 선택과 경량·표준 직접 실행 |
| audit profile 전체 workflow | [operating-contract](operating-contract.md) | clarify부터 terminal outcome까지의 감사형 상세 규약 |
| audit profile의 실행 가능한 경로 | [runtime-fast-path](runtime-fast-path.md) | 감사 불변식을 유지하는 deterministic writer·validator 사용 |
| clarify/approve/split 전이 | [phase-gates](phase-gates.md) | 유한한 상태 전이와 구현 게이트 |
| 명확도·모호성 점수와 사용자 진행 결정 | [clarity-scoring](clarity-scoring.md) | 100점 rubric, 85점 threshold, 비우회 blocker |
| spec → DAG → route receipt → result 전달 | [handoff-contracts](handoff-contracts.md) | v2 schema·route trust boundary·provenance·authority 불변식 |
| execute/integrate/verify | [bounded-orchestration](bounded-orchestration.md) | native subagent 실행·동적 병렬성·충돌 처리 |
| execution attempt failure | [bounded orchestration](bounded-orchestration.md) + `scripts/classify-routing-attempt.js` | exact bounded retry/failover/escalation/repair/block decision |
| child dispatch/control | [bounded orchestration](bounded-orchestration.md) | 호스트 native child의 생성·상태·중단·결과 회수 |
| 모든 phase/task/command | [execution-ledger](execution-ledger.md) | append-only hash chain·증거 등급·사용자 진행 로그 |
| complete/partial/failure/cancel | [terminal-reporting](terminal-reporting.md) | terminal status와 보고 증거 |
| terminal report 조립 | [orchestration-report.valid.json](orchestration-report.valid.json) | compact v3 시작점; schema는 미해결 validator 오류에만 읽음 |

상위 판단 기준은 [`../principles.md`](../principles.md)다. 현재 phase에 필요한 topic만 읽는다.
runtime별 native agent/subagent capability나 interruption 동작이 바뀌면 이 색인과 관련 회귀 case를 재검증한다.
사용자·운영자용 전체 설명은 [`docs/start-task-orchestration.md`](../../../../docs/start-task-orchestration.md)에
모델 라우팅, DAG 분해, scheduler, ledger 검증을 한 흐름으로 정리한다.
