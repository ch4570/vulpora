---
title: Native subagent handoff
source: Vulpora docs/agent-mcp-design-rules.md section 5.1; Codex and Claude Code native agent contracts
last_fetched: 2026-08-18
consumers: [task-orchestrator, start-task]
owner: task-orchestrator
source_type: internal-contract
last_verified: 2026-08-18
verified_by: vulpora-authoring
review_after: 2026-11-18
status: verified
evals: [task-orchestrator.native-subagent-handoff.v1]
revalidate_on: [runtime-capability-change, agent-catalog-change, eval-failure]
---

# Native subagent handoff

## Capability gate

This reference governs native audit attempts. Standard fresh-session delegation is defined separately in
`skills/start-task/reference/kb/independent-sessions.md`; it cannot emit native audit receipts.

Use only the current Codex or Claude Code native agent/subagent surface. Before dispatch, confirm that the host can
create a bounded child, identify or observe it, collect its final result, and interrupt it when cancellation is
requested. Use only capabilities actually exposed in the current session.

If a native child is unavailable, choose `leader-inline` only when the task does not require a missing mandatory
specialist and the original authority, scope, and cost budget still apply. Otherwise return
`AGENT_UNAVAILABLE:<id>`. Never emulate a child with a shell-launched provider CLI or detached process.

Load [routing-state-machine](routing-state-machine.md) before resolving or changing a route.

## Minimal handoff packet v2

Required fields:

- `schema: vulpora.subagent-handoff/v2`, `task_id`, immutable `attempt_id`
- spec id, acceptance criterion ids, and the required spec slice
- verified dependency-output summary
- exact read/write scope and authority
- owner role, portable route-requirements digest, dispatch-receipt path/digest, immutable route-binding digest,
  and trusted catalog/policy provenance; concrete route IDs stay inside the receipt/runtime evidence
- `delegation_depth: 0` and `forbidden_actions: [recursive delegation]`
- acceptance tests, remaining attempt/task budget, stop condition, and `vulpora.task-result/v2` result schema

Do not include the full conversation, global plan, unrelated files, or another task's raw output.

```yaml
schema: vulpora.subagent-handoff/v2
task_id: T-001
attempt_id: T-001-A01
objective: <bounded outcome>
spec_slice: {spec_id: <id>, acceptance_criterion_ids: [AC-001]}
dependency_summary: []
read_scope: [<path>]
write_scope: [<path>]
authority: {tools: [<tool>], forbidden_actions: [recursive delegation]}
route_requirement_sha256: <sha256 of portable DAG requirement>
dispatch_receipt: {path: <run-local relative path>, sha256: <sha256>}
route_binding_sha256: <immutable receipt+attempt binding digest>
acceptance_tests: [{method: <check>, expected: <observable result>}]
budget_remaining: {relative_units: 2, estimated_tokens: 12000, attempts: 2, route_hops: 2}
stop_condition: <bounded stop>
delegation_depth: 0
result_schema: vulpora.task-result/v2
```

The packet intentionally has no provider, model, deployment, endpoint, or catalog-entry field.

```yaml
schema: vulpora.task-result/v2
task_id: T-001
attempt_id: T-001-A01
status: candidate # candidate|failed|cancelled|blocked
mutation_state: known_effect # effect_none|known_effect|unknown
actual_paths: [<path>]
changed_files: [<path>]
evidence: [<artifact-or-command reference>]
failure_class_candidate: null
risks: []
```

The child may propose a failure class, but the primary plus deterministic classifier owns the accepted class and
next action.

## Dispatch, collection, and cancellation

1. Filter then rank the DAG v2 requirements against the trusted current-runtime route catalog. If no candidate
   passes every hard gate, apply the declared safe fallback or block the task.
2. Freeze a dispatch receipt and v2 handoff. The handoff binds the receipt digest without copying its concrete IDs;
   the selected route is immutable for this attempt.
3. Create the child with `fork_turns: none` and explicitly pass the resolved `model` and `reasoning_effort`. Never
   allow an execution task to inherit the primary's model settings.
4. Record the runtime child ID or handle and runtime-observed route/model only in the attempt/run receipt.
5. Observe status only through the native surface. Do not infer a running or completed state from elapsed time.
6. On user cancellation, stop new dispatch and use the native interrupt/cancel operation when available.
7. Collect the v2 structured result and artifact references, not the raw child transcript.
8. Re-read the actual diff/artifact and verify acceptance and mutation-state evidence before marking the task verified.
9. Compare runtime-observed route/model with the immutable dispatch receipt. A mismatch is a routing failure.
10. Classify a failure before transition: effect-none transient permits bounded same-route retry; route/provider
    health permits policy-allowed same-tier failover; verifier-backed capability insufficiency may permit bounded
    tier escalation; deterministic implementation failure permits repair. Auth, quota, missing tools, authority,
    budget, unknown mutation state, and unclassified failure do not permit automatic rerouting.

A child's `complete` claim or successful tool exit is candidate evidence, not proof of workflow completion.

## 리뷰 훅

- [ ] The child was created through the host's native agent/subagent surface.
- [ ] The handoff is task-local and excludes the full transcript.
- [ ] The v2 handoff and dispatch receipt bind one immutable attempt and agree with spawn/runtime evidence.
- [ ] Delegation depth is 0 and recursive delegation is forbidden.
- [ ] Active children do not exceed the runtime-derived effective parallelism.
- [ ] Cancellation uses native interruption when available and never launches a replacement child afterward.
- [ ] The primary owner independently verified structured results against workspace evidence.
- [ ] No model ID, child handle, or capability was invented.
- [ ] Concrete route IDs appear only in dispatch/run evidence, never in the frozen spec or DAG.
- [ ] Cross-provider failover and tier escalation satisfied their explicit fail-closed gates.
