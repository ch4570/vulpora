---
name: test-refactoring
description: Refactor selected Kotlin/JVM tests without weakening their fault-detection evidence. Test and fixture files only.
---

# Test refactoring

## Purpose and v1 boundary

Use this skill only with a validated `vulpora.test-quality-review/v1` report and explicit finding IDs. It improves an
existing Kotlin/JVM JUnit Jupiter or Kotest unit/narrow-integration test without changing the production contract. The
authoritative test rules are [`test-authoring`](../test-authoring/SKILL.md), especially **TST-6** through **TST-20**;
this skill never renumbers or redefines them.

v1 automatic editing supports only Kotlin/JVM with evidence of JUnit Jupiter or Kotest in the affected module. Node,
Python, Go, Rust, .NET, unknown frameworks, and mixed profiles without a clear Kotlin/JVM target are **`AUDIT_ONLY`**:
produce findings and a manual recommendation, but do not edit files. Do not add dependencies or test frameworks.

This is not a production-code refactoring skill. Do not edit production source, build or dependency files, migration,
runtime configuration, CI, coverage thresholds, snapshots/goldens in bulk, shared/live infrastructure, or E2E assets.
Hand off missing behavior to `test-authoring`; hand off browser/live-service work to the repository's E2E workflow.

## Input, scope, and workspace freeze

Before editing:

1. Validate the review report and copy only the user-requested finding IDs into `input.finding_ids`. Bind every selected
   finding to its review-report `finding.path`; a test source write may target only that path. A fixture write additionally
   requires an explicit `{finding_id, path}` entry in `input.finding_owned_fixture_paths[]`. The referenced
   `input.review_report_path` must be an existing regular, non-symlink file relative to the refactoring report, its
   lowercase SHA-256 must exactly match the bytes, and it must pass the sibling `test-quality-review` validator. A
   recommendation is not permission to edit another finding, file, module, or smell.
2. Inspect the relevant build/test configuration and no more than eight nearby tests, as required by **TST-1**. Record
   Kotlin/JVM and JUnit Jupiter/Kotest evidence. If that evidence is absent, stop as `AUDIT_ONLY`.
3. Freeze the target test/fixture paths in `workflow_write_scope[]`, pairing every path with its finding ID. Capture the
   pre-existing user changes as byte hashes, modes, and rename/delete state in `workspace_baseline.user_changes[]`.
4. If any staged, unstaged, or untracked user change overlaps a frozen test/fixture path, do not merge hunks, stash,
   reset, or overwrite it. Return `BLOCKED` with `blocker.code: USER_CHANGE_OVERLAP` and make no edit.
5. Run the selected baseline before the first edit. Record exact command, exit code, non-zero executed count, `EXECUTED`
   cache state, start/mtime timestamps, report file hash/path, and symbols actually present in parsed JUnit testcase
   records from the regular report artifact. A green command, malformed XML, stale XML, zero tests, a failure/error/skip,
   missing selected symbols, or cache-only output is not a baseline.

Only these repository-relative paths may be written:

| Kind | Allowed roots |
| --- | --- |
| Test source | `src/test/**`, `test/**`, `tests/**`, `__tests__/**` |
| Test fixture/resource | `src/test/resources/**`, `src/testFixtures/**`, `test/resources/**`, `tests/fixtures/**`, `__tests__/fixtures/**`, `fixtures/test/**` |
| Report | the requested test-quality report path only |

Paths must be normalized POSIX-relative paths. Never treat `../`, absolute paths, symlink targets, or a merely
test-sounding production directory as allowed. The report validator checks the declared paths, but the executor must
also inspect actual diffs and fail closed on any path outside this list.

## One-finding execution loop

Process one finding/smell at a time. Complete its baseline-to-proof-to-green loop before beginning the next finding;
do not bundle a directory-wide style cleanup.

Allowed examples, when supported by the local Kotlin conventions:

- Replace `assertTrue(true)` or successful execution with an observable public result, durable state, or meaningful
  boundary assertion (**TST-6**, **TST-7**).
- Replace a production-derived expected value with an independently calculated example or explicit contract case.
- Move reflection/private field/private call-order assertions to a public outcome, durable state, or test-owned fake
  observation (**TST-9**, **TST-13**).
- Replace a relaxed/wildcard/incidental mock assertion with a narrow contract-bearing assertion (**TST-14**).
- Replace real sleep, wall clock, random input, or shared mutable fixture use with an existing deterministic utility
  (**TST-10** through **TST-12**).
- Split independently diagnosable behavior into leaf cases (**TST-4**), or reuse an existing test fixture rather than
  adding a one-off production-interface replica.

Keep interaction assertions when the interaction itself is part of the public/durable contract; do not misclassify a
captured HTTP request or side-effect-absence assertion as topology coupling. A strong test is a no-churn control:
leave it unchanged unless its selected finding demonstrates a real defect.

Classify every test-side diff per **TST-19** as exactly one of:

- `new-behavior-proof`
- `intentional-contract-update` (include the request/contract anchor)
- `strength-preserving-maintenance`

`weakening` is never automatically applied. Assertion deletion, matcher widening (`any()`), relaxed mocks, skips,
quarantines, expectation/golden regeneration, coverage threshold reduction, and changes made only to pass current
production are `BLOCKED`, not maintenance. If the observable contract has genuinely changed, stop for the owning
request rather than silently reclassifying it.

## Negative proof and verification

For every resolved finding, state the plausible fault and prove the selected test rejects it before reporting success
(**TST-20**): use an already-configured focused mutation tool, a safe controlled mutation, or observed RED evidence.
Never install a mutation dependency for this work.

For controlled mutation, mutate only a clean, non-user-owned target under explicit authority and a named mutation tool.
Record target, original byte hash, mutation diff/hash, selected-test failure, `finally` restoration, restored byte hash,
and clean post-restore diff. The original and restored hashes must match each other and the restored regular target file.
If the target is shared/dirty or restoration cannot be proven,
record `safety_blocked` and stop; do not try another mutation. A fixture replica is acceptable only when labelled
`replica_only`; never claim that it mutated live production.

Every evidence/report/mutation-target path must stay below the report base through regular, non-symlink ancestors and
its real path; normalization alone is insufficient. User-change entries use lowercase SHA-256 hashes, git file modes,
and explicit states. A renamed user change overlaps when either its destination or `rename_from` matches frozen scope;
it is always `BLOCKED`.

Record `mutation_capability.status` as exactly one of `configured`, `controlled_allowed`, `replica_only`,
`unavailable`, or `safety_blocked`, with tool/target/authority/restoration evidence. Re-run green after restoration,
then execute the applicable fresh ladder: selected case → affected module → narrow boundary/contract → repository
required checks. A missing applicable rung is `NOT_RUN` and prevents `PASS`.

For `negative_proof.status: PASS`, bare `FAIL`/`PASS` labels are insufficient. Include artifact-backed
`failing_before_execution`, `failing_after_execution`, and `restored_green_execution`; both failing artifacts must
parse as failing selected JUnit cases and the restored artifact must parse green.

## Required report and verdict

Write a deterministic JSON report validated by:

```bash
node skills/test-refactoring/scripts/validate-refactoring-report.js path/to/refactoring-report.json
```

The report schema is `vulpora.test-refactoring/v1`. `profile.evidence[]` records Kotlin/JVM framework discovery;
`baseline.completed_before_first_edit` must be `true` for an automatic refactor; and baseline/selected-rung evidence
must list the freshly executed `selected_test_symbols[]`. It must include `input`, `profile`, `workflow_write_scope`,
`workspace_baseline`, `baseline`, `smell_iterations`, `finding_results`, `changes`, `mutation_capability`,
`negative_proof`, `verification_ladder`, `postflight`, and `verdict`.

`PASS` requires: a supported Kotlin/JVM profile; a fresh passing baseline; exactly scoped, one-at-a-time finding work;
no weakening; test/fixture-only writes; a killed plausible fault plus restoration/green evidence; all applicable fresh
verification rungs; and byte/mode/rename/delete-identical user changes after the run. Otherwise use `BLOCKED`,
`INCONCLUSIVE`, `PARTIAL`, or `AUDIT_ONLY` honestly. `USER_CHANGE_OVERLAP` is always `BLOCKED`.

## Completion checklist

- [ ] Input finding IDs, write scope, and changed paths match exactly.
- [ ] Kotlin/JVM support is evidenced, or the result is non-editing `AUDIT_ONLY`.
- [ ] Baseline happened before the first edit and selected cases actually executed freshly.
- [ ] One smell was completed at a time; every diff has a non-weakening TST-19 classification.
- [ ] The plausible fault was rejected; a controlled mutation has exact restoration evidence.
- [ ] User-owned changes are byte/mode/state identical; production/build/dependency/CI changes are zero.
- [ ] Selected, module, boundary, and required applicable rungs have fresh results; omissions are not reported as PASS.
