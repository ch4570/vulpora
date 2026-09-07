# Failure remediation contract

Read this file only after a `PARTIAL`, `BLOCKED`, or `INCONCLUSIVE` verdict.

## Classify from evidence

| Class | Evidence threshold |
|---|---|
| `PRODUCT_DEFECT` | Deterministic assertion failure after readiness and isolation are proven |
| `TEST_DEFECT` | Missing readiness fence, shared identity/state, order dependency, conditional assertion bypass, or isolated/full-suite disagreement |
| `INFRA_DEFECT` | Container startup, capability probe, endpoint binding, resource exhaustion, or cleanup failure |
| `UNKNOWN` | Evidence cannot separate the classes; state what observation is missing |

Do not change a failed verdict because an isolated diagnostic pass succeeds. Report both observations.

## Required proposal shape

For every non-PASS verdict, return:

1. Classification and confidence.
2. Minimal evidence: failed case, source location, first causal error, runtime/cleanup state.
3. Test change: exact file/symbol, mechanism, why it addresses the evidence, regression risk, validation command.
4. Infrastructure change: exact test-scope setting/fixture, or an evidence-backed `no infrastructure change` decision.
5. Revalidation: one focused command followed by one full-suite command. Never loop retries.

Keep production configuration, shared Compose, CI, and host Docker installation out of proposals unless the user
explicitly expands scope.

## High-value patterns

- Kafka consumer: create topics first; wait for listener container assignment/group stability before producing; use
  unique topic/group per case/run. Increasing Awaitility timeout alone is not a fix.
- Database/OpenSearch/Redis: prove migrations/mappings/modules, then use case-owned identifiers and absence checks.
- Conditional Docker assertions: replace `if (dockerAvailable)` bodies with an explicit prerequisite failure or a
  Testcontainers-owned fixture. A green no-op is invalid.
- Full-suite-only failure: inspect parallelism, shared static state, ports, clocks, and test identity before blaming
  the product.
- Runtime failure: propose pinned image, wait strategy, dynamic binding, and local socket mapping derived from the
  active Docker context. Do not propose starting repository Compose.
