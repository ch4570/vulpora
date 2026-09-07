---
name: e2e-test-workflow
description: Orchestrate E2E catalog authoring, API or integration execution, Playwright browser execution, and optional HTML reporting under one run-owned Testcontainers lifecycle. Use when the agent must run a complete or multi-lane E2E verification, refresh and execute the scenario catalog, combine backend and browser evidence, or produce one false-green-safe E2E handoff. Do not use for authoring-only, runner-only, browser-only, or render-only requests that one component skill can satisfy directly.
---

# E2E Test Workflow

Coordinate the existing E2E skills without copying or weakening their rules. Keep one primary owner for environment
creation, execution, cleanup, verdict aggregation, and terminal reporting.

## Exact dependencies

Use exactly these component skills:

- `e2e-scenario-author`
- `e2e-runner`
- `playwright-e2e`
- `e2e-report-renderer`

Treat `e2e-test-workflow` as the orchestrator; never invoke it recursively. Do not replace a missing component with
generic reasoning or a different test framework. Load each selected component's `SKILL.md` before applying that
phase, and let the component's normative rule IDs govern its own artifacts and behavior.

## Input contract

Freeze and report:

- repository root and immutable source revision
- requested scenario IDs, areas, test symbols, or `all`
- requested lanes: `catalog`, `api-integration`, `browser`, `html-report`
- whether catalog generation or refresh was explicitly authorized
- whether persistent JSON, Markdown, or HTML output was explicitly requested
- supplied QA browser handoff and its case IDs

Apply these defaults:

- Select `api-integration` for a general E2E workflow request.
- Select `browser` only when explicitly requested, or for an `all`/`full` request when a bounded Playwright profile
  proves that Playwright is configured. Record `NOT_APPLICABLE` when an `all`/`full` request has no Playwright setup.
- Select `catalog` generation only for an explicit generate, refresh, or full-workflow request. A run-only request
  validates the existing catalog and stops `BLOCKED` when it is absent or stale instead of silently rewriting it.
- Select `html-report` only when the user explicitly asks to persist, render, share, compare, or visualize a report.
  Ordinary verification remains ephemeral.

Do not create containers, start applications, mutate test data, or write report directories until the lane selection
and catalog state are known.

## Workflow

### 1. Check the component inventory

Resolve the active catalog definitions for the four exact dependencies. Stop with `MISSING_DEPENDENCY` or
`AMBIGUOUS_DEPENDENCY` before execution if any component is missing or resolves to more than one active definition.
Record the resolved component paths and versions or content digests.

### 2. Establish the catalog

For a catalog-based run, apply `e2e-scenario-author` before environment creation.

- When generation or refresh is authorized, discover supported Spring-JVM or NestJS surfaces, validate the complete
  candidate, and replace only the generated catalog artifacts permitted by that skill.
- Otherwise validate the existing contract, fingerprint, target coverage, dependency graph, and teardown grammar.
- For an explicit existing repository-suite request, mark this phase `NOT_APPLICABLE`; do not invent a catalog.

Any authoring or validation failure stops before runtime setup. Never continue with a partially written, malformed,
or unexpectedly stale catalog.

### 3. Create one environment owner

Apply the environment-planning and proof rules from `e2e-runner` exactly once. One owner controls this sequence:

`network -> infrastructure -> initialization -> application -> API client -> browser client -> teardown`

Create one run journal and one `environment.json` before the first resource is created. Bind every Spring Boot or
NestJS application, stateful dependency, external stub, API client, and Playwright `baseURL` to run-owned mapped
endpoints. Treat Compose and existing processes as evidence only; never adopt or mutate them.

Do not complete and tear down an `e2e-runner` environment before starting `playwright-e2e`. When both execution
lanes are selected, apply their execution rules inside the same owner and teardown boundary. Do not run mutating
API and browser cases in parallel.

### 4. Execute selected lanes once

Run `api-integration` first using `e2e-runner`. Preserve its case IDs, priorities, selection/execution counts,
per-case statuses, runtime proof, and original verdict input.

Run `browser` next only when selected and all of these are proven:

- a bounded Playwright profile with a repository-declared command and locator convention
- a QA handoff for every selected browser case
- synthetic data, seed owner, cleanup owner, absence probe, and visible assertion for each case
- the same run-owned `environment.json` and a local ephemeral `baseURL`

An explicitly requested browser lane without this evidence is `BLOCKED`; do not invent UI behavior, selectors,
credentials, seed helpers, or broad cleanup. Execute each browser case once with retries disabled.

Continue independent requested cases after an ordinary product assertion failure when the environment remains
trustworthy. Stop further mutation after an infrastructure, cleanup, absence-probe, ownership, or integrity failure,
then enter teardown immediately.

### 5. Clean up and teardown exactly once

Clean case-scoped data before the next case and verify absence. After all runnable lanes finish or an integrity
failure stops execution, terminate the application, containers, and network in reverse order. Audit the run labels
for zero orphaned processes and containers.

Never let API and browser components each claim separate teardown success for the same run. The workflow records one
combined cleanup, teardown, absence-probe, and orphan-audit result. Missing or failed lifecycle evidence prevents
`PASS` even when every assertion was green.

### 6. Aggregate without rewriting evidence

Keep component outputs intact and compute one `test_verdict` with this precedence:

`BLOCKED > INCONCLUSIVE > PARTIAL > PASS`

Use the following normalization:

- `BLOCKED`: a requested stack or lane is unsupported, a required component or QA handoff is unavailable, or zero
  requested tests are collected.
- `INCONCLUSIVE`: zero selected or executed cases, a selected P0 case did not pass, a non-P0 gap lacks detail, or
  cleanup, teardown, absence-probe, runtime-proof, or orphan-audit evidence is missing or not `PASS`.
- `PARTIAL`: execution occurred and the only gaps are documented non-P0 non-PASS cases or documented exclusions.
- `PASS`: at least one requested case executed, every executed and selected P0 case passed, and all combined
  lifecycle evidence passed.

Also report `workflow_status` independently:

- `COMPLETE`: every requested component phase returned a valid terminal result.
- `INCOMPLETE`: a requested authoring, execution-control, or rendering phase failed or returned unusable output.

Never promote a component verdict, convert `NOT_RUN` into `PASS`, or hide disagreement between API and browser
evidence. A rendering failure may make `workflow_status=INCOMPLETE`, but it does not rewrite the observed
`test_verdict`.

### 7. Render only a settled explicit report

Apply `e2e-report-renderer` only after teardown, only for explicit report mode, and only when the selected
`e2e-runner` JSON has its final `.done` marker. The renderer is a read-only view over runner JSON; it does not render
`test-report/browser-e2e/` and must not merge browser evidence into the runner schema.

When HTML is not selected, mark the renderer `NOT_APPLICABLE`. When the run is ephemeral, do not create a report
directory merely to satisfy this phase.

## Output contract

Return one concise workflow handoff containing:

1. repository, frozen revision, requested scope, and selected lanes
2. exact component inventory and per-phase status (`PASS`, `NON_PASS`, `BLOCKED`, or `NOT_APPLICABLE`)
3. catalog fingerprint and whether generated files changed
4. API/integration and browser case counts with original component artifact paths
5. combined environment owner, runtime proof, cleanup, absence-probe, teardown, and orphan-audit evidence
6. `test_verdict` and `workflow_status` with reason codes
7. persisted JSON, Markdown, browser artifacts, and HTML paths only when they actually exist
8. product, test, infrastructure, and coverage gaps with focused rerun commands

Do not claim the workflow completed when a requested lane is unexecuted, a report is unsettled, or lifecycle evidence
is incomplete. Preserve the user's repository state and generated catalog diff for review.
