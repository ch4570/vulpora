# Legacy environment profile

## Official sources

- [SERVERPROPERTY](https://learn.microsoft.com/en-us/sql/t-sql/functions/serverproperty-transact-sql?view=sql-server-ver17)
- [sys.databases](https://learn.microsoft.com/en-us/sql/relational-databases/system-catalog-views/sys-databases-transact-sql?view=sql-server-ver17)
- [Query Store catalog views](https://learn.microsoft.com/en-us/sql/relational-databases/system-catalog-views/query-store-catalog-views-transact-sql?view=sql-server-ver17)
- [View or change compatibility level](https://learn.microsoft.com/en-us/sql/relational-databases/databases/view-or-change-the-compatibility-level-of-a-database?view=sql-server-ver17)
- [Compatibility certification](https://learn.microsoft.com/en-us/sql/database-engine/install-windows/compatibility-certification?view=sql-server-ver17)

## Evidence order

1. Inspect repository drivers, ORM dialect, connection settings, migration tool, SQL files, stored procedures, and
   CI/test database image. These prove intended support but not the live database.
2. If authorized read-only access exists, query metadata in the target database. Do not enumerate other databases or
   server secrets.
3. Record conflicts between repository and live evidence instead of choosing the newer value.

Use a bounded metadata probe such as:

```sql
SELECT
    CAST(SERVERPROPERTY('ProductVersion') AS nvarchar(128)) AS product_version,
    CAST(SERVERPROPERTY('ProductLevel') AS nvarchar(128)) AS product_level,
    CAST(SERVERPROPERTY('Edition') AS nvarchar(128)) AS edition,
    CAST(SERVERPROPERTY('EngineEdition') AS int) AS engine_edition;

SELECT
    d.name,
    d.compatibility_level,
    d.collation_name,
    d.is_read_committed_snapshot_on,
    d.snapshot_isolation_state_desc,
    d.recovery_model_desc
FROM sys.databases AS d
WHERE d.database_id = DB_ID();

SELECT
    actual_state_desc,
    desired_state_desc,
    readonly_reason,
    current_storage_size_mb,
    max_storage_size_mb
FROM sys.database_query_store_options;
```

If a catalog view or column is unavailable on the proven legacy version, omit that probe and record `UNAVAILABLE`;
do not replace it with broad server access.

## Feature floor

- Engine version controls whether a feature exists.
- Database compatibility level controls many optimizer and T-SQL behaviors, but it does not emulate a different
  engine and does not protect every discontinued feature.
- Edition and deployment control operational capabilities such as online/resumable index operations and server-level
  permissions.
- Collation affects comparison, sorting, case/accent sensitivity, and implicit conversion. Preserve explicit
  cross-database collation handling already required by the repository.
- Migration tool controls whether `GO`, transactional DDL, repeatable scripts, and statement delimiters are valid.

Never raise compatibility level or switch isolation/Query Store options as a side effect. Produce a separate,
benchmarked, reversible proposal when such a change is actually requested.
