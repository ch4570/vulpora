---
name: test-authoring
description: Write or review trustworthy Kotlin unit and narrow integration tests for agent-authored changes. Prefer real contracts; exclude E2E and live-service tests.
---

# Kotlin test authoring

## Purpose

Write Kotlin tests that are simple to read and complete in verification. Prefer the smallest deterministic test that
uses real collaborators; use a narrow integration test before replacing those collaborators with mocks.

## Requirements and limitations

This skill owns Kotlin unit and narrow integration tests: pure/domain logic and a bounded application or persistence
boundary. Prefer real production collaborators when they are deterministic and cheap to assemble; use a narrow
repository/database or framework slice when that is the smallest way to prove its contract. A test must remain
deterministic and independently diagnosable.

Do not use this skill to create or execute E2E, browser, live-service, or broad full `@SpringBootTest` tests. Hand
those requests to the repository's dedicated E2E workflow. Do not run an E2E-profile detector merely to choose a
Kotlin test framework. Use only dependencies and verification commands already supported by the target repository.

## Instructions

### 1. Detect before writing

Inspect the target repository before selecting a style or base class:

1. Read the affected module's `build.gradle[.kts]` or `pom.xml`, version catalog, and test-task/surefire configuration.
2. Sample nearby unit tests and their small shared test utilities. Record the actual framework(s), versions, assertions, extensions, fixture conventions, and enabled engines.
3. Follow those conventions unless they conflict with a correctness requirement. Do not add a framework, engine, or dependency merely to write a test.

Route progressively:

| Detected evidence | Read next | Use |
| --- | --- | --- |
| Kotest dependencies or `*Spec` tests | [Kotest idioms](reference/kb/kotest-idioms.md) | The existing spec style and configured isolation/concurrency |
| JUnit Jupiter dependencies or `org.junit.jupiter` tests | [JUnit idioms](reference/kb/junit5-idioms.md) | Jupiter annotations, assertions, extensions, and parameterization |
| Multiple JUnit Platform engines, `@Suite`, or `useJUnitPlatform()` | [JUnit idioms](reference/kb/junit5-idioms.md) | Keep each engine's tests in its native style; do not convert a mixed suite by default |
| `kotlinx-coroutines-test`, `runTest`, or a dispatcher rule | [Coroutine unit testing](reference/kb/coroutine-unit-testing.md) | Virtual time, injected dispatchers, and structured-concurrency assertions |
| MockK dependency or `mockk`/`every`/`verify` use | [Test doubles and mocks](reference/kb/test-doubles-and-mocks.md) | Existing MockK conventions, only at a boundary |
| Repeated private fake/helper classes or widespread test edits after refactoring | [Refactoring-resistant tests](reference/kb/refactoring-resistant-tests.md) | Change-amplification diagnosis, fixture/fake ownership, and release-confidence evidence |
| Production and tests changed together by an agent, or a release-confidence claim | [Agentic coding safety net](reference/kb/agentic-coding-safety-net.md) | Oracle-integrity audit, negative proof, orthogonal evidence, and verification ladder |
| Repository-provided unit-test base or fixture | The local utilities and nearby tests | The lightest existing utility that fits, if one exists |

If framework/configuration evidence is unavailable, keep the test framework-neutral and ask only if the choice would change the implementation materially.

### Discovery budget

Framework selection must be evidence-based but small: inspect the affected module's build/test configuration and at
most 8 nearby unit or narrow-integration tests. Record `primaryFramework`, engine version when discoverable, spec/annotation style,
fixture base, coroutine-test evidence, and mock-library evidence in the handoff. Do not recursively read test
directories, search generated output, inspect E2E infrastructure, or load both Kotest and JUnit guidance unless the
build actually has a mixed suite.

### 2. Authoritative rules

This table is the single normative definition of the `TST-n` rule set. Supporting principles and KB files
may cite these IDs for rationale or framework-specific examples, but must not assign them another meaning.

| ID | Contract |
| --- | --- |
| **TST-1** | Discover before choosing: inspect the relevant build and test configuration plus a bounded sample of nearby tests, then record the detected framework, version or engine when available, style, fixtures, and extensions. Route only to guidance supported by that evidence; do not add or convert frameworks merely to write a test. |
| **TST-2** | Prefer real deterministic collaborators and a narrow integration boundary before mocks. For an adapter that owns Redis, database, HTTP serialization, Kafka, OpenSearch, filesystem, or framework wiring, keep at least one isolated test against the actual protocol, serializer, mapping, or framework boundary; SDK mocks and self-declared faithful fakes do not prove that contract. Use a pure unit test when extra collaborators do not add confidence. Do not use a browser, live service, or broad full application context; hand off a behavior that genuinely needs those resources to the E2E workflow. |
| **TST-3** | Name the condition and expected behavior using the repository's naming convention. In a repository profile that already uses `{UnitUnderTest}Test`, `sut`, or `actualResult`, preserve those names; they are not universal framework requirements. |
| **TST-4** | Keep one independently diagnosable behavior in each leaf test or parameterized case. Split unrelated outcomes into separate cases. |
| **TST-5** | Keep Arrange/Act/Assert or Given/When/Then linear and visible. Do not use branching or ad-hoc loops to decide which assertions run; framework-native data-driven cases remain valid when each case is isolated and diagnosable. |
| **TST-6** | Assert an observable contract outcome; successful execution alone is not evidence. |
| **TST-7** | Assert each applicable contract surface: return value, resulting state, and contractually meaningful interaction, including relevant arguments and counts. Do not require interaction assertions when interaction is not part of the contract. |
| **TST-8** | Cover meaningful boundaries, failures, and degradation or partial-failure behavior separately from the happy path. |
| **TST-9** | Verify through public or otherwise contractually observable surfaces. Do not inspect private members, invoke private methods, or assert internal class/call topology. An implementation-only refactor must not require widespread test edits; if it does, move assertions toward public results, durable state, or a real boundary contract. |
| **TST-10** | Control nondeterminism: inject or virtualize wall-clock time, randomness, waiting, network access, and other environmental inputs; never use real sleeps as synchronization. |
| **TST-11** | For probabilistic behavior, fix the seed and assert a statistically meaningful property over enough samples rather than a single draw. |
| **TST-12** | Isolate case data and mutable state. Tests must not depend on execution order, shared leftovers, unstable collection order, or parallel scheduling. An integration test owns its namespace or disposable resource; it must not run database-wide, schema-wide, bucket-wide, topic-wide, or cache-wide destructive cleanup against a shared target. |
| **TST-13** | Choose doubles by role, after considering a real collaborator. A fake must reduce setup and model one stable consumer-owned contract; do not create a one-off private class that mirrors a production interface merely to avoid a mock. Keep deterministic pipeline stages real and replace the terminal external boundary. If a shared fake claims semantic parity with a real adapter, run the same contract cases against both. |
| **TST-14** | Use strict mocks by default. Do not globally enable relaxed behavior, mock value objects, or assert incidental calls. Stub only calls needed to reach the scenario; use exact values or capture and assert every contract-bearing argument instead of `any()`; verify only contractual arguments/counts. Opt into relaxed behavior on one named collaborator only when the test explains why missing stubs are irrelevant. |
| **TST-15** | When the JPA persistence contract profile applies, prove a real repository round-trip and follow the authoritative `PST-1` through `PST-6` rules below. |
| **TST-16** | Verify and hand off with evidence. Map each requested or changed behavior to a test symbol or stable case ID, state one plausible faulty implementation that the selected test would reject, and report the exact command, exit code, executed count, and per-test observation `PASS`, `FAIL`, or `NOT_RUN`. These observations are distinct from an overall runner verdict such as `PASS`, `FAIL`, `PARTIAL`, `BLOCKED`, or `INCONCLUSIVE`. Report a per-test `PASS` only when that selected test executed and passed; use `NOT_RUN` with a concrete reason when execution was impossible. |
| **TST-17** | Do not leave dead or silently disabled tests. Any skip or quarantine must use the repository's explicit mechanism and record a concrete reason. |
| **TST-18** | For coroutine code, use the repository's existing coroutine-test dependency and `runTest`; inject a test dispatcher or dispatcher provider whenever the subject switches context. Drive concurrency with the shared virtual-time scheduler, assert cancellation/failure behavior when contractual, and never use `runBlocking`, real delays, or production dispatchers to synchronize a unit test. |
| **TST-19** | Treat existing tests, assertions, fixtures, snapshots, graders, coverage rules, and CI configuration as protected evidence. When production and tests change together, classify every test-side change as a new behavior proof, an intentional contract update anchored to the request, or test-only maintenance that preserves detection strength. Derive expected values from requirements, public contracts, or independently calculated examples—not the changed implementation or the same helper it uses. Do not delete, skip, relax, widen matchers, regenerate expected data, lower thresholds, or change expected values merely to make the implementation pass. An unexplained weakening blocks a trustworthy verdict. |
| **TST-20** | Require negative and staged execution evidence for changed behavior. Observe the selected test fail before the fix, or after implementation use a temporary controlled mutation/revert or an already-configured mutation tool to prove it rejects a plausible fault; restore the implementation and rerun green. Then run the smallest complete ladder supported by the repository: selected tests, affected-module suite, relevant narrow boundary/contract tests, and required repository checks. Confirm the selected cases were freshly discovered and executed from test reports; zero discovered tests, stale reports, or cache-only/`UP-TO-DATE` output is not a per-test `PASS`. Do not add a dependency only for this proof, and do not claim release readiness when a required rung is `NOT_RUN`. |

In generated Kotlin tests, use `it` for a non-nested single-parameter lambda. Name an inner parameter only
when nested lambdas need scope disambiguation; preserve API-required names for multi-parameter lambdas.

The rules above are the operational contract. Read [principles](reference/principles.md) only when a rationale
or disputed tradeoff needs explanation. Use [the KB index](reference/kb/INDEX.md) only when the detected case has
no direct route above; do not load either document before an ordinary supported test.

### 3. Mock selection gate

Before creating a mock, classify the collaborator and choose the first viable option:

1. Use a real value object or domain object.
2. Use the real deterministic in-process collaborator.
3. For an external adapter, use an isolated narrow integration test against its actual protocol, serializer, mapping,
   transaction, or framework boundary.
4. Use a small stateful fake when real infrastructure is impractical and state transitions are the contract.
5. Use a strict mock for the remaining external boundary, failure injection, or contractual interaction.

A private helper or fake is not automatically better than a mock. Do not mirror a production interface merely to satisfy
a constructor. Keep deterministic pipeline stages real and replace only terminal I/O. If a shared fake claims adapter
parity, execute common contract cases against both. Keep mocks strict and assert only contract-bearing interactions.

Read [Test doubles and mocks](reference/kb/test-doubles-and-mocks.md) when a selected mock or fake needs framework
or hermetic-boundary details. Read [Refactoring-resistant tests](reference/kb/refactoring-resistant-tests.md) when
fake ownership, change amplification, adapter parity, or a release-confidence claim is part of the task. A pure
test with real deterministic collaborators does not load these topics.

### 4. Agentic change safety gate

Apply this gate whenever an autonomous agent authors or edits production code and tests in the same change. Read
[Agentic coding safety net](reference/kb/agentic-coding-safety-net.md).

Inspect production and test diffs separately, derive the oracle from the authoritative contract, and audit test-side
weakening. Obtain RED-before-GREEN or controlled mutation/revert evidence, then execute selected, affected-module,
actual-boundary, and repository-required checks that apply. Report every omitted rung as `NOT_RUN`. For high-risk state
changes, require an independent reviewer or proof mechanism that does not restate the implementation.

### 5. Coroutine test profile

When TST-18 applies and the repository already provides coroutine-test support, read [Coroutine unit
testing](reference/kb/coroutine-unit-testing.md). Do not add a dependency solely for this profile.

### 6. Conditional repository profile

Apply this profile **only when the target repository actually provides it and nearby tests use it**: `module:test-support` base classes, Kotest `BehaviorSpec`, MockK, its fixture API, Spring extensions, and utilities such as `flushAndClear()`.

In that profile, reuse the lightest suitable base class instead of duplicating its wiring. This is a local convention, not a requirement for JUnit, Kotest, Spring, or other repositories. A JUnit project must not extend a Kotest base class, and a Kotest project must not adopt JUnit annotations merely because both run on the JUnit Platform.

#### Narrow persistence profile

Apply this profile only when the persistence boundary is the subject and the repository provides a DB-slice base plus
the entity's `JpaRepository`.

- **PST-1:** Save and reload through the injected repository's public API.
- **PST-2:** Flush and clear after save and before reload; direct `EntityManager` flush/clear is strictly test plumbing.
- **PST-3:** Preserve the narrow slice and its actual configured database; do not substitute mocks or full boot.
- **PST-4:** Inventory and assert every relevant non-simple mapping after reload.
- **PST-5:** Cover populated, `null`, and contractually allowed empty JSON/JSONB values.
- **PST-6:** Use `persist`/`find`/`merge` only when the named subject is lifecycle, flush, or custom persistence behavior.

Read [JPA persistence testing](reference/kb/jpa-persistence-testing.md) for the full application contract and exceptions.

## Review check

- [ ] Detected framework, lifecycle, fixtures, and build configuration are preserved.
- [ ] Observable outcomes and meaningful boundary/failure cases use deterministic, isolated data.
- [ ] Real collaborators and actual adapter contracts precede strict, boundary-only mocks.
- [ ] No private fake mirrors production structure; unchanged behavior does not fan out test edits.
- [ ] Coroutine and JPA profiles apply only when detected, with their routed contract checks complete.
- [ ] Test-side diffs preserve an independently derived oracle and show RED or controlled mutation evidence.
- [ ] Fresh reports prove selected, module, boundary, and required-check execution; omissions are `NOT_RUN`.
- [ ] Deployment confidence is claimed only when observable behavior, actual boundary, and failure evidence are complete.
