---
title: Native subagent execution routing
source: Vulpora docs/agent-mcp-design-rules.md section 5.1; Codex and Claude Code native agent contracts
last_fetched: 2026-08-25
consumers: [task-splitter, task-orchestrator, start-task]
owner: task-splitter
source_type: internal-contract
last_verified: 2026-08-25
verified_by: vulpora-authoring
review_after: 2026-11-25
status: verified
evals: [task-splitter.model-routing.v1, task-splitter.smart-routing.v2, task-orchestrator.native-subagent-handoff.v1]
revalidate_on: [runtime-capability-change, agent-catalog-change, eval-failure]
---

# Native subagent execution routing

Task routing separates execution kind, portable route requirements, and the concrete runtime choice. The splitter
records only what the approved task proves. It never invents a provider, model/deployment ID, endpoint, installed
agent, catalog entry, health state, or runtime capability. Load [smart-routing-policy](smart-routing-policy.md) for
the normative v2 requirement and fail-closed budget/data-policy rules.

## Choose the execution kind first

| kind | Suitable work | Model use |
|---|---|---|
| `deterministic` | lint, compile, test, formatter, or schema checks with a fixed command and expected result | none |
| `native-subagent` | bounded exploration, judgment, code/document changes, diagnosis, or review | runtime native child |
| `leader-inline` | small task when a native child is unavailable or coordination would cost more than the work | current primary context |

Do not wrap deterministic verification in an LLM task. Do not reduce architecture or security judgment to string
matching. `leader-inline` is a declared fallback, not permission to widen scope or bypass an unavailable mandatory
specialist.

## Choose the owner role before the profile

Select the role from the task's observable outcome and evidence, not from the cheapest available model or a generic
`worker` label. Then score that task's complexity and risk independently. Do not copy one role/profile pair across
the whole DAG merely because the tasks belong to the same feature.

| outcome shape | default owner role | ordinary profile | profile floor or adjustment |
|---|---|---|---|
| bounded repository discovery, symbol/path map | `explore` | `frugal` | raise only when cross-boundary inference is itself the deliverable |
| style/naming/docs-only bounded change | `style-reviewer` or `writer` | `frugal` | `standard` for multi-surface contract documentation |
| normal feature/refactor implementation | `executor` | `standard` | `frugal` only for a truly mechanical one-module edit with deterministic acceptance |
| regression/acceptance test design | `test-engineer` | `standard` | `frontier` for safety-critical or cross-system test strategy |
| defect isolation and repair hypothesis | `debugger` | `standard` | `frontier` for novel cross-boundary failures with high blast radius |
| architecture, public contract, security/authority, irreversible data | `architect`, `critic`, or `security-reviewer` | `frontier` | mandatory floor |
| acceptance and completion audit | `verifier` | `standard` | deterministic when commands fully decide; `frontier` for high-risk semantic judgment |

The table is calibration, not an automatic lookup. Record task-local evidence for any deviation. A plan that assigns
the same profile to every heterogeneous task without separate evidence is invalid routing.

## Capability profile

Profiles express the lowest sufficient reasoning need and relative cost ceiling, not a product model name.

| profile | Reasoning hint | Signals | Relative cost ceiling |
|---|---|---|---|
| `frugal` | low | one bounded module, familiar pattern, clear acceptance, low blast radius | 1x |
| `standard` | medium | several files, ordinary design/debugging, moderate uncertainty or coordination | 10x |
| `frontier` | high | cross-boundary architecture, security/authority, irreversible data, public contracts | 30x |

Score `scope_breadth`, `reasoning_novelty`, `dependency_breadth`, `uncertainty`, and `blast_radius` from 0–2.
Totals 0–3 map to `frugal`, 4–6 to `standard`, and 7–10 to `frontier`. Security or authority boundaries,
irreversible migration, and public compatibility decisions have a `frontier` floor.

After numeric scoring, compare the result with the owner-role calibration. Use the stronger floor when they differ,
and explain the difference in `complexity_evidence.summary` or `risk_floor.reason`. Cost alone never lowers a role's
required capability; role naming alone never upgrades an otherwise bounded task.

The profile alone is insufficient in v2. Also record semantic `required_capabilities`, five-axis
`complexity_evidence`, `risk_floor`, bounded reasoning range, relative per-attempt and task-total cost/token
constraints, routing policy id/version, data-policy reference/version, and retry/failover/escalation/hop/attempt
bounds. None may contain a concrete provider or model ID.

## Runtime-native selection

- Do not freeze `runtime: codex|claude-code`, provider names, or model aliases into a route-aware DAG. The primary
  records the observed runtime only in run evidence.
- `model_selection: explicit-native-override` is the legacy v1 spelling. A v2 DAG uses portable
  `route_requirements`; the primary resolves a concrete route from its trusted current-runtime catalog immediately
  before dispatch and freezes that choice in a run-local dispatch receipt and `subagent-handoff/v2`.
- The resolved route is mandatory spawn input: `fork_turns: none`, exact `model`, and exact `reasoning_effort`.
  For execution children, parent-model inheritance is forbidden. Never omit the override and assume that a
  `frugal|standard` profile will become cheaper by itself.
- Mandatory workflow agents with an immutable runtime configuration (`requirement-dialogue`, `task-splitter`) use
  `model_selection: fixed-agent-config`. Their configured model is captured in the runtime configuration identity;
  they are not execution-profile tasks.
- If the host reports the actual child route/model, record it in runtime evidence and compare it with the dispatch
  receipt. If it does not, record `runtime_reported_model: unavailable` without treating that as proof of a match.
- Do not copy a model ID or alias between Codex and Claude Code.
- If the current host exposes no selectable model matching the profile, keep the task blocked or use an approved
  `leader-inline` fallback. Never silently inherit the expensive primary, upgrade cost, or substitute a missing
  mandatory agent.

### Profile resolution contract

| profile | required host capability | default reasoning | inheritance |
|---|---|---|---|
| `frugal` | lowest-cost model that satisfies the task's tools and language needs | `low` | forbidden |
| `standard` | balanced general coding model with the required tools | `medium` | forbidden |
| `frontier` | strongest currently exposed coding/reasoning model | `high`; `xhigh` only for score 9–10 or an explicit critical-risk reason | forbidden |

Model family names are examples owned by the runtime, not this cross-runtime contract. Filter candidates before
ranking them: required capability/tool support, risk floor, reasoning range, authority, data policy, health, and
remaining task/run budget are hard gates. Rank only survivors using the referenced policy. Persist the exact
selection in `vulpora.routing-dispatch-receipt/v1`, bind it to one immutable attempt, and pass the same values in
the v2 handoff/native spawn. A route is invalid when receipt, handoff, spawn arguments, and runtime evidence
contradict one another.

## Native child contract

Every new `native-subagent` task uses `vulpora.subagent-handoff/v2` and includes only the task ID/attempt ID,
portable requirements digest, required spec slice, verified dependency summary, read/write scope, authority,
acceptance tests, budget, stop condition, dispatch receipt reference/digest, immutable attempt binding, and
`vulpora.task-result/v2` output contract. It excludes the full conversation, unrelated task output, and concrete
route IDs. Exact IDs remain only in the dispatch/attempt receipts, spawn arguments, and runtime evidence.

The primary orchestrator owns child creation, status observation, interruption, result collection, integration,
and verification through the host runtime's native surface. Every execution child has `delegation_depth: 0` and
`forbidden_actions: [recursive delegation]`. Native child count is capped by
`min(runtime_available_slots, dependency_ready_tasks, disjoint_write_logical_scopes, higher_policy_limit)`.

Never emulate a native child with `nohup`, shell `&`, tmux, or direct `codex`/`claude` CLI invocation.

## Retry, failover, escalation, and fallback

- A transient failure with independently proven `effect_none` may use a bounded same-route retry.
- Route/provider health may use a bounded same-tier failover. Cross-provider failover requires an explicit allow
  from the task's referenced versioned data policy; missing policy fails closed.
- Capability-tier escalation requires verifier-backed capability insufficiency plus remaining total cost/token
  budget and route-hop/attempt allowance. A timeout or child self-claim is insufficient evidence.
- A deterministic implementation failure uses bounded repair and deterministic re-verification, not route shopping.
- Authentication, quota, missing tools, authority, budget exhaustion, and unclassified failures block. Unknown
  mutation state stops dispatch for reconciliation. None triggers automatic retry, failover, or tier escalation.
- A failed native child may be retried only when the selected transition permits it and mutation state is known.
- If native child execution is unavailable, use `leader-inline` only when the task does not require a missing
  mandatory specialist and the original authority/cost budget still holds; otherwise report the blocker.
- Final verification runs deterministic checks first and uses a judgment agent only when the acceptance contract
  requires semantic review.

## 리뷰 훅

- [ ] Deterministic tasks allocate no model cost.
- [ ] Owner role was selected from the outcome before model profile, with task-local evidence for deviations.
- [ ] Heterogeneous tasks were calibrated independently instead of receiving a copied global profile.
- [ ] Each LLM task records the five-axis evidence, required capabilities, risk/reasoning floor, policy, and bounded budget.
- [ ] No concrete provider/model/deployment ID or agent availability appears in frozen shared task artifacts.
- [ ] Every execution-child native spawn explicitly passes the handoff's model and reasoning effort with
      `fork_turns: none`; inherited primary settings are rejected.
- [ ] Every child uses the native runtime surface and a task-local handoff.
- [ ] Every execution child has delegation depth 0 and cannot create another child.
- [ ] Active native children never exceed the dispatch-time effective parallelism.
- [ ] Retry/failover/escalation/repair/block/reconcile transitions preserve authority and their distinct evidence gates.
