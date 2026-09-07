---
title: Orchestration lifecycle과 report v3
source: Vulpora internal lifecycle and assurance contract
last_fetched: 2026-08-25
consumers: [task-orchestrator]
---

# Orchestration lifecycle과 report v3

`start-task`에서 허용 phase는 `clarify -> approve -> split -> execute -> integrate -> verify -> terminal`이다. terminal status는
`complete|partial|failed|cancelled|escalated`다. 취소 후에는 새 dispatch나 mutation을 시작하지 않는다.

공유 workflow의 최종 JSON은 `skills/start-task/reference/kb/orchestration-report.schema.json`을 source of
truth로 사용한다. 현재 run/runtime instance provenance, runtime-native entrypoint, exact native child identity,
primary-inline ownership, 실제 argv/exit/timeout, cleanup과 terminal status가 독립 evidence와 일치해야 한다.

아래는 routing 관련 필드만 보인 축약 예시다. 전체 required field와 exact shape는 JSON schema를 따른다.

```yaml
schema_version: vulpora.orchestration-report/v3
task_dag: {schema: vulpora.task-dag/v2, id: <id>, status: ready, path: <path>, sha256: <digest>, immutable: true}
task_results:
  - schema: vulpora.task-result/v2
    task_id: T-001
    attempt_id: T-001-A01
    status: verified
    owner: executor
    mutation_state: known_effect
    actual_paths: [<path>]
    changed_files: [<path>]
    evidence: [<test-or-inspection summary>]
    failure_class_candidate: null
    risks: []
routing_attempts:
  - task_id: T-001
    attempt_id: T-001-A01
    dispatch_receipt: {path: <run-local path>, sha256: <digest>, immutable: true}
    attempt_receipt: {path: <run-local path>, sha256: <digest>, immutable: true}
    mutation_state: known_effect
    failure_class: null
    action: success
    budget_debit: {relative_units: 1, estimated_tokens: 6000}
    budget_remaining: {relative_units: 2, estimated_tokens: 12000, attempts: 2, route_hops: 2}
    runtime_reported_model: <runtime model id or unavailable>
```

`complete`는 frozen expected task/result inventory와 AC/fresh-evidence inventory가 exact-match하고 known
in-scope error와 unresolved conflict가 0일 때만 허용한다. 이 판정은
[result-aggregation](result-aggregation.md)의 completion matrix에서 파생한다. `partial`은 검증된
독립 가치가 있을 때만 쓰며 원자적 기능의 절반을 성공으로 표현하지 않는다.
`partial`은 exact completed/pending task set, remaining AC, resume frontier, runtime configuration,
frozen spec/DAG hash, HEAD/diff fingerprint를 보존하는 questionless checkpoint다. 현재 run은 terminal에서
끝난다. 이후 재호출은 successor run에서 이 값을 현재 상태와 재검증하고, verified task/AC evidence만
가져오며 가장 이른 pending verification부터 시작한다. terminal ledger에 phase back-edge를 추가하지 않는다.

최종 orchestration report 자체는 run receipt이므로 exact requested/runtime-reported ID를 포함할 수 있다.
그 값은 frozen spec/DAG에서 복사하지 않고 `routing-dispatch-receipt/v1`과
`routing-attempt-receipt/v1`에서 집계하며 receipt path/digest, attempt counter, transition class를 task
evidence/retry summary에 보존한다. 같은 attempt의 선택을 새 ID로 고쳐 쓰지 않는다.

## 리뷰 훅

- [ ] terminal status가 실제 task/verification 상태와 일치하는가?
- [ ] cancelled 뒤 새 tool/dispatch가 없는가?
- [ ] partial의 검증된 가치와 남은 작업이 분리됐는가?
- [ ] partial의 continuation이 `ready_to_resume`이고 `question: null`인가?
- [ ] partial resume frontier와 workspace/frozen artifact provenance를 재검증했는가?
- [ ] raw transcript·secret·불필요한 개인 경로가 보고서에 없는가?
- [ ] task/attempt별 dispatch·attempt receipt, failure/action, budget, runtime-reported model과 child id가 기록됐는가?
- [ ] 모든 expected task/AC와 terminal result/fresh evidence inventory가 exact-match하는가?
- [ ] execution child의 실제 spawn 인자가 immutable dispatch receipt와 일치하는가?
