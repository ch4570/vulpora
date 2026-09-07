---
title: E2E runner execution contract
source: ../../SKILL.md
last_fetched: 2026-09-01
skills: [e2e-runner]
---

# E2E runner execution contract


# E2E Runner — Execution & Reporting Protocol

This skill is **normative**. **MUST / MUST NOT / SHOULD** carry RFC-2119 meaning. Rules are cited by ID (`RUN-n`).

> **Authority**: active workspace `AGENTS.md` instructions are binding when present or injected by the host. This skill
> creates only run-owned Testcontainers, test applications, and synthetic data. It never adopts shared applications
> or Compose infrastructure, never auto-retries, and reports only positively observed execution.

> **Shared contract**: [`docs/e2e-scenarios/CONTRACT.md`](../../../../docs/e2e-scenarios/CONTRACT.md) is the SSOT for catalog block keys, dependency / capture grammar, run-result JSON schema, mask classes, and the idempotency contract. Its version-1 bootstrap source ships with the required `e2e-scenario-author` dependency. If the project contract is missing, stop and run the author; never synthesize a private runner contract.

> **Inputs**: the catalog at `docs/e2e-scenarios/catalog.md` or an existing repository suite. **Default output**:
> terminal-only verdict after transient framework artifacts are removed. **Explicit report output**: one run directory
> under `test-report/e2e/`. HTML remains the responsibility of `e2e-report-renderer`.

> **Reference loading:** This document contains the complete mandatory RUN contract. Follow the task-specific
> routes in [SKILL.md](../../SKILL.md) for additional details. Read [principles](../principles.md) only for a
> rationale question, or [the KB index](INDEX.md) to locate an otherwise unresolved topic; neither is required
> before every run. MUST NOT recursively load the entire KB.

> **Bounded discovery:** Before reading source or tests, run
> `node scripts/detect-test-profile.js <repository-root>`. It reads only build markers, build configuration,
> test-engine configuration, and at most 12 nearby test files. Its JSON output is the test-framework and
> Testcontainers evidence for this invocation; do not rescan the repository to rediscover the same facts.

---

## A. Boundary (the three "do nots")

**RUN-1 (Testcontainers only; no user-owned Compose mutation) — MUST NOT.** The runner MUST NOT execute `docker compose up`, `docker compose down`, `docker run`, or any other command that starts or modifies user-owned infrastructure containers (`pgsql`, `kafka`, `opensearch`, `redis`, `localstack`, …). Compose files are configuration evidence only, even when they exist locally. E2E infrastructure is always owned by Testcontainers; lifecycle of catalog-targeted Spring Boot or NestJS applications is governed by `RUN-7.0`, not by this rule.

**RUN-1.1 (Owned Testcontainers) — MUST.** Every stateful dependency used for a PASS-capable run must map to a container ID created by this run. Compose files may supply image/capability hints but are never executed. Reusable containers are disabled for verification runs.

**RUN-2 (No auto-retry) — MUST NOT.** Each scenario runs exactly once per invocation. Flaky-masking via silent retry
is forbidden. Re-running a failing scenario requires a separate user-driven invocation except for the single
non-verdict-changing diagnostic allowed by `RUN-2.2`.

**RUN-2.1 (Polling is not retry) — CLARIFICATION.** Bounded polling against a deadline (`RUN-12`) is the explicit *contract* for `outbox-async` style scenarios and is not a retry — the scenario itself is a single observation that succeeds the first time the assertion holds. A scenario whose HTTP fence returns 5xx is `FAIL` on the first response; the runner MUST NOT re-issue the request.

**RUN-2.2 (One bounded diagnostic pass) — MAY.** After preserving the original non-PASS verdict, run at most one
focused invocation of the failed native test to distinguish deterministic failure from suite-order/readiness
behavior. Label it `diagnostic`; it never changes the full-suite verdict and MUST NOT trigger another full run.
This focused-pass label is not a verdict bypass; only the exact evaluator flag in `RUN-18.2` can alter an exit code.

**RUN-3 (No catalog mutation) — MUST NOT.** The runner is reader-only on `docs/e2e-scenarios/catalog.md`. If the catalog is missing, malformed, or stale, the runner stops and asks; it MUST NOT call `e2e-scenario-author` automatically.

---

## B. Phase 1 — Load catalog & detect stale

**RUN-4 (Catalog absence) — MUST.** If `docs/e2e-scenarios/catalog.md` does not exist, stop immediately and instruct the user to run `e2e-scenario-author` first, **unless** the user explicitly asked to execute an existing repository test. That request uses the bounded repository-suite path in `RUN-6.4`; it never invents a catalog or a new test case.

**RUN-5 (Stale detection) — MUST.** Read the `Source fingerprint: sha256:<digest>` header. Re-detect the
supported repository profile and source/config inputs by running the installed author's
`scripts/discover-surfaces.js <repository-root> docs/e2e-scenarios/CONTRACT.md` read-only into an owned temporary
inventory. Use its normalized paths and bytes to recompute the digest. Also inspect working-tree changes over that
discovered input set. A digest
mismatch or changed input marks the catalog stale, warns the user, and requires explicit confirmation before
execution. Never substitute hardcoded module names. Record `catalog.stale = true` and both observed/expected
fingerprints when continuing with an explicitly accepted stale catalog. When fingerprints match, run
`validate-catalog.js <catalog> <contract> <inventory>` and require source-target/behavior coverage before any
scenario executes. On mismatch, run structural validation without the inventory first, then follow only the explicit
stale-catalog path; do not misreport `SCA-19.FINGERPRINT-MISMATCH` as malformed Markdown.

**RUN-6 (Parsing) — MUST.** Parse scenarios by the literal keys from [`CONTRACT.md §1`](../../../../docs/e2e-scenarios/CONTRACT.md), exactly one primary executor fence (`http` / `sql` / `shell`), and the optional following `shell` teardown fence. A non-`—` `Mutates` requires teardown; a read-only scenario forbids it. If the format does not match, stop with a precise line-number error. MUST NOT attempt format recovery.

**RUN-6.1 (Structural validation) — MUST.** Before executing any scenario, the runner MUST validate the parsed catalog's structure and stop on any of:

| Check | Stop with |
|---|---|
| Duplicate scenario ID | `RUN-6.1.DUP-ID: <id> at <line> and <line>` |
| `Depends-on` references a non-existent ID | `RUN-6.1.MISSING-DEP: <child> -> <parent>` |
| Cycle in the `Depends-on` graph | `RUN-6.1.DEP-CYCLE: <id>, <id>, ...` |
| `Captures` token outside `^[A-Z][A-Z0-9_-]*$` | `RUN-6.1.BAD-CAPTURE: <token>` |
| `Mutates` value not matching [`CONTRACT.md §6`](../../../../docs/e2e-scenarios/CONTRACT.md) grammar | `RUN-6.1.BAD-MUTATES: <id>` |
| `Depends-on` not an array (singular form is `SCA-9` forbidden) | `RUN-6.1.DEP-CARDINALITY: <id>` |

`SCA-15` performs the same lint at write time, but the runner MUST re-validate — the catalog on disk may be hand-edited or stale relative to the skill that wrote it.
With a matching fingerprint, this re-validation also enforces `SCA-19`: every target is source-backed and every
inventory-required behavior has a scenario. A source inventory or validator failure stops before environment setup.

**RUN-6.2 (sql / shell read-only allowlist) — MUST.** Scenario fences in `sql` or `shell` are subject to a strict allowlist evaluated before execution:

- `sql` fence: the body MUST begin with `SELECT` or `WITH ... SELECT` (case-insensitive). Any of `INSERT / UPDATE / DELETE / DROP / TRUNCATE / ALTER / CREATE / GRANT / REVOKE` is rejected, even inside a CTE. A scenario that legitimately needs to mutate state MUST declare it via `Mutates:` (`SCA-17`) and use the teardown convention — those mutations go through the `shell` fence by design (so they are auditable), not `sql`.
- primary or teardown `shell` fence: every command MUST appear in the allowlist `{curl, kafka-topics, kafka-console-consumer, kafka-console-producer, docker exec, redis-cli, opensearch-cli, psql -c, sleep}`. Teardown starts with `# teardown`, has at least one command, and references a declared resource or capture. Use one command per line; pipes, chains, redirections, command substitutions, backticks, and line continuations are rejected.

Both checks fail with `RUN-6.2: scenario <id>: <command/keyword>` and **stop the entire run** before any scenario executes — a partially-run catalog is more dangerous than a refused one.

---

## C. Phase 2 — Environment planning and gating

**RUN-6.3 (Bounded test-profile discovery) — MUST.** Run
`node scripts/detect-test-profile.js <repository-root>` once before selecting a mode. Keep its complete JSON as
`git.testProfile` in the run result. Its `primaryFramework` is one of `kotest`, `junit-jupiter`, `mixed`, or
`unknown`; it is evidence, not permission to add a test engine or rewrite existing tests. When the selected E2E
fixture has engine-specific entry points, use only the detected engine's existing style: Kotest spec style and
lifecycle for `kotest`, Jupiter annotations/extensions for `junit-jupiter`, and each test's native engine for
`mixed`. `unknown` is allowed only when the repository provides a framework-neutral executable fixture; otherwise
stop with `RUN-6.3: test framework could not be proven for fixture <module>`.

The detector has a fixed read budget: root markers, discovered Gradle/Maven/version-catalog/test-property files,
and no more than 12 test files. It must report every file it read. Do not perform broad `rg` source scans merely
to choose Kotest versus JUnit; source enumeration remains the scenario author's responsibility.

For `node-nestjs`, use the scenario author's bounded inventory as the application-profile evidence. Resolve the
owning package, non-watch package-manager command, port, environment, global prefix, health/readiness route, and
Node Testcontainers declaration from repository-owned package/config/source files. Ambiguous, computed-at-runtime,
or secret-dependent values stop `BLOCKED`; never invent credentials or environment values.

**RUN-6.4 (Infrastructure and existing-suite discovery) — MUST.** The same profile discovers Docker availability,
repository-owned Compose files/services, and up to 12 source-backed container/integration test candidates. It must
report an executable command for each candidate. When the user asks for a focused repository test, select one
requested/source-relevant candidate and run its reported command once with `--rerun-tasks`; do not scan for, write,
or guess another test. When the user explicitly asks for all/full tests, use the repository's native aggregate
`test` command once, force execution, and continue independent tasks after failure (`--continue` for Gradle,
fail-at-end equivalent for Maven). Use Testcontainers when
`dockerCli.available=true`, `dockerCli.local=true`, and
a candidate fixture is proven and `conditionalInfrastructureBypass=false`. Docker CLI reachability remains
unverified until `RUN-8` sees positive Testcontainers runtime proof. Compose services are evidence only: do not start, stop, reset, or
mutate a user-owned Compose stack.

**RUN-7 (Fail-closed environment plan) — MUST.** Before creating a resource, materialize an `EnvironmentPlan`
from selected scenarios/tests and bounded evidence. It lists required service capabilities, pinned image or
repository Dockerfile, readiness probe, schema/topic/index/bucket initialization, dynamic application property,
external stub, application profile, entry point, launch command, readiness path, identity probe, and lifecycle owner.
For Spring, prefer configured `actuator/health/readiness`, otherwise `/actuator/health`. For NestJS, use the
catalog-discovered health/readiness endpoint combined with the resolved global prefix. Catalog labels and
build/package identities must agree. Compose is only a capability hint. An unresolved image, property, initializer,
external sink, application entry point, endpoint, or identity stops `BLOCKED`; generic substitutes are forbidden.

**RUN-7.0 (One environment owner) — MUST.** Exactly one process owns the complete run in this order:
`network → infrastructure → initialization → application → test client`. It writes a durable run journal immediately
before the first resource is created and then `environment.json` containing run ID, container/image IDs, mapped
endpoints, application URL, property bindings, and stub endpoints. API and browser runners consume only this
manifest. In ephemeral mode both files live under the external temporary directory and are removed after terminal
reporting. No existing process, port, storage state, remote endpoint, or reusable container is adopted.

For `spring-jvm`, the owner uses the repository-declared Gradle/Maven test entry point and dynamic application
properties. For `node-nestjs`, it uses the repository-declared package manager, the `start:e2e` or `start`
non-watch entry point, the resolved global prefix/readiness route, and a Node Testcontainers executor. A `dev`,
`start:dev`, or other watch-only command is inadmissible. In both profiles the application must bind only to
run-owned mapped endpoints and the owner must terminate the complete process tree during teardown.

Allowed topologies are:

- **Repository suite:** the selected Gradle/Maven or Node package-manager test process owns Testcontainers and the application context.
- **Catalog harness:** a test-scope harness owns Testcontainers and a random-port application and executes the catalog
  inside that same lifecycle. The outer agent must not start containers and then lose their owner.
- **Browser run:** `playwright-e2e` owns Node Testcontainers plus the test application for the full Playwright run.

**RUN-7.1 (Runtime and endpoint proof) — MUST.** Docker CLI reachability is not Testcontainers reachability.
Resolve the active local Docker context endpoint and pass it to the selected test process when needed. Remote
`tcp://`/`ssh://` daemons are blocked unless an explicit test-only ownership contract proves isolation. Before PASS,
prove every stateful application property resolves to a run-owned mapped endpoint and every third-party sink resolves
to a run-owned stub (WireMock/MockServer/LocalStack or repository equivalent). A non-local browser `baseURL`, reused
auth state, or unresolved endpoint is `UNTRUSTED_ENVIRONMENT` and cannot PASS.
The owner must prove the profile-specific Testcontainers client and executor: Java classpath and a discovered
Gradle/Maven fixture for `spring-jvm`, or the Node Testcontainers package and an explicit non-watch E2E executor for
`node-nestjs`. Record selected image tags and positive non-Ryuk container-start evidence before PASS.

**RUN-7.2 (Fixture selection/bootstrap) — MUST.** Prefer a candidate whose fixture graph proves container
construction/import, dynamic binding, wait strategy, and lifecycle owner. When no fixture exists, an explicit E2E
request authorizes the smallest test-scope Testcontainers dependency and harness; production dependencies,
application config, Compose, and CI remain unchanged. Use pinned images/repository Dockerfiles and initialize required
capabilities (migrations, extensions, topics, mappings/templates, buckets/queues) before readiness. If this evidence
cannot be derived, stop `BLOCKED`. Host Docker installation via `sudo`, Homebrew, apt, or Docker Desktop installers is
never part of test setup.

**RUN-7.3 (Two-level cleanup) — MUST.** Containers are run-scoped; data is case-scoped. Register cleanup before
mutation and record DB schema/row IDs, Redis key namespace, OpenSearch index/alias, Kafka topic/group, and object-store
keys in a resource ledger. Verify case cleanup/absence before the next case. A broad reset such as `flushDb` is allowed
only after the exact Redis container ID is proven run-owned. Finally stop application then containers/network in
reverse order and audit run labels for zero orphans. Cleanup, teardown, or orphan-audit failure records failed
lifecycle evidence and forces the overall verdict to `INCONCLUSIVE` under `RUN-18.1`; it never permits `PASS`.

**RUN-7.4 (Ephemeral framework artifacts) — MUST.** Existing repository-suite runs default to `ephemeral` artifact
mode. Before execution, create an external temporary parent and run
`node scripts/manage-test-artifacts.js snapshot <repo> <temp-parent>/artifact-snapshot` so pre-existing user results
are preserved.
After execution, summarize standard Gradle/Maven XML with `node scripts/summarize-test-results.js <repo>`, complete
runtime validation, then invoke `restore` in a `finally` path. This removes newly generated XML/HTML/problems reports
and restores the pre-run artifact state byte-for-byte. Audit must return zero when no artifacts existed before the
run. A signal or diagnostic failure must still restore. If configured result roots cannot be bounded, stop rather
than leave files behind. Do not create `test-report/e2e` in ephemeral mode.

**RUN-8 (Positive proof; no fallback) — MUST.** Exit code and green XML are insufficient. Reject candidates that
conditionally skip assertions when Docker is unavailable. After execution run
`node scripts/validate-container-test-result.js <xml> <class> <started-at-ms>` and require: fresh XML, requested
class, tests > 0, zero skipped/failures/errors, no Testcontainers runtime error, and container-start log evidence.
The helper's low-level `BLOCKED_FALSE_GREEN` result is a diagnostic reason that maps to the overall `BLOCKED`
verdict; it is not a fifth terminal verdict. Otherwise preserve an observed case `FAIL` for the verdict evaluator.
Never fall back to Compose, mocks, production endpoints, or a different test mode.

---

## D. Phase 3 — Per-scenario preconditions

**RUN-9 (Precondition → SKIPPED, not FAIL) — MUST.** Before running a scenario, evaluate its `Preconditions` row using the grammar in [`CONTRACT.md §4`](../../../../docs/e2e-scenarios/CONTRACT.md). Unmet preconditions MUST yield `SKIPPED` with the failing condition recorded in `skippedReason` (e.g. `SKIPPED: opensearch.articles.count=12 < 100`). `SKIPPED` MUST NOT count toward `pass` or `fail`.

**RUN-9.1 (Probe error vs unmet precondition) — MUST.** A *probe error* (the probe itself fails — connection refused, 5xx from the probe target, timeout) is **not** the same as an unmet precondition. The runner MUST distinguish:

| Situation | Status | `skippedReason` prefix | Counted in |
|---|---|---|---|
| Probe returned a parseable value not meeting the threshold | `SKIPPED` | `precondition-unmet:` | `summary.skipped` |
| Probe failed to run / returned an unparseable value | `PROBE-ERROR` | `probe-error:` | `summary.probeError` (separate counter) |

A `probeError` non-zero count MUST raise the runner's non-zero exit at end of run (`RUN-18.1`). This is a deviation from the rule that `SKIPPED` alone is not a failure — probe errors mean the run cannot tell whether the scenario would have passed, which is a result the user must act on.

---

## E. Phase 4 — Execution

**RUN-10 (Serial, deterministic order) — MUST.** Run scenarios in catalog order (already canonical by `SCA-11.1`). Parallel execution is forbidden — it would corrupt shared state (sessions, DB rows, OpenSearch index) and break determinism.

**RUN-11 (Dependency chains) — MUST.** Honor `Depends-on` (array per [`CONTRACT.md §3`](../../../../docs/e2e-scenarios/CONTRACT.md)). If any parent is `FAIL`, the dependent is marked `FAILED-DEPENDENCY` and is **not** executed.

**RUN-11.1 (Variable substitution) — MUST.** Per [`CONTRACT.md §3.3`](../../../../docs/e2e-scenarios/CONTRACT.md), `{{prev.<KEY>}}` resolves to the value of `<KEY>` from the most recent ancestor that declared `<KEY>` in `Captures`. Missing `<KEY>` → `FAILED-DEPENDENCY` with reason `missing-capture: <KEY>`.

**RUN-11.2 (SKIPPED parent propagation) — MUST.** A parent in `SKIPPED` state propagates differently depending on whether the child uses a capture from it:

| Parent status | Child uses `{{prev.<KEY>}}` from this parent | Child outcome |
|---|---|---|
| `FAIL` | — | `FAILED-DEPENDENCY` |
| `SKIPPED` (any reason) | yes | `FAILED-DEPENDENCY` with reason `parent-skipped: <parent-id>` |
| `SKIPPED` (any reason) | no | child runs normally (the precondition that skipped the parent is the parent's concern, not the child's) |

This avoids false-positive `FAILED-DEPENDENCY` cascades when an unrelated precondition skips a parent.

**RUN-12 (Async deadlines) — MUST.** For `outbox-async` / Kafka style scenarios, polling MUST have a finite deadline. Defaults: `5s` deadline, `250ms` interval. The scenario MAY override via explicit values in the `Expected` row, e.g. `deadline=15s; interval=500ms`. Unbounded polling is forbidden.

**RUN-12.1 (Async coverage — lag, DLQ, rebalancing) — MUST.** Kafka scenarios MUST be classified at parse time by their `BEHAVIOR` suffix (per `SCA-6.1`) and executed with the matching evaluator:

| Slug suffix | Evaluator behavior |
|---|---|
| `CONSUME` | Produce the input message; poll the worker's observable side-effect (DB row, OpenSearch doc, Redis key) until deadline. Capture consumer-group lag at start and end of poll; record both in evidence. |
| `DLQ` | Produce a message guaranteed to fail (per the catalog's `Dataset`); assert exactly one matching record appears on the DLQ topic within deadline. The DLQ topic is derived as `<source-topic>.DLQ` unless `Expected` overrides with `dlq=<topic>`. |
| `PUBLISH` | Trigger the producer side; assert the outbox row exists in DB (publisher side) **or** the message appears on the target topic (worker side) within deadline. |

`RUN-12.1` rejects a Kafka scenario whose slug is not one of the three above with `RUN-12.1: scenario <id>: unknown async slug`. Partition rebalancing during a run is detected (via consumer-group state) and recorded in evidence; it does not auto-retry — the scenario still runs exactly once per invocation.

**RUN-13 (Evidence capture cap) — MUST.** For each scenario, capture: HTTP status, latency, response headers, response body. The body is split into a 4 KB head and a 4 KB tail (when total > 8 KB, the middle is replaced with `... <N bytes omitted> ...`); the full body goes to a sibling file under `raw/`. On failure only, also attach the last 5 seconds of container logs. On success, MUST NOT attach logs (keeps report compact).

**RUN-13.1 (Log-unavailable evidence) — MUST.** When `RUN-13` cannot collect logs (the container is down, the run is in `testcontainers` mode and the container was already torn down, the user is not in the docker group), the runner MUST record `evidence.logUnavailableReason` (one of: `container-not-running`, `container-disposed`, `docker-permission-denied`, `unknown`) and proceed. The failure is still `FAIL`, not `SKIPPED` — logs are evidence, not a precondition.

---

## F. Phase 5 — Masking & normalization

**RUN-14 (Mask in report body AND raw artifact) — MUST.** Apply every mask class defined in [`CONTRACT.md §7`](../../../../docs/e2e-scenarios/CONTRACT.md) before writing:
- The Markdown summary body (human view).
- The JSON `results[*]` fields (machine view).
- The raw response files under `raw/`.
- The container log tails under `logs/`.

Earlier drafts stored raw bodies unmasked "for debugging". That is reversed: raw is masked at write time because the file lives in a shared repo path. To debug an unmasked body, re-run the single scenario locally and observe in the terminal — the artifact on disk is always masked.

**RUN-14.1 (Mask class amendments) — MUST.** When the application introduces a new sensitive field shape (e.g., a new ID format), the team MUST add a mask class to [`CONTRACT.md §7`](../../../../docs/e2e-scenarios/CONTRACT.md) in the same PR. The runner MUST NOT carry its own private mask list.

---

## G. Phase 6 — Explicit report output

**RUN-15 (Output layout) — MUST.** Only when the user explicitly requests a persisted report, a run produces this
tree and only this tree. Otherwise apply `RUN-7.4`:

```
test-report/e2e/{YYYY-MM-DD}-{shortSHA}-{seq}/
├── {YYYY-MM-DD}-{shortSHA}-{seq}.json   # 1st-class SSOT, schemaVersion=1, contractVersion=1
├── {YYYY-MM-DD}-{shortSHA}-{seq}.md     # short human summary
├── {YYYY-MM-DD}-{shortSHA}-{seq}.done   # 0-byte marker, written LAST
├── raw/<scenario-id>.json                # full response bodies (masked, per RUN-14)
└── logs/<scenario-id>.log                # only for failed scenarios (masked)
```

`{seq}` is the next zero-padded integer in that directory for the same `{date}-{sha}`. The Markdown summary follows [`fixtures/report-template.md`](../../fixtures/report-template.md). The JSON schema is fixed by [`CONTRACT.md §5`](../../../../docs/e2e-scenarios/CONTRACT.md). The `.done` marker is written **last** so the renderer (`REN-17`) can wait for a settled run.

**RUN-16 (JSON schema) — MUST.** The run JSON conforms to [`CONTRACT.md §5`](../../../../docs/e2e-scenarios/CONTRACT.md). Every field listed there is required, even when empty. `schemaVersion` and `contractVersion` are both required and both equal `1` at the time of this writing.

**RUN-16.1 (Dataset normalization) — MUST.** Per [`CONTRACT.md §2`](../../../../docs/e2e-scenarios/CONTRACT.md), `dataset` is **always an object**: parsed `key=value` pairs, or `{"_raw": "<verbatim string>"}` with `parsed=false` when parsing fails. The runner never emits `dataset` as a bare string.

**RUN-16.2 (dependsOn cardinality) — MUST.** `results[*].dependsOn` is always an array (empty `[]` when independent), matching [`CONTRACT.md §3.4`](../../../../docs/e2e-scenarios/CONTRACT.md). The runner rejects a catalog whose `Depends-on` is a bare ID (singular form is `SCA-9` forbidden and `RUN-6.1` enforced).

**RUN-16.3 (Non-PASS field values) — MUST.** For non-PASS results, the runner MUST write the field values defined in [`CONTRACT.md §5`](../../../../docs/e2e-scenarios/CONTRACT.md) — `actual=null`, `latencyMs=null`, `evidence.rawBodyPath=null` for `SKIPPED` and `FAILED-DEPENDENCY`; `actual`, `latencyMs`, both evidence paths required for `FAIL`. Renderer relies on this for filtering (REN-21).

**RUN-16.4 (Framework evidence) — MUST.** Include `git.testProfile` unchanged from `RUN-6.3`, including
`primaryFramework`, config/source evidence, Testcontainers fixture evidence, inspected files, and read-budget
counters. The Markdown summary names only the selected framework and environment.

**RUN-16.5 (Infrastructure evidence) — MUST.** Include Docker CLI context, unverified/verified Testcontainers
runtime state, Compose capability inventory, and repository-suite candidates. Add the selected candidate, exact
command/argv, fresh XML path, runtime validator verdict, and lifecycle owner.

**RUN-16.6 (Bootstrap evidence) — MUST.** Record image tags and IDs, fixture graph, dynamic property bindings,
initialization/capability probes, test-scope files changed by bootstrap, runtime positive proof, case-cleanup results,
teardown result, and orphan audit. A run cannot report `PASS` if any evidence is missing or cleanup failed.

**RUN-16.7 (Verdict input) — MUST.** Before reporting a terminal result, materialize the verdict
input with `selection.collectedCount`, `execution.supportedStack`, documented `execution.slowTestExclusions`, and
one `testCases` entry per collected case. Each case records its stable ID, priority, selection/execution booleans,
observed status, and a non-empty `detail` for a selected non-P0 non-PASS result. Executed cases use only `PASS` or
`FAIL`; selected unexecuted cases use only `SKIPPED`, `FAILED-DEPENDENCY`, or `PROBE-ERROR`; unselected cases have
no status. Under `lifecycle`, record cleanup,
teardown, and orphan-audit status plus at least one named absence probe. Evaluate this input with
`node scripts/evaluate-run-verdict.js <run-result.json>`; the evaluator's verdict, exit code, and stderr are
normative. Malformed or internally inconsistent verdict input is a process error, never a run verdict.

---

## H. Phase 7 — User report

**RUN-17 (Terminal summary) — MUST.** On exit, print the computed verdict (`PASS`, `PARTIAL`, `BLOCKED`, or
`INCONCLUSIVE`), selected/collected/executed counts, the five scenario numbers (`pass / fail / skipped /
failed-dependency / probe-error`), runtime-proof/cleanup/absence-probe/orphan verdicts, and artifact mode. Print a run
directory only in explicit report mode. Suggest `e2e-report-renderer` only when a settled report exists. No other
terminal noise.

**RUN-17.2 (Actionable non-PASS remediation) — MUST.** On any non-PASS result, read
[failure remediation](../failure-remediation.md) and classify the failure as `PRODUCT_DEFECT`, `TEST_DEFECT`,
`INFRA_DEFECT`, or `UNKNOWN`. Report the exact failing case/location and causal evidence. Provide one concrete native
framework test change and one test-infrastructure change, or explicitly justify why either side needs no change.
Each proposal includes target file/symbol or setting, mechanism, risk, and exact focused/full validation commands.
For async failures, inspect readiness, isolation, and ordering; increasing a timeout alone is forbidden. Keep the
original verdict even if the single `RUN-2.2` diagnostic pass succeeds.

**RUN-17.1 (Startup failure output) — MUST.** A read-only validation failure before resource creation writes no run
directory and prints one line. Immediately before the first network/container/app is created, provision the run
directory and durable journal only in explicit report mode; ephemeral mode journals under the external temporary
directory. Any later failure writes an `ABORTED` JSON/Markdown report only in explicit report mode after reverse
teardown and orphan audit. Ephemeral mode prints the same facts to the terminal and removes its temporary journal.
The pre-resource line is:

```
e2e-runner: aborted before run-dir creation: <RULE-ID>: <reason>
```

and no JSON or Markdown is written. The `RULE-ID` is the rule that fired (e.g. `RUN-4`, `RUN-5`, `RUN-6.1.DUP-ID`, `RUN-7.1`).

**RUN-18 (Exit signal) — MUST.** See `RUN-18.1` for the exit-code matrix.

**RUN-18.1 (False-green-safe exit matrix) — MUST.** Evaluate the verdicts in precedence order
`BLOCKED > INCONCLUSIVE > PARTIAL > PASS` and use these exit codes:

| Verdict | Code | Required meaning |
|---|---:|---|
| `PASS` | `0` | At least one case was collected, selected, and executed; every executed case and selected P0 case passed; cleanup, teardown, every named absence probe, and orphan audit passed. |
| `PARTIAL` | `2` | Execution occurred and the only gaps are documented selected non-P0 non-PASS results or documented slow-test exclusions. |
| `BLOCKED` | `3` | The stack is unsupported or zero tests were collected. |
| `INCONCLUSIVE` | `4` | Zero cases were selected; zero cases executed after selection; a selected P0 did not pass; a selected non-P0 gap is undocumented; or cleanup, teardown, absence-probe, or orphan-audit evidence is missing or did not pass. |

Every ordinary non-zero verdict writes exactly `ERROR: verdict=<VERDICT>` followed by one newline to stderr. `PASS`
writes nothing to stderr. Read-only usage/input errors and SIGINT remain process errors rather than run verdicts.

**RUN-18.2 (Diagnostic-only exception) — MUST.** `--diagnostic-only` is the sole verdict bypass. It MAY return exit
`0` only when the computed verdict is `INCONCLUSIVE` solely because an executed selected P0 result is non-PASS and
there are no other partial, blocked, or inconclusive conditions. The JSON MUST still show
`verdict="INCONCLUSIVE"`, `qualifying_pass=false`, and `mode="diagnostic-only"`. Diagnostic-only MUST NOT relax
zero-selected, zero-executed, cleanup, teardown, absence-probe, or orphan-audit failures. No alias or report field enables this mode.

---

## I. Partial runs (selective execution)

**RUN-19 (Subset by ID or area) — SHOULD.** When the user requests a subset (e.g. "run `E2E-ARTICLE-*` only" or "run `E2E-OUTBOX-EVENT-CONSUME`"), execute the matching scenarios plus every ancestor in their `Depends-on` chain. Truncating a chain silently is forbidden.

**RUN-19.1 (Subset scope in JSON) — MUST.** When a subset is run, the JSON `scope` field (per [`CONTRACT.md §5`](../../../../docs/e2e-scenarios/CONTRACT.md)) MUST record:
- `requested`: the literal user request (IDs, globs).
- `autoIncluded`: every additional scenario added because it was an ancestor.

For full runs, `scope.requested = ["*"]` and `scope.autoIncluded = []`.

---

## J. Cross-skill discipline

**RUN-20 (Contract reference is normative) — MUST.** The runner treats [`CONTRACT.md`](../../../../docs/e2e-scenarios/CONTRACT.md) as a normative input. A `contractVersion` bump is a coordinated three-skill PR; the runner alone cannot raise the version. If the contract version on disk is newer than the version the runner recognizes, the runner stops with `RUN-20: contract version N > runner-supported N-1`.

**RUN-21 (Idempotency enforcement) — MUST.** Before executing the first scenario, scan every `Mutates` field.
Each non-`—` scenario must have exactly one following shell teardown fence starting with `# teardown` and
referencing the declared resource or captured identifier. `last-in-area` is not cleanup. A missing teardown stops
the run with `RUN-21: scenario <id>: mutating scenario without teardown`; this missing lifecycle evidence is
`INCONCLUSIVE` under `RUN-18.1`.

Execute teardown in a `finally` path after primary PASS, FAIL, or timeout. Record primary and cleanup outcomes
separately. A cleanup failure makes the scenario `FAIL` even when the primary passed; a primary failure remains
`FAIL` even when cleanup succeeds. This is the runtime guarantee that rerunning the suite does not accumulate state.

**RUN-22 (notes.md is not normative input) — MUST.** `docs/e2e-scenarios/notes.md` is a human-facing companion document. The runner MUST NOT parse it as input. If a scenario requires data that lives only in `notes.md`, the scenario is malformed — fix it in the catalog (`SCA-16` allows seed-data tokens; anything more specific belongs outside the catalog and outside the runner's reach).

---

## Checklist

- [ ] Catalog loaded; both committed-drift and working-tree-drift confirmed (`RUN-5`)
- [ ] Structural validation clean (`RUN-6.1`); sql/shell allowlist clean (`RUN-6.2`)
- [ ] Bounded framework/Testcontainers profile is recorded; Kotest, JUnit Jupiter, and mixed suites retain their native engine (`RUN-6.3`, `RUN-16.4`)
- [ ] Docker CLI and Testcontainers runtime are proven separately; conditional no-op tests cannot PASS (`RUN-7.1`, `RUN-8`)
- [ ] EnvironmentPlan proves pinned capabilities, dynamic bindings, external stubs, and one lifecycle owner (`RUN-7`, `RUN-7.0`, `RUN-16.5`)
- [ ] Case data is cleaned before the next case; application, containers, and network are torn down with zero orphans (`RUN-7.3`, `RUN-16.6`)
- [ ] Repository-suite artifacts were snapshotted, summarized, restored, and audited in `finally` (`RUN-7.4`)
- [ ] Probe errors distinguished from unmet preconditions (`RUN-9.1`)
- [ ] Scenarios run serially, in catalog order (`RUN-10`)
- [ ] `Depends-on` honored; SKIPPED parents do not falsely fail capture-independent children (`RUN-11`, `RUN-11.2`)
- [ ] Async deadline finite; DLQ / lag-aware evaluators selected by slug (`RUN-12`, `RUN-12.1`)
- [ ] Evidence has 4 KB head+tail; log-unavailable reason recorded when applicable (`RUN-13`, `RUN-13.1`)
- [ ] Mask classes from contract applied to body, JSON, raw, and logs (`RUN-14`, `RUN-14.1`)
- [ ] Persisted output exists only when explicitly requested; report layout matches `RUN-15`
- [ ] JSON conforms to contract §5; `dependsOn` array, `dataset` object, non-PASS fields per matrix (`RUN-16`, `RUN-16.1`, `RUN-16.2`, `RUN-16.3`)
- [ ] Terminal summary prints selection/execution and five scenario numbers; startup failures use the dedicated line format (`RUN-17`, `RUN-17.1`)
- [ ] Every non-PASS verdict includes bounded test and infrastructure remediation (`RUN-17.2`)
- [ ] Exit/stderr matches the false-green-safe matrix and any diagnostic bypass is exact and narrow (`RUN-18.1`, `RUN-18.2`)
- [ ] Subset runs record requested+autoIncluded (`RUN-19.1`)
- [ ] Idempotency enforcement passed (`RUN-21`); `notes.md` not parsed (`RUN-22`)
- [ ] Contract version on disk matches runner-supported version (`RUN-20`)


## 리뷰 훅

- [ ] Root SKILL.md retains the routing and safety summary.
- [ ] This contract is read before detailed execution.
- [ ] Rule identifiers and stop conditions remain unchanged.
