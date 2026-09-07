# Microsoft SQL Server Code Authoring KB — INDEX

## Task signal → KB

| Task signal | Read | Covers |
|---|---|---|
| unknown/legacy server, compatibility level, collation, edition | [legacy environment profile](legacy-environment-profile.md) | read-only evidence, feature floor, deployment differences |
| SELECT/JOIN/filter/sort/pagination/dynamic SQL/data type | [query construction](query-construction.md) | parameters, SARGability, deterministic result shape, type semantics |
| transaction, stored procedure, lock, deadlock, concurrency token | [transactions and concurrency](transactions-and-concurrency.md) | transaction ownership, `XACT_STATE`, isolation, retries |
| CREATE/ALTER/DROP, constraint, index, backfill, migration | [schema and migration](schema-and-migration.md) | staged DDL, locks/log, edition gates, rollback |
| slow query, execution plan, statistics, Query Store, parameter sniffing | [performance and observability](performance-and-observability.md) | evidence-led tuning and regression verification |
| permissions, injection, deprecated feature, upgrade, linked server | [security and legacy](security-and-legacy.md) | least privilege, support lifecycle, high-risk legacy surfaces |

## Shared rules

- Read [principles](../principles.md) first.
- Repository conventions and proven target metadata outrank generic examples.
- Load all affected topics for cross-cutting changes, but do not load unrelated KB files.
- Treat every Microsoft Learn feature statement as version/edition scoped; follow its current **Applies to** section.
