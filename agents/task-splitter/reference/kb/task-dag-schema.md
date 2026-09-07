---
title: Task DAG v2 schema
source: Vulpora internal orchestration artifact contract
last_fetched: 2026-08-11
consumers: [task-splitter, task-orchestrator]
---

# Task DAG v2

아래 YAML은 필드 구조를 읽기 쉽게 보여 주는 예시다. 실제 task-splitter handoff와 frozen
`task-dag.yaml` bytes는 같은 의미를 가진 canonical JSON이어야 한다. JSON은 YAML 1.2에도 유효하며,
dependency-free validator가 전체 구조를 안전하게 파싱하도록 한다.

```yaml
schema: vulpora.task-dag/v2
spec_id: <clarified spec id>
plan_id: plan-<stable-slug>
status: ready # ready|rejected|cancelled|failed
parallelism_policy:
  mode: dynamic
  effective_parallelism: min(runtime_available_slots, dependency_ready_tasks, disjoint_write_logical_scopes, higher_policy_limit)
  higher_policy_limit: null # null means unbounded
  fixed_cap: null
clarity_gate:
  status: passed
  score: 100
  threshold: 85
  skip:
    requested: false
    basis: null
    reason: null
    decision_ref: null
    accepted_risk_unknown_ids: []
    non_bypassable_blocker_ids: []
tasks:
  - id: T-001
    title: <bounded result>
    objective: <one outcome>
    depends_on: []
    owner_role: executor
    write_scope: [<exact path or bounded prefix>]
    read_scope: [<bounded scope>]
    acceptance_criterion_ids: [AC-001]
    acceptance_tests: [{method: <command-or-check>, expected: <observable result>}]
    risk: {level: low, reason: <reason>, recovery: <recovery>}
    authority: {tools: [<tool>], external_effects: [], forbidden: [<action>]}
    execution:
      kind: native-subagent # deterministic|native-subagent|leader-inline
      route_requirements:
        capability_profile: frugal # frugal|standard|frontier
        required_capabilities: [repository_read, bounded_code_edit, test_execution]
        complexity_evidence:
          axes: {scope_breadth: 1, reasoning_novelty: 0, dependency_breadth: 0, uncertainty: 0, blast_radius: 0}
          total: 1
          summary: <why this is the lowest sufficient profile>
        risk_floor: {risk_level: low, minimum_profile: frugal, reason: <reversible local change>}
        reasoning: {minimum: low, preferred: low, maximum: medium}
        cost:
          {relative_unit_ceiling_per_attempt: 1, task_total_relative_units: 3,
           estimated_tokens_per_attempt: 6000, task_total_estimated_tokens: 18000}
        policy: {id: vulpora.smart-routing, version: 1}
        data_policy: {reference: local-source-default, version: 1, cross_provider_transfer: deny}
        bounds:
          {same_route_retries: 1, same_tier_failovers: 1, tier_escalations: 0,
           max_route_hops: 2, max_total_attempts: 3}
      delegation_depth: 0
      forbidden_actions: [recursive delegation]
      fallback: leader-inline # leader-inline|blocked|none
      result_schema: vulpora.task-result/v2
    budget:
      {tool_calls: 40, wall_clock_minutes: 20, retries: 1, estimated_tokens: 18000,
       relative_cost_ceiling: 3x, result_chars: 12000}
    outputs: [<exact path from this task write_scope>] # [] for read-only/deterministic tasks
waves:
  - id: W-01
    task_ids: [T-001]
integration_points: [{after: [T-001], owner: task-orchestrator, check: <check>}]
coverage: [{acceptance_criterion_id: AC-001, task_ids: [T-001]}]
risks:
  - unknown_id: U-001
    treatment: verification # assumption|verification|exclusion
    detail: <how the accepted uncertainty remains visible>
    task_ids: [T-001] # required unless treatment is exclusion
provenance: {generated_by: task-splitter, spec_schema: vulpora.clarified-task-spec/v2}
```

불변식은 acyclic graph, 존재하는 dependency id, acceptance coverage 100%, 각 coverage `task_ids`가 해당
criterion을 `acceptance_criterion_ids`에 열거한 task의 정확한 집합인 양방향 일치, 병렬 write-scope overlap 0,
`parallelism_policy.mode: dynamic`, `fixed_cap: null`, runtime/ready/disjoint-scope/higher-policy 네 입력,
DAG clarity-gate status/score/threshold와 전체 skip
provenance(requested/basis/reason/accepted-risk/non-bypassable)가 spec과 일치,
각 accepted-risk unknown id가 위 structured risk entry에 정확히 한 번 나타나고 non-exclusion treatment는
존재하는 task에 연결됨,
입력 projection의 clarity 값을 재평가하거나 바꾸지 않음, 모든 concrete read/write scope가 repository map
또는 실제 read-only 탐색으로 관찰됨,
child authority가 spec authority의 부분집합, capability/risk/reasoning과 cost ceiling의 일치,
deterministic task의 model cost 0, native child의 delegation depth 0인 것이다. 구체 provider/model/deployment,
endpoint, catalog row ID는 frozen spec/DAG에 기록하지 않는다. Primary가 dispatch 직전에 trusted runtime
catalog에서 resolve한 ID는 run-local dispatch/attempt receipt, spawn args, runtime evidence에만 기록한다.
각 `outputs` entry는 같은 task의 `write_scope`에 있는 exact path여야 하며 설명문이나 가상 artifact를
넣지 않는다. `write_scope: []`인 task는 `outputs: []`다.

`vulpora.task-dag/v1`의 `model_profile`과 `model_selection: explicit-native-override`는 legacy contract다.
새 smart-routing plan은 그 의미를 조용히 바꾸지 않고 v2의 `route_requirements`를 사용한다. Cross-provider
failover는 명시적 versioned data-policy allow가 없으면 invalid다. Tier escalation은 verifier-backed
capability insufficiency, positive allowance, total relative/token budget, max route hops가 모두 없으면 invalid다.

## 리뷰 훅

- [ ] schema/status/spec id가 유효한가?
- [ ] task id와 wave membership이 유일한가?
- [ ] coverage에 누락된 AC가 없는가?
- [ ] rejected/cancelled/failed 상태에서 실행 task가 활성화되지 않는가?
- [ ] 각 task에 execution kind, capability profile, required capabilities, complexity evidence, risk floor,
      reasoning range, cost/budget, policy reference/version, retry/failover/escalation bounds, fallback, v2 result schema가 있는가?
- [ ] Native-subagent task에 delegation depth 0과 recursive delegation 금지가 있는가?
- [ ] Frozen DAG가 구체 provider/model/deployment/endpoint/catalog ID를 발명하지 않고 runtime resolver에 맡기는가?
- [ ] Cross-provider failover와 tier escalation의 fail-closed prerequisites가 완전한가?
- [ ] spec의 passed/skipped clarity gate와 score·skip risk를 그대로 보존하는가?
- [ ] repository map이나 read-only 탐색에서 확인하지 않은 경로를 발명하지 않았는가?
