---
title: Smart routing runtime state machine
source: Vulpora routing contract
last_fetched: 2026-08-20
consumers: [task-orchestrator, start-task]
owner: task-orchestrator
source_type: internal-contract
status: verified
evals: [task-orchestrator.routing-failure-policy.v2]
---

# Smart routing runtime state machine

The primary runtime owns the trusted route catalog, route health, provider/data policy, filtering, ranking, and
concrete choice. A splitter or child never supplies or edits that trusted state.

## Resolve and dispatch

At every dispatch boundary, the primary:

1. snapshots the trusted catalog and records its identity/version/digest;
2. filters candidates by required capabilities, tool/runtime availability, risk floor, reasoning-range support,
   authority, data locality/transfer policy, route health, and remaining task/run budget;
3. ranks the survivors by policy-defined relative cost, sufficient capability headroom, health, and a stable
   deterministic tie-breaker from the trusted catalog;
4. selects a concrete route and writes `vulpora.routing-dispatch-receipt/v1` with the task/attempt ID, portable
   requirements digest, policy and catalog provenance, considered-candidate summary, selected provider/route/model
   IDs, reasoning effort, relative cost, data-policy decision, and selection reason;
5. freezes `vulpora.subagent-handoff/v2` with the dispatch-receipt path/digest and immutable attempt binding, then
   passes the receipt's concrete route and reasoning values directly to the native spawn operation; and
6. records runtime-observed native child/model/route evidence separately in the attempt receipt.

Concrete identifiers are permitted only in run-local dispatch/attempt receipts, native spawn arguments, and
runtime-observed evidence. They are forbidden in the v2 handoff, frozen clarified spec, and
`vulpora.task-dag/v2`. The selected route is immutable for one attempt:
catalog or health changes may affect a later attempt but cannot rewrite an already-dispatched attempt. A mismatch
between receipt, handoff, spawn arguments, or runtime-observed route is a routing failure and blocks acceptance.

## Failure classification and next action

Classify from runtime evidence plus mutation evidence before taking another action:

| Evidence class | Allowed action | Forbidden shortcut |
|---|---|---|
| `transient_effect_none` | bounded same-route retry, if mutation evidence proves no effect and retry budget remains | failover or tier increase first |
| `route_health` or `provider_health` | bounded same-tier failover when routing policy permits | capability-tier increase |
| `capability_insufficient` | tier escalation only with independent verifier evidence, remaining total budget, and remaining route-hop bound | child self-claim or timeout as evidence |
| `deterministic_implementation_failure` | bounded repair on the current task/route, followed by deterministic verification | route shopping or tier increase |
| `authentication`, `quota`, `missing_tool`, `authority`, `budget` | block and report the exact prerequisite | retry, failover, or escalation |
| `unknown_mutation_state` | stop dispatch and reconcile actual state; retry only after state becomes known | any blind retry/failover |
| unclassified | stop and report failed/partial with evidence | infer transient or capability shortage |

Materialize the classifier input as `vulpora.routing-attempt-outcome/v1` and run bundled
`skills/start-task/scripts/classify-routing-attempt.js` through the execution command recorder. The validator uses
an exact closed object shape and numeric bounds; invalid/missing/extra fields exit non-zero. A valid input emits one
`vulpora.routing-decision/v1` action. Any disagreement between prose/agent judgment and that output fails closed.

Same-tier failover preserves the capability/risk floor and reasoning range. Crossing providers additionally requires
an explicit allow decision from the task's referenced data policy; missing, stale, unresolvable, or ambiguous policy
fails closed. Tier escalation additionally requires `task_total_relative_units`, `task_total_estimated_tokens`,
`max_route_hops`, `max_total_attempts`, and a positive `tier_escalations` allowance; any missing or exhausted bound
fails closed. Route/provider health is never treated as capability insufficiency.

Every transition appends an immutable attempt/decision receipt with classifier evidence, before/after route tier,
budget charged/remaining, hop and attempt counters, policy references, mutation state, verifier reference when
required, and the allowed terminal/next action. Do not overwrite an earlier receipt or retroactively relabel an
attempt.

## Versioned runtime artifacts

- `vulpora.subagent-handoff/v2`: dispatch-local task packet; includes portable requirement digest plus the
  dispatch-receipt path/digest and immutable attempt binding, but no concrete route IDs.
- `vulpora.task-result/v2`: child report; includes task/attempt ID, actual paths, mutation state, structured
  evidence, failure class candidate, and artifact references. The primary/verifier owns the final classification.
- `vulpora.routing-dispatch-receipt/v1`: runtime selection audit record with concrete IDs.
- `vulpora.routing-attempt-receipt/v1`: runtime outcome and transition audit record with concrete observed IDs.

The v1 handoff/result contracts remain legacy input only. Do not emit new route-aware execution records under v1.
This avoids silently changing the meaning of an already-versioned shared contract.

## Review hooks

- [ ] Candidate filtering precedes ranking and concrete selection uses only trusted runtime catalog state.
- [ ] Route choice is immutable within an attempt and all concrete IDs remain run-local evidence.
- [ ] Same-route retry, same-tier failover, tier escalation, repair, reconciliation, and blocking are distinct.
- [ ] Cross-provider failover and tier escalation enforce their fail-closed gates.
- [ ] Auth, quota, missing tool, authority, budget, and unknown mutation state never trigger blind rerouting.
- [ ] Every retry/hop/repair is within task and run budgets and has an append-only audit receipt.
