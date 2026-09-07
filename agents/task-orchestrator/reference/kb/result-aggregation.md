---
title: Structured child-result aggregation and completion accounting
source: Vulpora orchestration and acceptance-evidence contracts
last_fetched: 2026-08-25
consumers: [task-orchestrator, start-task]
owner: task-orchestrator
source_type: internal-contract
status: verified
evals: [task-orchestrator.result-aggregation.v1]
---

# Structured child-result aggregation and completion accounting

Primary owner는 child의 자연어 요약을 이어 붙이지 않는다. Frozen DAG inventory와 acceptance criteria를
기준축으로 삼아 모든 attempt/result를 구조적으로 대조하고, 실제 workspace evidence를 다시 관찰한 뒤
채택·수리·거부를 결정한다.

## 집계 절차

1. Frozen DAG에서 expected task id, task별 AC id, dependency, owner role, write scope를 읽어 expected inventory를
   만든다.
2. 모든 dispatch receipt마다 동일한 `task_id + attempt_id`의 terminal structured result가 정확히 하나 있는지
   확인한다. Missing, duplicate, stale attempt, receipt/handoff/runtime route mismatch는 해당 task를 verified로
   만들 수 없다.
3. Result의 `actual_paths`, `changed_files`, mutation state, evidence reference를 실제 diff/artifact와 대조한다.
   Child가 언급하지 않은 변경도 찾고 scope 밖 변경은 채택하지 않는다.
4. Topological order로 result를 검토한다. Dependency output은 child prose가 아니라 frozen artifact/path/schema와
   recorder-observed command/file digest로만 다음 task에 전달한다.
5. 다음 completion matrix를 session state에 유지한다.

| field | 의미 |
|---|---|
| `task_id`, `attempt_id`, `child_id` | dispatch/result identity |
| `expected_ac_ids` | DAG가 요구한 AC inventory |
| `actual_paths`, `scope_check` | 실제 변경과 scope 준수 결과 |
| `observed_evidence` | primary가 다시 읽은 file/command digest |
| `decision` | `accepted|repair|rejected|blocked|cancelled` |
| `verified_ac_ids`, `missing_ac_ids` | 채택된 fresh evidence와 gap |
| `conflicts`, `risks` | 보존해야 할 충돌·반대 근거·잔여 위험 |

6. 같은 AC에 상충하는 결과가 있으면 성공 쪽만 골라 숨기지 않는다. 실제 contract와 deterministic evidence로
   해소하고, 해소되지 않으면 repair/block/escalate한다.
7. Existing report v3의 `task_results`, `verification`, `conflicts`, `risks`, `gaps`, `continuation`을 이 matrix에서
   파생한다. Schema에 없는 임의 필드를 넣는 대신 matrix의 결정을 해당 기존 필드에 손실 없이 투영한다.

## 완료 gate

`complete`는 expected task inventory와 accepted terminal result가 정확히 일치하고, 모든 expected AC가 fresh
recorder-observed pass evidence에 연결되며, missing/duplicate/stale/conflicting result, pending child, scope
violation, unresolved conflict, known in-scope error가 모두 0일 때만 허용한다. Child 수와 성공 메시지 수가
맞는 것만으로는 부족하다.

## 리뷰 훅

- [ ] 모든 dispatch attempt가 정확히 하나의 terminal structured result와 연결되는가?
- [ ] Task/attempt/receipt/handoff/runtime identity가 서로 일치하는가?
- [ ] Primary가 실제 diff·artifact·command evidence를 다시 관찰했는가?
- [ ] Expected task/AC inventory와 verified result/evidence inventory가 exact-match하는가?
- [ ] 상충·누락·scope 밖 결과가 숨겨지지 않고 repair/reject/block로 판정됐는가?
- [ ] 최종 report의 task results, conflicts, gaps, risks, continuation이 completion matrix에서 파생됐는가?
