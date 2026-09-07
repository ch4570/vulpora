# Schema and migration construction

## Official sources

- [CREATE INDEX](https://learn.microsoft.com/en-us/sql/t-sql/statements/create-index-transact-sql?view=sql-server-ver17)
- [Online index operation guidelines](https://learn.microsoft.com/en-us/sql/relational-databases/indexes/guidelines-for-online-index-operations?view=sql-server-ver17)
- [Index architecture and design guide](https://learn.microsoft.com/en-us/sql/relational-databases/sql-server-index-design-guide?view=sql-server-ver17)
- [Create check constraints](https://learn.microsoft.com/en-us/sql/relational-databases/tables/create-check-constraints?view=sql-server-ver17)
- [Disable foreign-key constraints](https://learn.microsoft.com/en-us/sql/relational-databases/tables/disable-foreign-key-constraints-with-insert-and-update-statements?view=sql-server-ver17)

## Migration shape

For large, busy, or poorly characterized tables, prefer:

1. **Expand:** add a nullable column/object or compatible parallel path with explicit names.
2. **Backfill:** update bounded batches using a deterministic key; monitor transaction log, blocking, and replication.
3. **Validate:** prove null/duplicate/orphan/domain counts and application dual-read/write behavior.
4. **Constrain:** add or trust constraints only after existing rows pass.
5. **Contract:** remove the old object in a later deploy after consumers and rollback windows expire.

Do not combine destructive cleanup with the compatibility bridge in one irreversible step.

## DDL rules

- Schema-qualify objects and explicitly name constraints so later migrations can address them deterministically.
- Inspect existing default constraints before changing a column; SQL Server often requires dropping the named default
  constraint before altering or dropping the column.
- Before `NOT NULL`, `UNIQUE`, `CHECK`, or foreign-key enforcement, provide read-only discovery queries for violating
  rows and a deterministic remediation policy.
- Do not leave a constraint untrusted after using `WITH NOCHECK`. Revalidation and trust state are part of completion.
- Treat computed-column determinism, indexed views, partitioning, temporal tables, CDC, replication, triggers, and
  schema binding as explicit migration dependencies.
- Gate `ONLINE`, `RESUMABLE`, low-priority waits, and compression on exact engine/edition support. Online operations
  still take locks in preparation/final phases and can block.
- Treat a large index build, column rewrite, or backfill as a log- and capacity-sensitive operation. State recovery
  model implications, batch size, pause/abort signal, and monitoring.
- Use `GO` only if the actual migration runner supports client batches. Never assume SSMS semantics inside JDBC,
  ADO.NET, Flyway, Liquibase, or a custom runner.

## Index construction

- Derive key order from equality predicates, ranges, joins, and ordering. Put payload-only columns in `INCLUDE` where
  covering benefit outweighs write/storage cost.
- Consider a filtered index only when the stable predicate selects a small subset and parameterization can match the
  filter. Record its filter semantics and null behavior.
- Preserve uniqueness as a constraint/index contract, not an optimizer suggestion.
- Avoid duplicate/overlapping indexes. Include existing clustered-key propagation and write amplification in the
  decision.

## Rollback and verification

Specify whether rollback is transactional, restore-based, or forward-only. Back up data before destructive change
when required by policy. Verify schema metadata, trusted constraints, row counts/checksums, application compatibility,
plans, blocking, log use, replication/CDC health, and rollback on a production-like dataset.
