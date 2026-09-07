# Microsoft SQL Server authoring principles

## Official sources

- [Compatibility certification](https://learn.microsoft.com/en-us/sql/database-engine/install-windows/compatibility-certification?view=sql-server-ver17)
- [ALTER DATABASE compatibility level](https://learn.microsoft.com/en-us/sql/t-sql/statements/alter-database-transact-sql-compatibility-level?view=sql-server-ver17)
- [Transaction locking and row versioning guide](https://learn.microsoft.com/en-us/sql/relational-databases/sql-server-transaction-locking-and-row-versioning-guide?view=sql-server-ver17)
- [Index architecture and design guide](https://learn.microsoft.com/en-us/sql/relational-databases/sql-server-index-design-guide?view=sql-server-ver17)
- [Query processing architecture guide](https://learn.microsoft.com/en-us/sql/relational-databases/query-processing-architecture-guide?view=sql-server-ver17)
- [Manage Query Store](https://learn.microsoft.com/en-us/sql/relational-databases/performance/manage-the-query-store?view=sql-server-ver17)
- [Secure SQL Server](https://learn.microsoft.com/en-us/sql/relational-databases/security/secure-sql-server?view=sql-server-ver17)
- [SQL Server end-of-support options](https://learn.microsoft.com/en-us/sql/sql-server/end-of-support/sql-server-end-of-support-overview?view=sql-server-ver17)

## Principles

1. Prove engine version, edition, compatibility level, and database options before choosing syntax or operational
   behavior.
2. Preserve correctness and recovery paths before optimizing legacy SQL.
3. Parameterize values and keep privilege boundaries narrow.
4. Treat locking, log growth, statistics, plan cache, and Query Store as observable runtime state, not assumptions.
5. Separate authoring from execution; a valid script is not authorization to change a database.
6. Prefer staged, reversible change over a clever one-shot migration.
7. Keep unsupported, deprecated, and Azure-only/on-premises-only differences explicit.

Official sources were last verified on 2026-08-31. Recheck them when the target SQL Server major version, edition,
compatibility level, or Microsoft support guidance changes.
