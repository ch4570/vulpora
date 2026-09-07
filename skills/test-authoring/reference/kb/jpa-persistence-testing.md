---
title: JPA persistence mapping contract tests
source: https://docs.spring.io/spring-boot/reference/testing/spring-boot-applications.html#testing.spring-boot-applications.autoconfigured-spring-data-jpa
last_fetched: 2026-08-25
skills: [test-authoring]
---

# KB: JPA persistence mapping contract tests

Apply this KB only after detecting a repository-provided DB-slice base and the target entity's Spring Data `JpaRepository`. Spring Boot documents `@DataJpaTest` as a focused JPA test slice and shows that a real database may be retained with `@AutoConfigureTestDatabase(replace = NONE)`. Spring Data repository APIs document `save` and `findById` as CRUD APIs; `JpaRepository` extends that repository model. Additional primary source: [Spring Data repository core concepts](https://docs.spring.io/spring-data/commons/reference/repositories/core-concepts.html).

## Repository round-trip

- **PST-1:** In an ordinary entity/repository mapping test, persist and retrieve through the injected target repository's public API: `save()` or `saveAndFlush()`, then `findById()` or an applicable repository query. This tests the repository boundary used by application code.
- **PST-2:** Clear the persistence context after saving and before reading. Prefer a supplied `flushAndClear()` helper. If the repository has none, `EntityManager.flush()` followed by `clear()` is permitted strictly as test plumbing after repository save and before repository reload. The loaded result must be a database round-trip, not the already-managed object from the first-level persistence context.
- **PST-3:** Keep the repository's narrow DB slice and actual configured database. Preserve existing real-DB replacement settings; do not substitute mocks or in-memory storage, and do not elevate an entity-only mapping test to `@SpringBootTest`.

## Mapping inventory and boundaries

- **PST-4:** Before writing assertions, inventory the target entity's related non-simple mappings: JSON/JSONB, arrays, embeddables, converters, and equivalent custom column mappings. Assert every relevant persisted value after the round-trip.
- **PST-5:** For each JSON/JSONB mapping, test populated typed content, `null`, and an empty object or collection when the entity contract permits it. The assertion proves restored typed values rather than a successful save alone.
- **PST-6:** `EntityManager.persist()`, `find()`, and `merge()` are not ordinary mapping-test save/reload APIs. Direct lifecycle operations are an exception only when the subject is a lifecycle callback, flush semantics, or custom persistence behavior, and the test name must state that reason. The `flush()`/`clear()` plumbing exception in `PST-2` remains allowed without replacing repository save/reload.

## 리뷰 훅

- [ ] DB-slice base, `JpaRepository`, real-DB configuration, and a local persistence-context clear mechanism were detected before this profile was applied.
- [ ] Ordinary mapping tests use repository save/reload APIs and clear before reading.
- [ ] EntityManager usage is limited to `PST-2` flush/clear plumbing or a named lifecycle/flush/custom-behavior subject.
- [ ] JSON/JSONB populated, null, and contractually allowed empty boundaries are covered.
- [ ] All related non-simple mapping fields are asserted after reload.
