---
title: Start Task artifact handoff contracts
source: Vulpora agent contract and provenance rules
last_fetched: 2026-08-11
skills: [start-task]
---

# Artifact handoff contracts

| Producer | Schema | Consumer | 필수 gate |
|---|---|---|---|
| requirement-dialogue | `vulpora.clarified-task-spec-candidate/v2` | primary orchestrator | spec body, normative clarity projection, zero material blockers, implementation-intent digest |
| primary orchestrator | `vulpora.clarified-task-spec/v2` | task-splitter | canonical spec/projection bytes, ready, one spec-commit event, blocking unknown 0, clarity gate passed/skipped |
| task-splitter | `vulpora.task-dag/v2` | primary orchestrator | matching spec id/gate, DAG, AC coverage, dynamic parallelism, portable route requirements only |
| primary orchestrator | `vulpora.routing-dispatch-receipt/v1` | runtime/auditor | trusted catalog/policy filter+rank, exact selected route, immutable attempt |
| primary orchestrator | `vulpora.subagent-handoff/v2` | native child agent | task-local context, authority, scope, AC, budget, dispatch-receipt digest and immutable attempt binding; no concrete route IDs |
| native child agent | `vulpora.task-result/v2` | primary orchestrator | task/attempt id, actual paths, mutation state, evidence, candidate failure class, risks |
| primary orchestrator | `vulpora.routing-attempt-receipt/v1` | runtime/auditor | observed route/outcome, failure evidence, budget/hops, allowed transition |
| primary orchestrator | `vulpora.orchestration-report/v3` | user | terminal status, task/AC evidence, structured routing attempt lineage, risks |

handoff에는 전체 transcript가 아니라 id, schema version, 필요한 spec slice, provenance summary를 넣는다.
Consumer는 producer의 `status`를 신뢰하지 않고 schema와 불변식을 재검증한다. 모든 child authority는 spec
authority와 runtime policy의 부분집합이어야 한다.
Frozen v2 DAG route requirement는 capability profile, required capabilities, complexity evidence, risk floor,
reasoning range, relative attempt/total cost+token constraints, routing/data policy reference+version,
retry/failover/escalation/hop/attempt bounds를 반드시 포함한다. Concrete provider/model/deployment/endpoint/
catalog ID는 금지한다. Primary는 trusted runtime catalog를 filter/rank한 뒤 exact route를 run-local dispatch
receipt에 고정한다. V2 handoff에는 receipt path/digest만 넣고 concrete ID를 복제하지 않으며 receipt의 exact
model/reasoning을 `fork_turns: none` native spawn에 직접 전달한다.

한 attempt 안의 route choice는 immutable이다. Same-route retry는 proven effect-none transient, same-tier
failover는 route/provider health, tier escalation은 verifier-backed capability insufficiency에만 허용한다.
Deterministic implementation failure는 repair한다. Auth/quota/missing tool/authority/budget/unknown mutation은
block/reconcile/stop한다. Cross-provider failover는 explicit versioned data-policy allow가 없으면, tier escalation은
total relative/token budget과 max hops/attempts가 없으면 fail closed다.

Legacy `vulpora.task-dag/v1`, `vulpora.subagent-handoff/v1`, `vulpora.task-result/v1`은 read-only 호환
입력이다. 새 smart-routing artifact를 v1으로 emit하여 기존 의미를 조용히 바꾸지 않는다.
projection의 `clarity_gate.status: skipped`이면 accepted-risk unknown을 숨기지 않고 DAG risk·verification·exclusion으로
전달한다. 숫자 gate skip은 authority나 비우회 blocker를 해결한 것으로 간주하지 않는다.

승인된 spec은 `.vulpora/tasks/<run-id>/clarified-spec.yaml`, 검증된 DAG는 같은 디렉터리의 canonical
JSON(YAML 1.2 valid) `task-dag.yaml`에 저장한다. 두 경로는 target workspace 기준 상대경로여야 한다. 새 run 디렉터리만
사용하고 기존 파일을 덮어쓰지 않는다. 각 파일은 write 후 다시 읽어 SHA-256을 확인하고, 이후 phase는
파일 내용 대신 `path + sha256 + schema/id/status`를 provenance로 전달한다. 내용 변경은 in-place 갱신이나
same-run clarify가 아니라 `supersedes_sha256`을 가진 새 run/revision을 만든다.

같은 run directory의 `execution-ledger.jsonl`은 frozen artifact가 아니라 append-only hash chain이다.
Spec/DAG write→re-read SHA-256이 성공한 뒤 각각 `artifact_frozen` event를 append한다. Consumer는 artifact
bytes의 현재 hash와 ledger event의 source reference를 모두 확인한다. Ledger 자체는 overwrite하지 않으며
terminal report에는 validated head/count/integrity를 별도 `execution_ledger` field로 전달한다.

## 리뷰 훅

- [ ] producer/consumer schema와 spec id가 일치하는가?
- [ ] raw transcript·secret 대신 최소 provenance만 전달하는가?
- [ ] spec과 DAG의 frozen path·SHA-256이 실제 재조회 값과 일치하고 overwrite가 0건인가?
- [ ] consumer가 status·authority·evidence를 재검증하는가?
- [ ] 실패/취소 artifact를 다음 실행 phase의 입력으로 사용하지 않는가?
- [ ] skipped clarity gate의 점수·사유·잔여 위험이 splitter와 최종 보고까지 보존되는가?
- [ ] frozen artifact digest가 ledger의 `artifact_frozen` event와 일치하는가?
- [ ] frozen shared artifact와 run-local concrete route receipt의 신뢰 경계가 분리됐는가?
- [ ] retry/failover/escalation/repair/block/reconcile가 classifier evidence와 budget bound를 지키는가?
