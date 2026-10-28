---
name: e2e-evidence-report
description: Plan E2E test cases, run them through e2e-test-workflow with video and screenshots recorded for every browser case, verify each case's resulting data with read-only queries against the run-owned database, and publish one HTML evidence report in a temporary directory. Use when the user wants E2E results proven with recordings, captures, and DB evidence rather than a pass count; do not use for a plain run-only or render-only request.
---

# E2E evidence report

Turn an E2E request into a report a reviewer can trust without rerunning it: each test case (TC) shows its
steps, the screen recording or captures, the API exchanges, and the database rows that prove the outcome.
Execution, environment ownership, cleanup and verdict rules stay with `e2e-test-workflow` and its components;
this skill adds the TC plan, the evidence capture, the DB verification and the report.

> **Reference loading:** read [principles](reference/principles.md) first. Read [evidence schema](reference/evidence-schema.md)
> before writing `evidence.json`, then route through the [KB index](reference/kb/INDEX.md): media capture for the browser
> lane, DB verification for every case with a persisted outcome.

## 1. Freeze the request and create the evidence directory

Record the repository root, revision, requested scope (TC IDs, areas or `all`) and lanes (`api`, `browser`).
Create the run's evidence directory **outside the repository** with `mktemp -d "${TMPDIR:-/tmp}/vulpora-e2e-evidence.XXXXXX"`.
Every artifact of this skill — plan, overlay config, raw outputs, `evidence.json`, the rendered report — lives there.
Never write report files into the repository, and never reuse a directory from an earlier run.

## 2. Establish the TC plan before execution

Build `tc-plan.md` in the evidence directory from the repository's source of truth, in this order:

1. the existing E2E scenario catalog (`e2e-scenario-author`, validated, not regenerated unless authorized);
2. the QA browser handoff (`qa-test-designer`) for UI flows;
3. when neither covers the request, draft TCs from the code's endpoints and screens, mark them `DRAFT`, and stop for
   the user's approval before running them.

Each TC states: ID, priority (P0–P2), lane, Given/When/Then, the visible or API result expected, and **the DB
assertion**: which rows the case must create, change or leave untouched, expressed as a read-only query scoped by the
case's own run-namespace identifiers, plus the expected rows. A TC whose outcome is persisted but has no DB assertion
is incomplete; add one or record why the outcome is not observable in the database.

## 3. Run through e2e-test-workflow with evidence capture

Invoke `e2e-test-workflow` with the approved TCs and lanes. It owns the run environment, execution, cleanup, teardown
and verdict. Add only these capture rules:

- **Browser lane:** generate the run-owned config overlay with
  `node <skill>/scripts/write-playwright-evidence-config.js --repo <repo> --evidence-dir <dir>` and pass the printed
  config to the `playwright-e2e` command (`--config <overlay>`). It imports the repository config unchanged and records
  video and a screenshot for every test, retries 0, with output under the evidence directory (`playwright-e2e` PW-7
  evidence mode). Add `test.step` names that match the TC steps and attach a full-page screenshot at each checkpoint
  the TC names.
- **API lane:** keep the runner's request/response captures (masked) for every exchange the TC makes.
- **DB verification, per case, before its cleanup:** run each TC's DB assertion against the **run-owned** database
  from the workflow's `environment.json` only, inside a read-only transaction, with the case's identifiers in the
  predicate and a row cap. Record query, expected rows, actual rows and `PASS`/`FAIL`. Then let cleanup and the absence
  probe run as usual. The [DB verification topic](reference/kb/db-state-verification.md) has the exact guard rails.

A DB assertion failure makes the case `FAIL` even when the screen or API looked right. Never point a query at a shared,
staging or production database, never write through the verification connection, and never widen a predicate to
make a check pass.

## 4. Assemble evidence.json and render

Write `evidence.json` in the evidence directory per the [evidence schema](reference/evidence-schema.md). Copy each
case's statuses from the workflow output; do not upgrade any status. Reference media by paths relative to the evidence
directory (Playwright writes them under `playwright-output/`). Then render into an empty sub-directory:

```bash
node <skill>/scripts/render-evidence-report.js --evidence <dir>/evidence.json --out <dir>/report
```

The renderer refuses a malformed file, a non-read-only query, a `PASS` case whose DB check or cleanup is not `PASS`, a
browser `PASS` without a video, and media outside the evidence directory. Fix the evidence, not the renderer. It copies
media into `report/assets/`, masks secrets and personal data again, and writes `report/index.html` (Korean UI, works
offline, no external resources).

## 5. Report

Return: the report path (`<dir>/report/index.html`), the overall verdict and per-status counts from the renderer, DB
checks passed / total, videos and screenshots captured, the workflow's lifecycle evidence (cleanup, teardown, orphan
audit), and every gap (blocked lanes, missing media, TCs without DB assertions). Do not open a browser. Tell the user
the directory is temporary and is removed by the OS or by them; it is not committed.

## Stop conditions

- No approved TC plan → stop after drafting it.
- `e2e-test-workflow` returns `BLOCKED` for a requested lane → report it; do not substitute another runner.
- The database in `environment.json` is not run-owned, or the case identifiers are unknown → DB checks are `NOT_RUN`
  and the case cannot be `PASS`.
- The renderer rejects the evidence twice for the same reason → stop and report the validation errors.
