---
name: e2e-runner
description: Run repository E2E or integration tests in an isolated Testcontainers environment; use for E2E, integration, QA, or full test requests.
---

# E2E Runner — Execution & Reporting Protocol

## Purpose

Run a catalog or existing integration suite only when its framework, run-owned infrastructure, and verification evidence can be proven. Default to terminal-only results and remove transient artifacts; create a report only when explicitly requested.

## Prerequisites

Before detailed execution, read the complete [execution contract](reference/kb/operating-contract.md) and run
`node scripts/detect-test-profile.js <repository-root>` once for bounded discovery. Select only the needed topic:

| Evidence or task | Read next |
|---|---|
| Testcontainers topology, data ownership, or bootstrap | [Environment and data](reference/kb/test-environment-and-data.md) |
| HTTP scenario assertions | [HTTP API E2E](reference/kb/http-api-e2e.md) |
| Kafka/outbox or eventual consistency | [Async execution](reference/kb/async-and-eventual-consistency.md) |
| Persistent body/log artifacts | [Masking and evidence](reference/kb/pii-masking-and-evidence.md) |
| Build-task or CI integration | [CI integration](reference/kb/ci-integration.md) |
| Timing/order diagnosis | [Flaky tests](reference/kb/flaky-tests.md) |

Read [principles](reference/principles.md) only to resolve a rationale question, and use
[the KB index](reference/kb/INDEX.md) only if these routes do not identify the needed topic. Neither is a blanket
preflight dependency. The complete RUN contract remains mandatory; one owner still controls the full lifecycle.

## Instructions

1. Refuse user-owned Compose/runtime mutation: **Testcontainers only; no user-owned Compose mutation**.
2. Validate the catalog with `validate-catalog.js <catalog> <contract> <inventory>` before any execution. A malformed, stale, or unproven catalog stops the run.
3. Keep one environment owner. **RUN-7.0 (One environment owner)** applies to every topology; a **Catalog harness:** owns its complete Testcontainers, application, and client lifecycle.
4. Support only proven Spring Boot or NestJS modules and require positive container-start proof, scenario evidence, masking, cleanup, and a terminal verdict as defined in the execution contract.

## Canonical operating-contract checkpoints

The normative definitions live in the [canonical operating contract](reference/kb/operating-contract.md). These summaries are execution checkpoints, not replacement rules:

- [RUN-6.3 (Bounded test-profile discovery)](reference/kb/operating-contract.md#c-phase-2--environment-planning-and-gating): run `node scripts/detect-test-profile.js <repository-root>` once, retain its complete JSON, and respect its limit of **at most 12 nearby test files**.
- [RUN-16.4 (Framework evidence)](reference/kb/operating-contract.md#g-phase-6--explicit-report-output): preserve that profile unchanged as `git.testProfile`, including framework, fixture, inspected-file, and read-budget evidence.
- [RUN-6.4 (Infrastructure and existing-suite discovery)](reference/kb/operating-contract.md#c-phase-2--environment-planning-and-gating): use the same bounded profile to select a source-backed existing suite and its reported native command; Compose remains evidence only.
- [RUN-16.5 (Infrastructure evidence)](reference/kb/operating-contract.md#g-phase-6--explicit-report-output): record Docker context, Testcontainers state, capability inventory, selected candidate, exact argv, fresh XML, validator verdict, and lifecycle owner.
- [RUN-7.0 (One environment owner)](reference/kb/operating-contract.md#c-phase-2--environment-planning-and-gating): one process owns network, infrastructure, initialization, application, and test client in order. Host Docker installation via `sudo`, Homebrew, apt, or Docker Desktop installers is outside test setup.
- [RUN-7.3 (Two-level cleanup)](reference/kb/operating-contract.md#c-phase-2--environment-planning-and-gating): keep containers run-scoped and data case-scoped, then verify case cleanup, reverse teardown, absence probes, and zero orphans.
- [RUN-7.4 (Ephemeral framework artifacts)](reference/kb/operating-contract.md#c-phase-2--environment-planning-and-gating): snapshot pre-existing results, summarize generated XML, and restore and audit in `finally`. Do not create `test-report/e2e` in ephemeral mode.
- [RUN-8 (Positive proof; no fallback)](reference/kb/operating-contract.md#c-phase-2--environment-planning-and-gating): run `node scripts/validate-container-test-result.js <xml> <class> <started-at-ms>` and require fresh, non-skipped test results plus positive container-start evidence; never fall back to another environment.
- [RUN-16.6 (Bootstrap evidence)](reference/kb/operating-contract.md#g-phase-6--explicit-report-output): record the fixture graph, images, dynamic bindings, probes, test-scope bootstrap changes, positive runtime proof, cleanup, teardown, and orphan audit; missing evidence forbids PASS.
- [RUN-17.2 (Actionable non-PASS remediation)](reference/kb/operating-contract.md#h-phase-7--user-report): classify every non-PASS result and provide bounded, evidence-backed test and infrastructure remediation with exact validation commands.
- [RUN-18.1 (False-green-safe exit matrix)](reference/kb/operating-contract.md#h-phase-7--user-report): materialize the verdict input and run `node scripts/evaluate-run-verdict.js <run-result.json>`; use only the canonical PASS/PARTIAL/BLOCKED/INCONCLUSIVE exit mapping.
- [RUN-18.2 (Diagnostic-only exception)](reference/kb/operating-contract.md#h-phase-7--user-report): only the exact `--diagnostic-only` evaluator mode may narrowly bypass an eligible INCONCLUSIVE exit; it never changes the recorded verdict or relaxes lifecycle proof.

## Examples

- A focused existing integration test: detect its repository-native command, run it once in its owned environment, then report PASS, FAIL, BLOCKED, or UNTRUSTED_ENVIRONMENT.
- A catalog run: reject a stale fingerprint until the user explicitly accepts the recorded risk; never rewrite the catalog.

## Limitations

This skill does not start or reuse shared Compose services, invent framework configuration, retry failures, or turn incomplete infrastructure evidence into PASS. Rules not summarized above, the report schema, and partial-run handling remain in the canonical operating contract.

## Troubleshooting

| Condition | Resolution |
|---|---|
| No proven test profile or owned environment | Stop as BLOCKED and state the missing evidence. |
| Catalog is stale or malformed | Follow the contract's stale/validation path; do not repair it while running. |
| Test fails | Preserve the observed result and use the bounded remediation path; do not retry silently. |

## Verify

Require `tests > 0`, positive owned-environment evidence, masked artifacts when requested, cleanup evidence, and an outcome that matches the observed command result.
