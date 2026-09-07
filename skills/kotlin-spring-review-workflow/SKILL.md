---
name: kotlin-spring-review-workflow
description: >-
  Run Kotlin/Spring, object-oriented design, design-pattern, and behavior-preserving refactoring
  reviews against one frozen code scope, then reconcile them into one evidence-based verdict. Use
  for Kotlin or Spring pull requests, diffs, modules, or code snippets that need a multi-angle
  design and maintainability review without the broader security scope of a full backend audit.
---

# Kotlin Spring Review Workflow

Run all four mandatory skills against one immutable source snapshot and return one consolidated
review. Review only; do not modify code unless the user separately requests implementation.

## Exact dependencies

- `kotlin-spring-review`
- `oop-design-review`
- `design-pattern-apply`
- `refactoring-catalog`

Treat every dependency as mandatory. Never invoke `kotlin-spring-review-workflow` recursively or replace a missing
dependency with a similarly named skill.

## Cost-aware native routing

Resolve portable profiles from the current runtime capability catalog immediately before dispatch.
Use `kotlin-spring-review=standard/medium` and
`oop-design-review|design-pattern-apply|refactoring-catalog=frugal/low` by default. Raise only the
affected pass by one tier when a verifier rejects its evidence or a confirmed transaction,
security, irreversible-data, or public-contract risk exceeds the selected profile.

Every native handoff uses `model_selection: explicit-native-override`; spawn with `fork_turns: none`,
the exact resolved `model`, and exact `reasoning_effort`. Never inherit the primary model or reasoning
setting. Record requested and runtime-reported models separately; mismatch makes the run
`INCOMPLETE`. Timeout, quota, authentication, and missing tools are not capability escalation signals.

## Input contract

Resolve and freeze:

- repository root and exact file, module, diff, commit, or pull-request range
- comparison baseline, or `none` for a snapshot review
- applicable repository instructions and compatibility constraints
- build and test commands that may be run

Record the revision and file list before dispatch. Give every specialist the same scope and source
snapshot. If the revision changes, mark every result `STALE` and return `INCOMPLETE`.

## Workflow

### 1. Preflight

Verify all four skills by exact frontmatter ID. Capture changed symbols, affected callers,
transaction boundaries, persistence mappings, build system, and existing tests. Stop before review
with `MISSING_DEPENDENCY` or `UNSTABLE_SOURCE` when the mandatory suite cannot run consistently.

### 2. Parallel specialist pass

Use one bounded native background child per skill when the host exposes native subagents. Start at
most four concurrently and forbid recursive delegation. If native children are unavailable, run the
same four passes sequentially in the primary context; never silently drop a pass.

Require each result to include `severity`, `confidence`, `path:line`, affected symbol, root cause,
evidence, impact, recommendation, governing principle, and verification.

- `kotlin-spring-review`: Kotlin idioms, nullability, coroutines, Spring DI, transactions, JPA, and
  framework correctness
- `oop-design-review`: responsibility placement, encapsulation, cohesion/coupling, dependency
  direction, and persistence leakage
- `design-pattern-apply`: real change axes, pattern fit, simpler alternatives, and over-design cost
- `refactoring-catalog`: code smells, behavior-preserving transformation sequence, and regression
  protection

Return only structured findings and artifact references to the primary context. Do not merge raw
child transcripts.

### 3. Reconcile

Deduplicate only findings with the same location or symbol **and** the same root cause. Preserve all
contributors and the strongest supported severity. Keep separate findings when one location has
different causes.

Resolve common conflicts explicitly:

- pattern introduction versus KISS/YAGNI
- moving behavior into an entity versus JPA and transaction invariants
- Kotlin concision versus readability or framework proxy constraints
- refactoring cleanliness versus public behavior and compatibility

Prefer the smallest behavior-preserving action supported by evidence. Preserve unresolved dissent,
including each skill's original severity, recommendation, and evidence. Do not invent consensus.

### 4. Verdict

- `INCOMPLETE`: any mandatory pass failed, timed out, was stale, or returned unusable output
- `BLOCK`: at least one supported `CRITICAL` finding
- `CHANGES_REQUIRED`: no CRITICAL finding and at least one supported `HIGH` finding
- `WARNING`: only supported `MEDIUM` or `LOW` findings remain
- `APPROVE`: all four passes completed and no supported finding remains

Never approve a partial run. Treat inferred CRITICAL findings as conditional until the named
verification confirms their factual premise.

## Output contract

Return one report containing:

1. frozen scope, baseline, constraints, assumptions, and commands run
2. four-entry run ledger with exact skill ID, status, and artifact reference
3. aggregate verdict and one-sentence rationale
4. unified findings with stable ID, location, evidence, contributors, and dissent
5. accepted, rejected, and unresolved recommendations with rationale
6. minimal before/after Kotlin examples for supported changes
7. compile, test, transaction, persistence, and regression verification matrix
8. coverage gaps and next actions

Redact credentials and personal data. A specialist's completion claim is candidate evidence; verify
locations and build/test evidence before using it in the verdict.
