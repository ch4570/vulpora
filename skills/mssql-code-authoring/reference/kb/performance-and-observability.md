# Performance and observability

## Official sources

- [Display and save execution plans](https://learn.microsoft.com/en-us/sql/relational-databases/performance/display-and-save-execution-plans?view=sql-server-ver17)
- [Query processing architecture](https://learn.microsoft.com/en-us/sql/relational-databases/query-processing-architecture-guide?view=sql-server-ver17)
- [Statistics](https://learn.microsoft.com/en-us/sql/relational-databases/statistics/statistics?view=sql-server-ver17)
- [Query Store best practices](https://learn.microsoft.com/en-us/sql/relational-databases/performance/manage-the-query-store?view=sql-server-ver17)
- [Query Store usage scenarios](https://learn.microsoft.com/en-us/sql/relational-databases/performance/query-store-usage-scenarios?view=sql-server-ver17)
- [Parameter Sensitive Plan optimization](https://learn.microsoft.com/en-us/sql/relational-databases/performance/parameter-sensitive-plan-optimization?view=sql-server-ver17)

## Evidence before change

Capture the proven server/compatibility profile plus:

- normalized query text, parameter types, representative common and skewed values
- estimated and, only where authorized and safe, actual execution plan
- estimated versus actual rows, access methods, residual predicates, lookups, spills, sorts, and warnings
- logical reads, CPU, elapsed time, returned rows, concurrency, and cache state
- current indexes/statistics and Query Store history when available

An estimated plan can reveal shape but not runtime row counts or spills. An actual plan executes the query; never
collect it against a mutating or expensive production statement without authority.

## Tuning order

1. Fix correctness, result shape, parameter metadata, implicit conversions, and non-SARGable predicates.
2. Verify statistics freshness and distribution rather than issuing blanket updates.
3. Compare representative parameter families for sensitivity/plan reuse.
4. Change query or index shape with measured before/after evidence.
5. Use hints, forcing, or database-scoped settings only as a bounded last resort with rollback.

Do not treat missing-index DMVs, graphical plan cost percentages, or one warm-cache timing as a complete decision.
Every index adds storage, maintenance, logging, and write cost.

## Query Store and parameter sensitivity

- Verify Query Store state, capture policy, retention, and size. A READ_ONLY store or saturated quota makes current
  regression conclusions incomplete.
- Use Query Store to compare plan/runtime history and validate a change; do not force a plan merely because it was
  once faster.
- Parameter sniffing is normal compilation behavior. Diagnose skew and plan reuse before choosing `RECOMPILE`,
  `OPTIMIZE FOR`, parameter-sniffing disablement, or plan forcing.
- Parameter Sensitive Plan optimization and Query Store hints are version/compatibility-gated. Never recommend them
  to a legacy database without proving support.

## Verification matrix

Compare correctness and performance across small/large/skewed inputs, cold/warm cache where meaningful, concurrent
load, and rollback. Report raw measurements and environment; never claim production improvement from a development
plan alone.
