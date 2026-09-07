---
title: Testcontainers-owned E2E environment and data lifecycle
source:
  - https://java.testcontainers.org/
  - https://node.testcontainers.org/features/wait-strategies/
  - https://playwright.dev/docs/test-global-setup-teardown
last_fetched: 2026-08-28
skills: [e2e-runner]
---

# Testcontainers-owned E2E environment

Compose describes useful local topology, but verification runs use only Testcontainers-owned infrastructure.
This avoids persistent volumes, fixed ports, shared credentials, and state left by another developer/run.

## One owner, one manifest

One process owns `network → infra → initialization → app → client` for the entire run. Before mutation it writes a
journal; after readiness it writes `environment.json` with container/image IDs, mapped endpoints, app URL, dynamic
property bindings, and external stubs. A child runner may consume this manifest but must not outlive its owner.

| Execution surface | Lifecycle owner |
|---|---|
| JVM repository suite | Gradle/Maven test process with Spring/Testcontainers |
| Generated catalog harness | Test-scope harness containing app, containers, and catalog executor |
| Playwright | Node Testcontainers setup that returns teardown; browser tests consume its runtime manifest |

Docker CLI success proves only that the CLI can reach a daemon. PASS additionally requires Testcontainers client
startup evidence from the selected test process. Remote Docker contexts, reused containers, existing app processes,
non-local browser base URLs, and shared auth state are untrusted unless an explicit test-only ownership contract exists.

## Capability-complete bootstrap

Do not translate a service name into a generic image. Derive and pin the actual capability:

- PostgreSQL: image/Dockerfile, extensions, init scripts, migrations.
- Redis: required modules, serializer behavior, key namespace.
- Kafka: broker image/config, topics, consumer groups, DLQ.
- OpenSearch: image/plugins, mappings, templates, refresh policy.
- AWS-like services: run-owned LocalStack resources or repository stub.

Use explicit wait strategies with finite startup timeouts, then run a capability probe. Readiness without the
required extension/topic/mapping is not sufficient.

## Two-level isolation and cleanup

- **Run level:** random mapped ports, run labels, no reuse, app/container/network reverse teardown, orphan count zero.
- **Case level:** deterministic synthetic data plus a resource ledger registered before mutation. Use unique DB
  schema/IDs, Redis prefix, OpenSearch index/alias, Kafka topic/group, and bucket/key namespace.
- Verify absence before the next case. Kafka records are isolated by per-run topic/group or a fresh container, not
  individual deletion.
- Broad reset (`flushDb`, database drop, wildcard index delete) is allowed only after the exact target container ID
  is proven to belong to this run.

## False-green rejection

Green XML is insufficient. Require fresh result XML, requested class, tests > 0, zero skipped/failures/errors,
no Docker/Testcontainers initialization error, and a positive container-start log. A test that wraps all assertions
in `if (isDockerAvailable())` yields the low-level `BLOCKED_FALSE_GREEN` diagnostic and maps to the overall
`BLOCKED` verdict, even when the framework reports PASS.

## Review hook

- [ ] Every dependency endpoint maps to a run-owned container ID.
- [ ] Images/capabilities, initialization, wait strategy, and dynamic bindings are proven.
- [ ] External sinks and browser/application URLs are run-owned test endpoints.
- [ ] Case cleanup and final orphan audit both succeeded.
- [ ] Runtime positive proof, not Docker CLI status alone, supports PASS.
