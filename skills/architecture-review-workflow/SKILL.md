---
name: architecture-review-workflow
description: >-
  Review MSA, modular-monolith, and multi-module boundaries by combining system architecture,
  application architecture, DDD, and code-topology evidence. Use for service decomposition,
  module extraction, dependency-direction, data ownership, integration contracts, or architecture
  changes that need boundary-by-boundary findings.
---

# Architecture Review Workflow

Assess boundaries from deployed system to application module to domain model. Review only; do not
perform a restructuring unless the user separately requests implementation.

## Exact dependencies

Mandatory agents:

- `architecture-reviewer`
- `application-architect`
- `domain-driven-design-reviewer`

Conditional topology agent:

- `code-cartographer`

Do not replace an unavailable mandatory agent with generic reasoning.

## Cost-aware native routing

Resolve portable profiles from the current runtime capability catalog immediately before dispatch.
Use `code-cartographer=frugal/low` and the three mandatory architecture passes=`standard/medium` by
default. Raise only the affected pass to `frontier/high` for a confirmed security/authority boundary,
irreversible data ownership, or public-contract decision.

Every native handoff uses `model_selection: explicit-native-override`; spawn with `fork_turns: none`,
the exact resolved `model`, and exact `reasoning_effort`. Never inherit the primary model or reasoning
setting. Record requested and runtime-reported models separately, and fail the pass on mismatch.
Timeout, quota, authentication, or missing tools do not justify a larger model.

## Input contract

Accept a repository, diff, architecture proposal, or selected services/modules plus deployment
topology, module build graph, public APIs/events, persistence ownership, team ownership, runtime
constraints, and target style when available. Derive only what the repository proves. Record the
immutable revision and distinguish current state from proposed state.

## Workflow

### 1. Classify the architecture

Classify from evidence, not labels:

- **MSA:** independently deployable services with explicit remote contracts and operational
  ownership
- **Modular monolith:** one deployable with enforced in-process module boundaries
- **Multi-module:** build/source partitioning whose architectural strength depends on dependency
  and visibility enforcement
- **Hybrid/unclear:** mixed deployment or insufficient evidence

Do not call a directory a bounded context, a Gradle module an architecture boundary, or an HTTP
hop a microservice boundary without ownership and coupling evidence.

### 2. Map topology when needed

Invoke `code-cartographer` before specialist review when any of these hold: three or more relevant
modules/services, undocumented topology, cross-module diff, suspected cycle, unclear entry points,
or disagreement between declared and actual dependencies. Request a factual map only:

- deployables, modules, packages, entry points, public contracts, data stores
- build/runtime dependencies and cycles
- synchronous calls, messages, shared libraries, and shared persistence
- source locations supporting every edge

Skip it only for a small, already-proven topology; record `NOT_NEEDED` and the evidence. Failure
when mapping is required makes the workflow `INCOMPLETE`.

### 3. Parallel architecture passes

Give the same frozen scope and topology map to the three mandatory agents. Run them concurrently
with a maximum of three active runs.

- `architecture-reviewer`: system qualities, deployability, coupling, resilience, observability,
  data consistency, integration and failure modes
- `application-architect`: use-case boundaries, dependency direction, ports/adapters, transaction
  ownership, public module APIs, framework leakage, test seams
- `domain-driven-design-reviewer`: bounded contexts, ubiquitous language, aggregates, context-map
  relationships, Anti-Corruption Layers, domain invariants, and boundary semantics

Require severity, confidence, source locations/edges, affected qualities, evidence,
recommendation, migration impact, and verification.

### 4. Build the boundary matrix

Create one row per module/service containing:

`boundary`, `business capability/context`, `owner`, `deployable`, `public contract`, `owned data`,
`allowed dependencies`, `observed dependencies`, `forbidden leaks`, `transaction boundary`,
`failure isolation`, and `boundary tests`.

Flag cycles, shared mutable data, cross-boundary ORM entities, backdoor package access, duplicated
domain authority, chatty remote calls, unstable shared libraries, unclear transaction ownership,
and public contracts that expose internal persistence models. For MSA, assess network failure,
versioning, idempotency, consistency, and observability. For a modular monolith/multi-module system,
assess compile-time visibility, dependency direction, module API enforcement, events, and tests
that prevent boundary erosion.

### 5. Reconcile and gate

Deduplicate only identical boundary/edge plus root cause. Preserve disagreements between system
operability, application layering, and domain semantics. Reject recommendations that merely add
layers without reducing coupling or protecting an invariant. Prefer reversible enforcement before
service extraction when independent deployment has no demonstrated value.

Use:

- `INCOMPLETE`: mandatory evidence or agent output is missing/unusable
- `BLOCK`: supported CRITICAL risk such as data ownership ambiguity causing corruption, a security
  boundary breach, or an unsafe irreversible split
- `CHANGES_REQUIRED`: no CRITICAL finding and at least one supported HIGH boundary violation
- `WARNING`: only MEDIUM/LOW findings
- `APPROVE`: every mandatory pass completed and no supported finding remains

## Output contract

Return:

1. scope, revision, current/target architecture classification, assumptions
2. dependency run ledger and topology-map status
3. aggregate verdict
4. system context and dependency graph in compact text or Mermaid when useful
5. complete boundary matrix
6. unified findings with locations/edges, contributors, evidence, dissent, and affected qualities
7. prioritized boundary actions: enforcement now, refactor next, extraction only if justified
8. contract, architecture-rule, module, integration, and failure-mode verification plan
9. coverage gaps and unresolved decisions

## Failure and partial-result semantics

- A mandatory-agent failure yields `INCOMPLETE`; retain successful independent analysis but never
  present it as consensus.
- If required topology mapping fails, do not infer missing edges. Report known facts and the map gap.
- If current and proposed states are mixed or the revision changes, mark affected claims `STALE` or
  `AMBIGUOUS` and do not issue `APPROVE`.
- Conflicting recommendations remain explicit until evidence resolves them; the orchestrator may
  choose a conditional path but must not erase dissent.
