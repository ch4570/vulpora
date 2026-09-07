# Test authoring knowledge base

Use this index only when the direct evidence routes in [SKILL.md](../../SKILL.md) do not identify the needed
reference. Read one matching topic; do not preload the library. Each topic retains its source metadata and review
hooks. `TST-n` and `PST-n` are defined only by SKILL.md; references explain their rationale and application.

| Condition or question | Read |
|---|---|
| Choosing a test layer or allocating test effort | [test-pyramid](test-pyramid.md) |
| Distinguishing a pure test from an actual narrow boundary or E2E need | [unit-vs-integration-vs-e2e](unit-vs-integration-vs-e2e.md) |
| Private fake/helper duplication, refactor amplification, or adapter parity | [refactoring-resistant-tests](refactoring-resistant-tests.md) |
| Agent changes production and tests together; oracle or negative-proof question | [agentic-coding-safety-net](agentic-coding-safety-net.md) |
| Structuring a case or naming its behavior | [aaa-and-naming](aaa-and-naming.md) |
| Detected Kotest version/style/lifecycle | [kotest-idioms](kotest-idioms.md) |
| Detected Jupiter or mixed JUnit Platform engines | [junit5-idioms](junit5-idioms.md) |
| Repository provides coroutine-test and the subject uses dispatchers/cancellation | [coroutine-unit-testing](coroutine-unit-testing.md) |
| Explicit narrow JPA repository round-trip subject | [jpa-persistence-testing](jpa-persistence-testing.md) |
| Choosing or configuring a boundary mock/fake | [test-doubles-and-mocks](test-doubles-and-mocks.md) |
| Time/randomness/parallel isolation or interpreting coverage evidence | [determinism-and-coverage](determinism-and-coverage.md) |

Read [principles](../principles.md) only when the rationale is disputed or needs explanation. When reporting a
finding, cite the relevant source and TST/PST ID. Official-source evidence takes precedence over interpretation;
SKILL.md owns the operational rule registry and principles do not redefine it. Refresh an affected topic's source
when its framework contract changes, preserving the current repository version rather than assuming the newest.
