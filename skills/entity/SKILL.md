---
name: entity
description: Scaffold a new JPA entity following project conventions (schema-qualified @Table, composite @EmbeddedId keys, Persistable for JDBC upsert, read-only mirror entities). Use when adding a persisted entity.
---

# entity — JPA entity scaffold

Generate a JPA entity that matches the project's domain conventions. The generator's job is to bake the
hard constraints in so a new entity cannot drift from the house style.

> **Authority**: the project conventions (e.g. `AGENTS.md`) are binding. This skill **scaffolds**; review
> with a Kotlin/Spring reviewer, tests with your test-authoring flow.

## reference
원칙: `reference/principles.md`, 지식: `reference/kb/INDEX.md`.

## Where it goes
- The domain module (`<domain-module>`), package `<base-package>.<domain>.entity` (e.g. `com.example.order.entity`).
- Follow the module's API visibility convention (e.g. no `public` keyword when the module runs `explicitApi = Disabled`).
- Class name `<Name>Entity`. Composite-key id class `<Name>EntityId`.

## Skeleton
```kotlin
@Entity
@Table(schema = "<schema>", name = "<table>")
class OrderEntity(
    @Id
    @Column(name = "order_id", length = 126, nullable = false, updatable = false)
    val id: String,

    @Enumerated(EnumType.STRING)
    @Column(name = "status", length = 50, nullable = false)
    val status: OrderStatus,

    @Column(name = "created_at", nullable = false, updatable = false)
    val createdAt: Instant = Instant.now(),
    @Column(name = "updated_at", nullable = false)
    val updatedAt: Instant = Instant.now(),
)
```

## Rules (MUST)
- `@Table` MUST set **both** `schema` and `name`. Enums persist via `@Enumerated(EnumType.STRING)`.
- Fields are `val`; only auditing fields are `var`. Default `Instant.now()` for ingestion timestamps.
- **Composite PK**: `@EmbeddedId val id: <Name>EntityId = <Name>EntityId()` + `@Embeddable data class <Name>EntityId(... @Column(updatable = false) ...) : Serializable`.
- **Auditing** only where needed: `@EntityListeners(AuditingEntityListener::class)` + `@CreatedDate`/`@LastModifiedDate var`.
- **Read-only mirror entities** (synced from an external system) are read-only: keep source timestamps as `val`, **omit** auditing.
- **JDBC bulk-upsert targets** implement `Persistable<String>`: `@Transient private var _persisted` + `isNew()` + `@PostLoad @PostPersist markPersisted()` (so `ON CONFLICT` upsert via [`repository`](../repository/SKILL.md) works). KDoc in Korean, matching surrounding density.
- When generated Kotlin contains a single-parameter lambda, use `it` unless the lambda is nested; name the inner parameter only to disambiguate nested scopes. Multi-parameter lambdas keep the API-required parameters.

## Hard constraints (build/ArchUnit fail otherwise)
- The entity MUST stay inside `..<domain>..entity..`. Code outside the domain module MUST use the domain **model**, never the entity (enforced by an entity-leakage ArchUnit test). Always pair an entity with a model + [`mapper`](../mapper/SKILL.md).
- A persistence change MUST ship a matching DB migration in the **same** change.

## Verify
도메인 모듈 컴파일 — 빌드시스템 자동감지(gradle/maven 등). 예: Gradle `compileKotlin`, Maven `compile` (warnings-as-errors).

## Related
[[repository]] · [[mapper]] · [[enum]]
