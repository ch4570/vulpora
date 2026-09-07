---
name: playwright-e2e
description: Execute QA-approved browser E2E in a run-owned Node Testcontainers environment. Prove the app/baseURL and stateful endpoints are ephemeral, seed synthetic case data, execute once, verify cleanup, teardown with zero orphans, and report evidence. Use after QA hands off UI scenarios or when asked to run Playwright E2E.
---

# Playwright E2E — QA Execution, Data Lifecycle, and Evidence

This skill executes browser scenarios; it does not invent their product behavior. QA design remains the source of
case IDs, priority, preconditions, synthetic dataset, and observable outcome.

## 1. Bounded preflight

Run `node scripts/detect-playwright-profile.js <repository-root>` once before changing or executing a test. It reads
the package/configuration files and at most 12 nearby Playwright tests, returning the configured command, projects,
data-fixture candidates, selector conventions, and every inspected file. Save that JSON unchanged in the run report.

Use the profile rather than rescanning the suite. Its fixture result proves only that seed/cleanup/absence symbols
exist; read the selected helper and execute the absence probe before treating the lifecycle as safe. If the
Playwright dependency/configuration, command, or data lifecycle cannot be proven, stop as `BLOCKED`; never
substitute another browser runner.

## 2. Run-owned environment

**PW-0 (One owner) — MUST.** Run the companion `e2e-runner` infrastructure profile first. Compose is evidence
only. A verification run uses Node Testcontainers owned by one setup process for the full browser run. Prefer
Playwright `globalSetup` returning its teardown function for container lifetime; setup-project dependencies may seed
data but must not be the sole container owner. Write `environment.json` with container/image IDs, mapped endpoints,
app URL, property bindings, and external stubs. Tests consume that manifest through a custom fixture.

If the repository has Playwright but lacks Node Testcontainers, an explicit request for test infrastructure
authorizes the smallest test-only dev dependency and setup/teardown fixture. Start the application as a run-owned
test process/container after infrastructure is ready. `reuseExistingServer`, an existing `storageState`, a non-local
`baseURL`, or an app that cannot receive mapped endpoints is `UNTRUSTED_ENVIRONMENT` and cannot PASS.

## 3. QA handoff contract

Each executable case must contain:

| Field | Required content |
|---|---|
| Case ID | Stable `TC-...` identifier from QA |
| Priority | P0/P1/P2 |
| User flow | Intent-level Given/When/Then and expected visible result |
| Synthetic dataset | Named values only; no PII or production identifiers |
| Seed owner | Repository-declared test API, fixture, or seed helper |
| Cleanup owner | Repository-declared delete/reset helper and an observable absence check |
| Selector evidence | Existing `getByRole`, `getByLabel`, `getByTestId`, or a project-provided locator convention |

Missing `Seed owner` or `Cleanup owner` is a refusal to execute, not a reason to use a broad database delete.
UI text selectors are allowed only when the repository has no stronger stable semantic locator.

## 4. Data lifecycle — mandatory

**PW-1 (Run namespace) — MUST.** Generate one run ID such as `pw-<timestamp>-<short-random>` and scope every
created user, order, file, key, and search document to it. Use synthetic data only.

**PW-2 (Manifest before action) — MUST.** Before the UI action, write the created resources to an in-memory test
manifest and the per-case result: `{kind, id, seedOwner, cleanupOwner}`. Do not record secrets, cookies, access
tokens, or PII.

**PW-3 (Finally cleanup) — MUST.** Register cleanup before the first mutating UI action and run it in Playwright
`test.afterEach` / `try...finally`, whether the case passes, fails, times out, or is aborted. Only delete resources
in this run's manifest; database-wide reset, volume removal, `DELETE FROM <table>` without an ID predicate, and
cleanup of adopted/shared resources are forbidden.

**PW-4 (Cleanup verification) — MUST.** After cleanup, use the repository-provided absence probe (test API, fixture,
or scoped query) to prove each manifest resource is gone. Cleanup verification failure makes the case `FAIL` even
when the UI assertions passed.

Containers are run-scoped; data namespaces are case-scoped and cleaned before the next case. Final teardown stops
the app, containers, and network in reverse order and audits run labels for zero orphans. Teardown/orphan failure
makes the run `FAIL`.

## 5. Browser execution

**PW-5 (Verified project configuration) — MUST.** Preserve repository browser projects, locators, workers, and
timeouts, but force retries to zero and use only the run-owned environment manifest for baseURL/auth. Do not reuse
an existing server or storage state. Every stateful/external endpoint maps to a run-owned container/stub.

**PW-6 (One execution) — MUST.** Execute each selected case once. Do not enable retries to hide flaky behavior.
Use Playwright's auto-waiting and explicit assertions; fixed sleeps are forbidden. Eventual UI state must use a
bounded expectation timeout from the repository configuration.

**PW-7 (Evidence) — MUST.** Capture trace, screenshot, and video on failure using the existing Playwright config.
Mask or omit sensitive values before writing reports. Never save authenticated storage state, secrets, or raw PII in
the report directory.

## 6. Report and terminal result

Write only under `test-report/browser-e2e/{run-id}/`:

```text
{run-id}.json       # case status, timing, data manifest, cleanup evidence, artifact paths
{run-id}.md         # concise human summary
artifacts/<case-id>/ # Playwright trace/screenshot/video only when generated
```

For every case report: `PASS`, `FAIL`, `BLOCKED`, or `NOT_RUN`; the QA case ID; environment; seed/cleanup owners;
created resource count; cleanup result; cleanup-verification result; and artifact paths. Print a compact summary by
priority and exit non-zero for `FAIL` or `BLOCKED` P0 cases.

## Checklist

- [ ] Existing Playwright setup and safe fixture proven; any added dependency is test-only and explicitly authorized
- [ ] Node Testcontainers owner holds infra/app through browser teardown; Compose/existing servers are not used
- [ ] Bounded preflight profile saved and reused; no suite-wide rediscovery
- [ ] QA handoff has case ID, synthetic data, seed owner, cleanup owner, and visible assertion
- [ ] Every created resource is run-scoped and recorded before mutation
- [ ] Cleanup runs in finally semantics and is verified case by case
- [ ] Playwright runs once with semantic locators and bounded assertions
- [ ] Failure evidence is preserved without secrets or PII
- [ ] Per-case report records result, data lifecycle, and artifacts
