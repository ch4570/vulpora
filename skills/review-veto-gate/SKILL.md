---
name: review-veto-gate
description: Post-review gate that turns review findings into reproduction tasks and consensus-veto signals, never changing a verdict.
---

# Review Veto Gate

A post-processing step that runs **after** a review workflow has reconciled its passes. It is not a review pass and
adds no mandatory lane. In this version it only observes and signals: it never changes, raises, or lowers a review
verdict, and the `veto` mode does not exist yet.

## Why it exists

Several reviewers agreeing is not independent evidence: lanes of one model family share blind spots, and a finding
that is only an opinion stays an opinion. What does add information is a different source: a reproduced failure,
a refuter that sees only the diff and the claim, or a named contract. This skill records which claims have that
and surfaces the rest as signals. Read [principles](reference/principles.md) for the reasoning and the
[KB index](reference/kb/INDEX.md) to pick a topic; do not load the whole KB.

## When to use

- A review workflow (`java-spring-review-workflow`, `kotlin-spring-review-workflow`, `backend-code-review-workflow`,
  `architecture-review-workflow`, `security-scan-workflow`) finished and its owner can list lanes and findings.
- You need to know which `[inferred]` concurrency, transaction, authorization, destructive-data, money, or
  public-API claims should become reproduction tasks, or whether a defect would meet the consensus-veto conditions.

Do not use it to approve a change ("no finding" is not safety), to re-run a review, to run tests, or to open a
connection to any shared resource.

## Procedure

1. **Collect.** The workflow owner writes `vulpora.review-workflow-result/v1` from the child outputs: lanes (`id`,
   `name`, evidence bundle hash, `fork_turns`, model), findings (`location`, `cause_key`, `severity`, `confidence`,
   `contract_source`, `repro_attempt`), and refuter results. Pass the unified diff when there is one.
2. **Record.** `node scripts/record-review-ledger.js --workflow-result <file> --diff <patch> --out <ledger.json>` validates
   and normalizes it. Changed-line counts and risk categories come from the diff by rule, not from a reviewer.
3. **Select reproduction tasks.** `node scripts/select-repro-tasks.js --ledger <ledger.json>` lists tasks (default cap
   3 per change; the overflow is reported as `NOT_RUN: budget-cap`). It starts nothing.
4. **Evaluate.** `node scripts/evaluate-consensus-veto.js --ledger <ledger.json> --mode shadow|signal
   [--calibration <status.json>]`. `shadow` writes the ledger entry only. `signal` adds the Markdown bundle for the end of
   the report. The exit code never depends on the review verdict.
5. **Report.** Append the bundle as five groups: reproduced defects, consensus-veto candidates (shadow), refuted,
   not reproduced, signals. State that the verdict above is unchanged and show the calibration state per risk tier
   (`unmeasured` until a calibration run exists).

## Rules that keep it honest

- Agreement among lanes is counted only for distinct defect-judging lanes; a repeated run or second persona of one lane
  is one vote, and style lanes (`oop-design-review`, `design-pattern-apply`, `refactoring-catalog`) are not counted.
- Reviewers' PR descriptions and the author's explanations are not inputs to a refuter or a reproduction task.
- A lane that returned `ROUTE_UNAVAILABLE` adds nothing to any count; a person reviews that area.
- A claim needs a named contract source (spec, acceptance criterion, public contract, security rule); "best practice"
  does not qualify.
- A reproduction run is execution evidence only with the isolation record of the `e2e-runner` endpoint isolation gate
  (`isolation_verified: true`). This skill never starts an application or touches a shared database, cache, or store.
- If a script is unavailable or the ledger is malformed, say the gate did not run; do not substitute your own judgment
  for its output.

## Output

The Markdown bundle from `--mode signal`, the ledger path, and the calibration states. Redact credentials and personal data.

## Verify

- `node --test tests/review-gate.test.js` and `bash tests/contract.test.sh`.
- The output carries `verdictImpact: "none"`, and `--mode veto` exits 64.
