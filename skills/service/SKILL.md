---
name: service
description: Scaffold a domain service in a domain module — the external entry point for an entity's reads/writes. Collaborators (batch writers, Kafka consumers, API services) call the service, never repositories directly. Use when adding domain logic / a read+write entry point for a domain.
---

# service — domain service scaffold

Generate the domain service that owns an entity's transaction boundary and is the **only** way the rest
of the system touches its persistence.

> **Authority**: [`AGENTS.md`](../../../AGENTS.md) is binding. Review with `kotlin-spring-review`; tests with `test-authoring`.

## Where it goes
- The domain module (the persistence-owning module), package `com.example.domain.<domain>.service`. No `public` keyword.
- `open class <Name>Service` — `open` so Spring can proxy `@Transactional`.

## Skeleton (see `order/service/OrderService.kt`)
```kotlin
@Service
@Transactional(readOnly = true)
open class <Name>Service(
    private val <name>JdbcRepository: <Name>JdbcRepository,
    private val <name>Repository: <Name>EntityRepository,
) {
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    open fun bulkUpsert(models: List<<Name>>) {
        <name>JdbcRepository.upsert(models)
    }

    open fun findBy<Field>(<field>: Collection<String>): List<<Name>> {
        if (<field>.isEmpty()) return emptyList()
        return <name>Repository.findBy<Field>In(<field>).map(<Name>Mapper::toModel)
    }
}
```

## Rules (MUST)
- `open class` annotated `@Service`. **Class-level `@Transactional(readOnly = true)`** is the default; write methods are `open fun` with `@Transactional(propagation = Propagation.REQUIRES_NEW)` (so writes self-commit, decoupled from a batch chunk's resourceless transaction or a Kafka listener context).
- **Constructor injection only.** Map at the boundary via the [`mapper`](../mapper/SKILL.md); the service holds **models**, not entities. JSON/serialization is the service's job, not the repository's.
- Return empty collections early on empty input (avoid a needless DB hit).
- For generated single-parameter Kotlin lambdas, use `it` unless a nested lambda needs an explicitly named inner parameter to disambiguate scope. Preserve API-required names for multi-parameter lambdas.

## Hard constraints (build/ArchUnit fail otherwise)
- **No field injection** (`@Autowired` field) anywhere under the application root package — constructor only (`InjectionStyleArchTest`).
- Controllers/listeners reach persistence **through the service**, never the repository (`ControllerRepositoryAccessArchTest`). Keep the service the single entry point.
- Required beans use no `@ConditionalOnMissingBean` — fail fast at boot if misconfigured.

## Verify
Auto-detect the build system (gradle/maven/npm/pnpm/yarn) and run the domain module's compile/build task.

## Related
[[entity]] · [[repository]] · [[mapper]]

## Knowledge base
- `reference/principles.md` — service-layer constitution (transaction boundary, readOnly default, propagation, idempotency, exception translation).
- `reference/kb/INDEX.md` — task → KB routing table.
