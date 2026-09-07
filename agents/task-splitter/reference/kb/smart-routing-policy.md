---
title: Provider-neutral smart routing requirements
source: Vulpora routing contract
last_fetched: 2026-08-25
consumers: [task-splitter, task-orchestrator, start-task]
owner: task-splitter
source_type: internal-contract
status: verified
evals: [task-splitter.smart-routing.v2, task-orchestrator.routing-failure-policy.v2]
---

# Provider-neutral smart routing requirements

The frozen plan describes what an execution lane needs. It never chooses a provider, model, deployment, endpoint,
or catalog entry. Concrete identifiers belong only to dispatch/run receipts created from trusted runtime state.

## Portable route requirement

Every `native-subagent` task in `vulpora.task-dag/v2` has one `route_requirements` object:

```yaml
route_requirements:
  capability_profile: frugal # frugal|standard|frontier
  required_capabilities: [repository_read, bounded_code_edit, test_execution]
  complexity_evidence:
    axes: {scope_breadth: 1, reasoning_novelty: 0, dependency_breadth: 0, uncertainty: 0, blast_radius: 0}
    total: 1
    summary: bounded familiar change with deterministic acceptance
  risk_floor: {risk_level: low, minimum_profile: frugal, reason: reversible local change}
  reasoning: {minimum: low, preferred: low, maximum: medium}
  cost:
    relative_unit_ceiling_per_attempt: 1
    task_total_relative_units: 3
    estimated_tokens_per_attempt: 6000
    task_total_estimated_tokens: 18000
  policy: {id: vulpora.smart-routing, version: 1}
  data_policy:
    reference: local-source-default
    version: 1
    cross_provider_transfer: deny
  bounds:
    same_route_retries: 1
    same_tier_failovers: 1
    tier_escalations: 0
    max_route_hops: 2
    max_total_attempts: 3
```

`required_capabilities` uses semantic capability names, not product features inferred from a model name. The
complexity axes are evidence, not a command to choose the newest or most expensive route. `risk_floor` may raise
the minimum profile but never lowers a security, authority, irreversible-data, or public-contract floor.
Reasoning is a bounded range so a runtime can use its own native effort vocabulary without importing a provider
alias into the plan.

The task budget must cover every permitted retry, failover, and escalation. `tier_escalations > 0` is invalid when
`task_total_relative_units`, `task_total_estimated_tokens`, or `max_route_hops` is absent. Cross-provider failover
is invalid unless the referenced, versioned data policy explicitly permits transfer for the task's data classes.
Missing or unknown policy means deny. A fixed global child cap is not part of routing; scheduling remains dynamic.

## Splitter decisions

1. Choose `deterministic`, `native-subagent`, or `leader-inline` before route requirements.
2. Select the owner role from the observable outcome, then record the lowest sufficient profile using task-local
   role calibration and observed complexity/risk evidence.
3. Record only portable capabilities, reasoning range, relative cost/budget, policy references, and attempt bounds.
4. Do not record provider names, concrete model/deployment IDs, endpoints, native child handles, catalog row IDs,
   or a guessed availability/health state anywhere in the frozen spec or DAG.
5. Do not authorize tier escalation merely because an attempt failed. Capability insufficiency requires independent
   verifier evidence and must remain inside total budget and hop bounds.

## Review hooks

- [ ] Frozen shared artifacts contain no concrete provider/model/deployment/endpoint/catalog identifiers.
- [ ] Required capabilities and complexity evidence are task-specific and independently reviewable.
- [ ] Role selection precedes profile selection, and heterogeneous tasks do not share a copied profile without evidence.
- [ ] Risk floor and reasoning range agree with the approved authority and acceptance contract.
- [ ] Retry, failover, escalation, hop, attempt, relative-cost, and token bounds are internally feasible.
- [ ] Cross-provider transfer and tier escalation fail closed when their required policy/budget data is absent.
- [ ] Parallelism is still derived from runtime capacity and independent scopes, with no fixed child cap.
