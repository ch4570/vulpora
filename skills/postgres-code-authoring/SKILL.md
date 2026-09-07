---
name: postgres-code-authoring
description: Write or modify PostgreSQL queries, schemas, and migrations with parameter safety, data integrity, and operational verification. Use when a feature, bug fix, or refactor in a repository detected as PostgreSQL requires SQL, DDL, indexes, or migrations, even when the user does not name the database; do not use for review-only requests.
---

# PostgreSQL code authoring

Inspect the target PostgreSQL version, schema, migration tool, existing SQL, and access pattern before drafting. Preserve repository conventions; do not invent table, column, index, or constraint names.

## Construction contract

- Parameterize runtime values; never concatenate user or variable data into SQL text.
- Write the smallest result shape needed: explicit columns, deterministic ordering where order matters, and pagination suited to the access pattern. Use keyset pagination for deep traversal when the existing contract permits it.
- Model integrity in DDL with the appropriate primary key, `NOT NULL`, `UNIQUE`, `CHECK`, and foreign-key constraints. Match column types, defaults, and nullability to the actual domain contract.
- For a migration, prefer compatible staged changes. State lock/transaction constraints, data backfill plan, rollback path, and verification for destructive, large-table, type, or constraint changes.
- Propose indexes from an observed query predicate/join/order pattern and verify performance with `EXPLAIN` or `EXPLAIN (ANALYZE, BUFFERS)` where safe. Never claim a query is faster without evidence.
- Author only; do not execute data or schema changes without separate authorization.

Read [query construction](reference/kb/query-construction.md) for query work and [migration construction](reference/kb/migration-construction.md) for DDL or migrations. The installed `postgres-query-review`, `postgres-schema-design`, and `postgres-risk-check` dependencies provide the shared review rationale; use them as construction constraints, not as a request to write a review.

## Deliverable

Return the SQL or migration, stated assumptions, verification commands/tests, and rollback/operational notes when applicable.
