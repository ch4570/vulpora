---
name: flyway
description: Scaffold a Flyway migration SQL file with a build-enforced filename and PostgreSQL conventions. Use when a persistence change (entity/column/index) needs a migration — authored in the SAME change as the entity.
---

# flyway — migration SQL scaffold

Generate a Flyway migration that satisfies the enforced filename grammar and the project's PostgreSQL
conventions. If the target repository has a path-scoped migration rule, apply it as an additional overlay
(the rule reminds; this skill scaffolds).

> **Authority**: the project's `AGENTS.md` (Flyway section) is binding when present. Risk-review
> destructive/locking changes with `postgres-risk-check`; schema design with `postgres-schema-design`.
> Deep reference: [`reference/principles.md`](reference/principles.md) and [`reference/kb/`](reference/kb/INDEX.md).

## Where it goes / filename (build-validated)
- Versioned migrations live under a single canonical migration directory (e.g. `flyway/migration/postgresql/common/`); environment subfolders (`ci/dev/local/`) hold env overrides only.
- Filename: **`V{yyyyMMdd.HHmmss}__{description}.sql`** where `{description}` matches `[A-Za-z0-9_]{1,50}`.
  House style: `V{ts}__{domain}__{action}_{entity}.sql` (e.g. `V20260428.110000__order__create_table_order.sql`). Repeatable: `R__{desc}.sql`.

## Skeleton
```sql
-- V20260623.140000__order__create_table_order.sql
CREATE TABLE IF NOT EXISTS "order"."order" (
    order_id   varchar(126) NOT NULL,
    status     varchar(50)  NOT NULL,
    created_at timestamptz  NOT NULL,
    updated_at timestamptz  NOT NULL,
    CONSTRAINT pk_order_order PRIMARY KEY (order_id)
);
COMMENT ON TABLE "order"."order" IS '주문';
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_order_status ON "order"."order" (status);
```

## Rules (MUST)
- Schema-qualified table/index names; `CREATE TABLE/INDEX IF NOT EXISTS`. `CREATE INDEX CONCURRENTLY` is allowed (no transactional lock) — but it cannot run inside Flyway's transactional wrapper (see KB).
- Unique constraints are explicit and named `uq_<schema>_<t>_<cols>`. Dedup helpers can use an expression index (e.g. `md5(<expr>)`). Partial indexes use `... WHERE deleted = false`.
- Add `NOT NULL` in the safe 3 steps (add nullable → backfill in batches → set not null). Rich `COMMENT ON`. **No `CASCADE` drops.**

## Hard constraints (build fails / data risk)
- A filename violating the grammar fails the migration-file-name validation at build.
- An entity/column/index change MUST ship its migration in the **same** change ([`entity`](../entity/SKILL.md)).
- Large/locking changes (type change, `NOT NULL` on a big table, backfill) MUST go through `postgres-risk-check` first.

## Verify (build-system-agnostic)
Run Flyway info + validate via whatever build tool the project uses. Detect by lockfile/marker:

| Marker present | Flyway info | Flyway validate |
|---|---|---|
| `build.gradle`/`build.gradle.kts`/`gradlew` | `./gradlew flywayInfo` | `./gradlew flywayValidate` |
| `pom.xml` | `mvn flyway:info` | `mvn flyway:validate` |
| `package.json` (npm/pnpm/yarn) | `<pm> run flyway:info` (or `npx flyway info`) | `<pm> run flyway:validate` |
| standalone CLI | `flyway info` | `flyway validate` |

## Related
[`entity`](../entity/SKILL.md) · `postgres-risk-check` · `postgres-schema-design` · target-repository migration rules when present
