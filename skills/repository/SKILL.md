---
name: repository
description: Scaffold data access for a domain entity — a JpaRepository interface named *EntityRepository, plus optional *JdbcRepository (bulk ON CONFLICT upsert) and *AggregateRepository (QueryDSL). Use when adding persistence access.
---

# repository — persistence-access scaffold

Generate the persistence-access types for a domain entity. The naming and type (interface vs class)
decisions are **load-bearing** — getting them wrong fails the build or breaks boot.

> **Authority**: project conventions (`AGENTS.md` 등) are binding. Review with `kotlin-spring-review`;
> SQL with a SQL review pass. Bean-name collision constraint: see KB [`reference/kb/bean-naming.md`](reference/kb/bean-naming.md).

## Where it goes
- Domain module (`<domain-module>`), package `com.example.<domain>.repository`. No `public` keyword.

## JPA interface — name MUST end with `EntityRepository`
```kotlin
interface <Name>EntityRepository : JpaRepository<<Name>Entity, String> {
    fun findBy<Field>(<field>: String): List<<Name>Entity>
}
```
(see `order/repository/OrderEntityRepository.kt`). No `@Repository` on the interface. Add `, SelectExtensions<E, ID>` for pessimistic-lock reads.

## JDBC bulk-upsert — a **class** (auto-excluded from the naming rule)
```kotlin
@Repository
class <Name>JdbcRepository(private val jdbcTemplate: JdbcTemplate) {
    fun upsert(rows: List<<Model>>): Int {
        if (rows.isEmpty()) return 0
        jdbcTemplate.batchUpdate(UPSERT_SQL, rows, BATCH_SIZE) { ps, m -> bind(ps, m) }
        return rows.size
    }
    private companion object { private const val BATCH_SIZE = 1000; private val UPSERT_SQL = """ INSERT ... ON CONFLICT (<pk>) DO UPDATE SET ... """.trimIndent() }
}
```
(see `order/repository/OrderJdbcRepository.kt`). QueryDSL aggregation goes in a `class <Name>AggregateRepository(private val queryFactory: JPAQueryFactory)`.

## Rules (MUST)
- JPA repo is an **interface** ending in `EntityRepository`. JDBC/aggregate repos are **classes** annotated `@Repository`.
- Constructor injection, **type-based** (no string `@Qualifier`). SQL lives in a `private companion object` constant. `ON CONFLICT` updates mutable columns only and **preserves `created_at`**.
- Prefer JPA; use JDBC **only** for what JPA/JPQL can't express (bulk `ON CONFLICT`). Repos do not own transactions — the [`service`](../service/SKILL.md) does.
- For generated single-parameter Kotlin lambdas, use `it` unless a nested lambda needs an explicitly named inner parameter to disambiguate scope. Preserve API-required names for multi-parameter lambdas.

## Hard constraints (build/boot fail otherwise)
- A JPA repo **interface** not ending in `EntityRepository` fails the repository-naming ArchUnit test. (JDBC/aggregate `class`es are exempt because they are not interfaces.)
- **Bean-name collision = boot failure** (`override=false`): naming a domain repo for an entity called "Job" as `JobRepository` clashes with Spring Batch's built-in `jobRepository` bean and crashes boot. Use `JobEntityRepository`; prefix mirrored types per domain. See KB [`reference/kb/bean-naming.md`](reference/kb/bean-naming.md).
- Controllers/listeners MUST NOT depend on repositories directly (controller→repository ArchUnit test) — they go through the service.

## Verify
빌드시스템 자동감지(gradle/maven 등) 후 도메인 모듈 컴파일 태스크 실행.

## reference
- 원칙(헌법): [`reference/principles.md`](reference/principles.md)
- 지식 베이스 색인: [`reference/kb/INDEX.md`](reference/kb/INDEX.md)

## Related
[[entity]] · [[mapper]]
