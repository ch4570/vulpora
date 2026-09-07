---
name: test-quality-refactoring-workflow
description: Freeze a repository test scope, audit test quality, make only authorized Kotlin/JVM test-side improvements, prove fault detection, and reconcile fresh execution evidence without overwriting user changes. Use for a bounded test-quality audit or a safe test refactor; do not use for production fixes, broad cleanup, E2E, or adding test tooling.
---

# Test Quality Refactoring Workflow

This is the single owner for scope freeze, baseline evidence, component routing, negative proof, postflight
preservation, and the final verdict. It coordinates components without redefining their rules. In particular,
`TST-1` through `TST-20` remain normative in the transitive `test-authoring` dependency.

## Exact dependencies

Use exactly these direct component skills:

- `test-quality-review`
- `test-refactoring`
- `agent:test-runner`

`test-authoring` is intentionally transitive through the two quality components. Resolve each selected component once,
record its path and digest, and stop with `MISSING_DEPENDENCY` or `AMBIGUOUS_DEPENDENCY` before any execution if the
inventory is not exact. Do not invoke this workflow recursively or substitute a generic author/editor for a missing
component.

## Input and non-goals

Freeze repository root, `HEAD`, index tree, requested files/modules/test symbols, requested finding IDs (if supplied),
requested mode (`audit-only`, `refactor`, or `missing-behavior`), and requested verification scope. Default to
`audit-only` when no edit authorization is explicit.

Never modify production source, build/dependency files, migrations, application/runtime configuration, CI, coverage
thresholds, or shared/live infrastructure. Do not add dependencies, regenerate snapshots/golden data in bulk, relax
matchers, delete assertions, skip/quarantine tests, lower thresholds, or perform a style sweep. This workflow does
not run browser, E2E, shared-service, user-owned Compose, or broad destructive cleanup; hand a genuinely E2E need to
`e2e-test-workflow` and record it as a handoff.

## 1. Preflight: immutable baseline and write gate

Create `vulpora.test-quality-workspace-baseline/v1` before reading execution output or editing. Record separately:

- `HEAD` and index-tree IDs;
- staged and unstaged patch hashes;
- rename, deletion, file-mode, and submodule changes;
- every untracked path with byte hash and mode; and
- existing test-result/report artifacts with path, byte hash, and mtime.

Do not normalize binary or submodule entries as text. Record them as their native entry type. Freeze
`workflow_write_scope[]` before editing: every entry has one finding ID, one exact relative test/fixture/report path,
and `test`, `fixture`, or `report` kind.

If any staged, unstaged, untracked, renamed, deleted, binary, mode-changed, or submodule user entry overlaps a proposed
test/fixture write path, keep that path read-only, perform only an audit, and return `BLOCKED: USER_CHANGE_OVERLAP`
for the edit route. Do not stash, reset, three-way merge, preserve hunks, or otherwise rewrite the user's change.
Audit-only requests stop after review and must make no repository write.

## 2. Establish a real execution baseline

Apply `agent:test-runner` to select the narrowest repository-native baseline target. Preserve its command, exit code,
collected/executed counts, result summary, traceability chain, and fresh-report evidence. Command success, cache-only
output, zero tests, or a stale report is never a baseline pass.

Before a filtered run, resolve `request -> test symbol -> expected XML glob`, and record the start time. After it runs,
record each fresh XML path, hash, mtime, and testcase/class list. A requested symbol absent from fresh XML is `NOT_RUN`.
If an unexpected testcase/spec appears, retain the selected case's observed result but report the run as
`AFFECTED_MODULE`; never call it selected-only. `agent:test-runner` remains the independent source for fresh execution,
executed count, and exit code.

A selected `PASS` requires non-empty expected test symbols, XML globs, and fresh XML. Bind every requested symbol to a
fresh XML testcase and account exactly for unexpected testcases. The executed count cannot be less than the number of
observed selected testcase bindings.

## 3. Review, classify, and route once

Run `test-quality-review` against the frozen scope and preserve its immutable report unchanged.

- `audit-only`: report findings and manual recommendations, then stop with no edit.
- Missing observable behavior or a coverage gap: hand off only the identified behavior to transitive `test-authoring`.
- Existing-test oracle, determinism, isolation, or refactor-resistance smell: hand off only selected finding IDs to
  `test-refactoring`.

For automatic authoring/refactoring, require a proven Kotlin/JUnit Jupiter/Kotest unit or narrow-integration profile.
Every other framework is `AUDIT_ONLY` unless a supported language-specific profile is installed; do not infer an edit
style. One owner edits one smell/finding at a time; overlapping test/fixture writes are sequential, while disjoint
read-only audits may run in parallel.

For an `AUTHOR` or `REFACTOR` completion, `finding_routes[]` is non-empty and its finding-ID set matches the frozen
`workflow_write_scope[]` exactly. Every route binds its review result ID to `test-quality-review` evidence and its
resolution result ID to the selected `test-authoring` or `test-refactoring` evidence for that same finding. Preserve
each referenced component report by normalized report path and content digest; reject absent evidence rather than
inventing a component result.

Classify every test-side change as `new-behavior-proof`, `intentional-contract-update`, or
`strength-preserving-maintenance`. An unexplained weakening is `BLOCKED`; this includes assertion deletion, expected
value changes derived from production, matcher widening, relaxed mocks, skips, threshold reductions, and generated
fixture/snapshot replacement. Do not churn a strong test merely for consistency.

## 4. Negative proof and exact restoration

Prefer a repository-configured focused mutation tool. Do not install one. Record `mutation_capability` as exactly one
of `configured`, `controlled_allowed`, `replica_only`, `unavailable`, or `safety_blocked`, with tool, target,
authority, and restoration evidence even when the operation was not run.

A controlled mutation is permitted only on a clean, non-overlapping production path. Record its original byte hash
and diff, run the selected test against one plausible fault, restore in a `finally` path, then prove the restored byte
hash and diff are exactly unchanged before further work. Missing restoration proof is immediately `BLOCKED`; do not
attempt another mutation. For shared/dirty production sources, use only an isolated fixture replica when safe or
report `NOT_RUN`; never mutate it in place.

The selected test must reject the same plausible fault before and after a refactor, or the after-state must have
strictly stronger independent proof. Restoration is followed by a green rerun.

## 5. Execute the applicable verification ladder

Run and preserve the applicable ladder in order: selected test, affected module, narrow actual boundary/contract test,
then repository-required checks. Each rung has an explicit `PASS`, `FAIL`, or `NOT_RUN` observation and a reason for
omission. Do not claim a required rung ran because a narrower command passed.

## 6. Post-review, preservation, and verdict

Re-run `test-quality-review` against the frozen contract and reconcile its findings with the original report. A new
same-or-higher-severity finding prevents `PASS`. Compare postflight to the baseline byte-for-byte: every user-owned
entry must retain path, hash, mode, rename/deletion state, and entry type; every workflow-owned path must appear in
the frozen allowlist; and there must be zero workflow-created production/build/dependency/CI paths. No text-diff
approximation is acceptable for a binary or submodule entry.

When the edit route is `COMPLETE`, postflight `workflow_owned_entries[]` is non-empty and corresponds exactly to the
frozen `(finding ID, path)` write scope. Reconcile the original and follow-up review report digest and severity result
for every terminal verdict, not only `PASS`.

Aggregate without promoting evidence using this precedence:

`BLOCKED > INCONCLUSIVE > PARTIAL > PASS`

`PASS` requires all selected findings resolved or justified `NOT_APPLICABLE`, no unexplained weakening, preserved user
diffs, no prohibited workflow change, fresh selected fault-rejection and restoration evidence, all applicable ladder
rungs, and no new same-or-higher-severity post-review finding. Unexecuted, stale, cache-only, zero-test, or missing
restoration evidence is never promoted to `PASS`.

## Report contract

Persist a report with schema `vulpora.test-quality-refactoring-workflow/v1` only when the user asks for persistent
output. It must include frozen scope and component inventory; baseline and postflight user entries; frozen
`workflow_write_scope`; route and edit status; original component evidence; `mutation_capability`; XML freshness and
run scope; verification ladder; cleanup scope; verdict inputs; final verdict/reason codes; and post-review
reconciliation. `component_evidence[]` includes a report path, digest, and finding-result IDs for every direct
component (plus transitive `test-authoring` when authoring resolves a finding); `component_finding_results[]` binds
each route to those IDs. Validate it with:

```bash
node skills/test-quality-refactoring-workflow/scripts/validate-workflow-report.js <report.json>
```

The CLI resolves component inventory, component reports, selected JUnit XML, and post-review reports only relative to
the workflow report's directory. Every referenced artifact must be a present non-symlink regular file whose SHA-256
matches the report. It validates review/refactoring reports with their sibling validators, parses actual JUnit
`testcase` elements rather than trusting declared symbols, and requires the parsed testcase count to equal the selected
execution count.

Return the report path only when it exists. Otherwise hand back the same evidence ephemerally. State exact commands,
executed counts, fresh report paths, omitted checks, mutations/restoration outcome, user-diff preservation result, and
the final verdict. Do not claim completion if any requested proof is `NOT_RUN`, blocked, stale, or out of scope.
