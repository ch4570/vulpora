---
name: backend-code-review-workflow
description: >-
  Orchestrate a consolidated backend review across Kotlin/Spring correctness, refactoring,
  design patterns, object-oriented design, and security. Use for pull requests, diffs, or
  backend modules that need one severity-gated report without losing specialist dissent.
---

# Backend Code Review Workflow

Run the mandatory reviewers against one immutable scope, then reconcile their evidence. Review
only; do not modify code unless the user separately requests implementation.

## Exact dependencies

- Skills: `kotlin-spring-review`, `refactoring-catalog`, `design-pattern-apply`,
  `oop-design-review`
- Agent: `security-auditor`

Treat every dependency as mandatory. Do not substitute a similarly named skill or agent.

## Cost-aware native routing

Resolve portable profiles from the current runtime capability catalog at dispatch. Use
`kotlin-spring-review=standard/medium`, `security-auditor=standard/medium`, and
`refactoring-catalog|oop-design-review|design-pattern-apply=frugal/low`. Apply a `frontier/high`
floor only to the affected security pass for a confirmed authn/authz boundary, irreversible data,
or public-contract risk.

The workflow owner and reconciliation default to `standard/medium`; the number of installed rules
or skills is not a reason to require a frontier primary. A smaller route remains safe only when its
scope and evidence packet are bounded as described below. Use `frontier/high` for the affected
judgment, not for every pass or for orchestration as a whole.

Every native handoff uses `model_selection: explicit-native-override`; spawn with `fork_turns: none`,
the exact resolved `model`, and exact `reasoning_effort`. Never inherit the primary model or reasoning
setting. Record requested/observed route fields in the run ledger and make any mismatch `INCOMPLETE`.
Do not escalate for timeout, quota, authentication, or missing tools.

## Input contract

Require or derive:

- `target`: repository root plus explicit files, module, diff, commit range, or pull-request range
- `baseline`: comparison revision when reviewing a diff; otherwise `none`
- `constraints`: applicable repository instructions and user-stated compatibility requirements
- `evidence_budget`: commands that may be run and services that may be contacted

Freeze the resolved file list and revisions before dispatch. Give every reviewer the same target,
baseline, constraints, and source snapshot. Record assumptions; never silently widen the scope.

## Rule applicability and context budget

Before dispatch, produce an `applicability manifest` for every mandatory dependency. Each entry
records changed symbols, activated rule families, excluded rule families with a source-backed
reason, and the evidence files or commands available to that pass. A mandatory pass may return
`NOT_APPLICABLE` only after checking its activation conditions; an evidence-backed
`NOT_APPLICABLE` counts as completed coverage, while a silent skip or guessed exclusion does not.

Build each handoff from two bounded parts:

- a **shared evidence capsule** containing the frozen revision, resolved files, concise diff facts,
  repository constraints, build metadata, and verification budget
- a **lane-specific evidence capsule** containing only that reviewer's activated rule families,
  directly relevant source slices, callers/contracts, and focused tests

Do not copy unrelated skill bodies, entire knowledge-base directories, full repository prose, or
another reviewer's raw transcript into a handoff. Reviewers may retrieve a named reference when a
finding needs it. Context overflow, malformed output, timeout, or a long rule inventory is a scope
or packet failure, not evidence that a more expensive model is required.

## Workflow

### 1. Preflight

1. Resolve the target and repository instructions.
2. Verify that all four skills and `security-auditor` are available by exact ID.
3. Capture the file list, changed symbols, build system, and existing tests.
4. Build and record the applicability manifest plus shared and lane-specific evidence capsules.
5. Stop as `INCOMPLETE` with cause `MISSING_DEPENDENCY` or `UNSTABLE_SOURCE` before review if a
   dependency is missing or the source snapshot cannot be read consistently.

### 2. Specialist review

Dispatch independent reviews with bounded parallelism of at most four concurrent runs. Run the
remaining dependency as soon as a slot opens. Each run must return:

`severity`, `confidence`, `path:line`, affected symbol, root cause, concrete evidence, impact,
recommendation, verification, and governing principle.

Ask each dependency to stay in its specialty. Preserve its original output unchanged for audit.
The security run must come from the exact `security-auditor` agent, not an orchestrator-authored
security summary.

### 3. Normalize and reconcile

1. Reject unsupported findings or mark them `NEEDS_EVIDENCE`; do not invent missing locations.
2. Deduplicate only when findings identify the same path or symbol **and** the same root cause.
   Similar wording, shared symptoms, or the same file alone are insufficient.
3. Merge a duplicate into one finding with all contributing reviewers and evidence. Use the
   highest supported severity. A downgrade requires explicit contrary evidence.
4. Separate security, correctness, architecture/design, and maintainability impacts when one
   proposed change would address several distinct root causes.
5. Preserve disagreements under `Dissent`: identify the reviewer, its original severity or
   recommendation, the competing evidence, and whether the disagreement is resolved. Never force
   artificial consensus.
6. Detect recommendation conflicts, especially pattern introduction versus YAGNI, domain
   encapsulation versus persistence behavior, and refactoring versus transaction semantics.
   Prefer the smallest behavior-preserving action supported by evidence; retain unresolved choices.

### 4. Apply the severity gate

Use these terminal verdicts in priority order:

- `INCOMPLETE`: any mandatory run failed, timed out, or returned unusable output
- `BLOCK`: at least one supported `CRITICAL` finding
- `CHANGES_REQUIRED`: no CRITICAL finding and at least one supported `HIGH` finding
- `WARNING`: only supported `MEDIUM` or `LOW` findings remain
- `APPROVE`: every mandatory run completed and no supported finding remains

Never emit `APPROVE` for a partial run. Mark inferred CRITICAL claims as conditional and request
their named verification; they do not become unconditional blockers without evidence.

## Output contract

Return one report with:

1. **Scope and evidence** — target, baseline, constraints, commands run, assumptions
2. **Applicability manifest** — activated/excluded rule families and evidence-backed
   `NOT_APPLICABLE` decisions
3. **Run ledger** — exact dependency ID, status, duration if known, and artifact reference
4. **Verdict** — gate result and one-sentence rationale
5. **Unified findings** — stable ID, severity, confidence, location, root cause, impact, evidence,
   recommendation, verification, contributors, and dissent
6. **Conflict decisions** — accepted, rejected, and unresolved recommendations with rationale
7. **Security auditor artifact** — immutable artifact reference and digest plus its structured
   findings; reproduce the complete redacted output only when the user requests it or no artifact
   store is available
8. **Coverage gaps and next actions**

Keep credentials and secrets redacted in both the artifact and any inline fallback; preserve the
auditor's redaction marker rather than reconstructing the value.

## Failure and partial-result semantics

- A specialist failure does not erase successful artifacts. Return them with `INCOMPLETE` and name
  the missing coverage.
- A source change during execution invalidates reconciliation. Return `STALE` artifacts under an
  `INCOMPLETE` verdict and request a run against one revision.
- A verification command failure is evidence, not permission to drop a finding. Record the command
  and output, then lower confidence only when appropriate.
- A malformed result may be retried once with the output contract restated. Do not silently replace
  the specialist's judgment with the orchestrator's.
