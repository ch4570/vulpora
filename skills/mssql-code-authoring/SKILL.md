---
name: mssql-code-authoring
description: Write or modify Microsoft SQL Server and legacy MS-SQL queries, stored procedures, schemas, indexes, and migrations with version and compatibility-level gating, parameter safety, transaction correctness, and operational verification. Use when repository evidence shows SQL Server, T-SQL, Microsoft.Data.SqlClient, System.Data.SqlClient, mssql-jdbc, mssql, or tedious and the task changes a query, persistence path, database object, or migration. Do not use for review-only work or for PostgreSQL, MySQL, or generic ANSI SQL without SQL Server evidence.
---

# Microsoft SQL Server code authoring

Author T-SQL only inside the lowest feature set proven by the target engine, edition, database compatibility level,
and repository tooling. Treat an unknown legacy environment as a compatibility constraint, not permission to assume
the latest SQL Server behavior.

## Required preflight

**MSSQL-1 (Prove the target) — MUST.** Before drafting, inspect repository configuration and, when authorized DB
access exists, collect the read-only environment profile from
[legacy environment profile](reference/kb/legacy-environment-profile.md). Record:

- engine product version, edition, and deployment type (on-premises, VM, Managed Instance, or Azure SQL)
- database `compatibility_level` and collation
- `READ_COMMITTED_SNAPSHOT` / `SNAPSHOT` state and Query Store state
- migration runner and its batch semantics, including whether it understands `GO`
- affected objects, constraints, indexes, permissions, row counts, and representative access patterns

If any version-gated fact is unknown, avoid the gated feature or mark the SQL as a conditional alternative. Never
change compatibility level, isolation options, Query Store, server configuration, or edition-dependent behavior as
an incidental part of a feature.

## Construction contract

**MSSQL-2 (Repository truth) — MUST.** Preserve existing schema qualification, naming, collation, migration ordering,
stored-procedure conventions, and parameter types. Do not invent tables, columns, constraints, indexes, or production
cardinality.

**MSSQL-3 (Parameter safety) — MUST.** Bind every runtime value through the application driver or typed
`sp_executesql` parameters. Dynamic identifiers cannot be value parameters: select them from a closed allowlist and
apply `QUOTENAME`. Never concatenate user-controlled text into executable SQL.

**MSSQL-4 (Query shape) — MUST.** Select explicit columns, use deterministic ordering where order matters, match
parameter types to indexed columns, and keep predicates SARGable. Do not add `NOLOCK`, query hints, plan forcing, or
blanket recompilation as a speculative performance fix. Read
[query construction](reference/kb/query-construction.md).

**MSSQL-5 (Transaction correctness) — MUST.** Define transaction ownership, keep transactions short, handle errors
with `TRY...CATCH`, inspect `XACT_STATE()`, roll back owned or uncommittable work, and rethrow with `THROW` when the
proven version supports it. Treat row-versioned isolation changes and retry policy as architectural decisions. Read
[transactions and concurrency](reference/kb/transactions-and-concurrency.md).

**MSSQL-6 (Data semantics) — MUST.** Preserve existing types unless the task includes a compatible migration. For new
designs, use types that match the domain and proven version. `rowversion` is a binary concurrency token, not time;
`timestamp` is its deprecated synonym. Prefer explicit precision/scale and Unicode intent over implicit conversion.

**MSSQL-7 (Integrity) — MUST.** Put stable invariants in `PRIMARY KEY`, `UNIQUE`, `NOT NULL`, `CHECK`, and foreign-key
constraints where compatible with existing data and ownership. Discover duplicate, null, orphan, and invalid rows
before tightening a constraint.

**MSSQL-8 (Migration safety) — MUST.** Use expand/backfill/validate/contract stages for large or compatibility-sensitive
changes. State lock exposure, log growth, replication/CDC/temporal implications, edition/version gates, rollback or
roll-forward path, and verification. `ONLINE` or resumable index syntax is never assumed. Read
[schema and migration construction](reference/kb/schema-and-migration.md).

**MSSQL-9 (Plan-based performance) — MUST.** Propose an index or hint only from an observed predicate, join, ordering,
distribution, and execution-plan or Query Store signal. Measure logical reads, elapsed/CPU time, row estimates, and
representative parameter sets where safe. Never claim improvement from SQL text alone. Read
[performance and observability](reference/kb/performance-and-observability.md).

**MSSQL-10 (Legacy and security boundary) — MUST.** Keep least privilege, deprecated-feature inventory, support
lifecycle, and SQL Server versus Azure differences visible. Do not enable dangerous server features, cross-database
trust, or broad roles to make a script convenient. Read [security and legacy constraints](reference/kb/security-and-legacy.md).

**MSSQL-11 (Authoring is not execution) — MUST NOT.** Do not run DDL, DML, compatibility changes, index maintenance,
plan forcing, permission grants, or production diagnostics without separate authorization. Read-only metadata is
allowed only within the user's database scope.

## KB routing

Read [principles](reference/principles.md), then load only the matching KB topics from
[the KB index](reference/kb/INDEX.md). For cross-cutting changes, load every affected topic; do not recursively read
the entire KB by default.

## Deliverable

Return:

1. proven environment profile and explicit unknowns
2. T-SQL or migration with version/compatibility annotations where needed
3. parameter and transaction ownership contract
4. lock, log, index, permission, and rollout impact
5. focused validation using repository tests plus safe plan/Query Store checks
6. rollback or roll-forward procedure and residual legacy risks

Do not present conditional syntax as universally executable. Keep every performance, compatibility, and safety claim
tied to repository or database evidence.
