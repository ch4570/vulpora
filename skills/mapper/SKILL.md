---
name: mapper
description: Scaffold a manual `object` mapper between a domain model and JPA entity. This project maps by hand, not MapStruct, because entities are immutable. Use when adding model-to-entity or entity-to-model conversion.
---

# mapper — manual object mapper

Generate a hand-written `object` mapper between a domain **model** and its **entity**. This project
maps **by hand**, not with MapStruct, because entities/models are immutable (`val`). This skill encodes
that decision so new mappers don't reintroduce MapStruct by accident.

> **Authority**: project conventions (e.g. `AGENTS.md`) are binding. Review with `kotlin-spring-review`.

## Where it goes
- Domain module (`<domain-module>`), package `com.example.<domain>.mapper`. No `public` keyword.
- `object <Name>Mapper` — a stateless singleton, **not** a Spring bean (callers reference it statically).

## Skeleton (see `order/mapper/OrderMapper.kt`, `member/mapper/MemberMapper.kt`)
```kotlin
object <Name>Mapper {
    fun toModel(entity: <Name>Entity): <Name> =
        <Name>(
            id = entity.id,
            status = entity.status,
            // ...one line per field
        )

    fun toEntity(model: <Name>): <Name>Entity =
        <Name>Entity(
            id = model.id,
            status = model.status,
            // ...
        )

    fun toModels(entities: List<<Name>Entity>): List<<Name>> = entities.map(::toModel)
}
```

## Rules (MUST)
- Hand-written `object`. Map via **constructor** (entities/models are immutable `val`, so MapStruct setter injection cannot work). Do **not** add `@Mapper` / `org.mapstruct.*`.
- Convert enum↔String only where the stored representation differs from the model representation; preserve unknown-enum fallbacks (see [`enum`](../enum/SKILL.md)).
- Nested values map with `entity.x?.let(::toX)`. KDoc in Korean noting why MapStruct is avoided (immutable `val`).
- The mapper lives at the persistence boundary: services hold models, repositories hold entities, the mapper crosses between them.
- Keep mapping unidirectional and explicit: `toModel` and `toEntity` are separate functions; do not collapse them.
- For single-parameter Kotlin lambdas, use `it` when the lambda is not nested. Only name an inner parameter when nested scopes would otherwise make the value ambiguous; keep API-required parameters for multi-parameter lambdas.

## Note (project convention)
This project deliberately chooses **manual mappers**: entities and models are immutable `val`, so
constructor-based mapping is the only safe option and MapStruct's setter/builder injection adds no value.
New mappers MUST be manual `object`s — do not wire `componentModel`. (MapStruct itself is a fine tool in
projects with mutable models; see the reference KB for a fair comparison.)

## Verify
Run the project's Kotlin compile task via the detected build system (gradle/maven 등 빌드시스템 자동감지).

## reference
Deeper rationale, trade-offs, and per-task rules: see [`reference/principles.md`](reference/principles.md)
and the knowledge base at [`reference/kb/INDEX.md`](reference/kb/INDEX.md). KB takes precedence on conflicts.

## Related
[[entity]] · [[repository]] · [[enum]]
