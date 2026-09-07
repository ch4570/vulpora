---
name: postgres-query-review
description: >-
  Review PostgreSQL queries (SQL) from performance and correctness angles.
  Inspect execution-plan interpretation, index usability, join method/order,
  sort/aggregate cost, pagination, parameter binding, and anti-patterns. Use when
  writing/modifying SQL or diagnosing slow queries. Applies the principles of
  "Friendly SQL Tuning", verified against the official PostgreSQL documentation.
---

# PostgreSQL Query Review

Official PostgreSQL `Performance Tips`/`Indexes` docs + query-tuning insights.
For the underlying principles, see `reference/principles.md`.

## Review order (proceed exactly like this)

1. **Understand what the query is asking** (result set, cardinality, frequency: OLTP vs batch).
2. **Look at the execution plan.** `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)` — for detailed interpretation see
   `reference/kb/execution-plan.md`.
3. **Inspect index usability** — `reference/kb/index-tuning.md`.
4. **Inspect join method/order** — `reference/kb/join-tuning.md`.
5. **Scan for anti-patterns** — `reference/kb/sql-antipatterns.md`.
6. Present a **fix + re-measurement method** together with severity.

## Quick checklist (HIGH-and-above candidates)

- [ ] **Is there an index on the WHERE/JOIN/ORDER BY columns?** If not, full scan.
- [ ] **Is the leading column not transformed?** `WHERE lower(col)=`, `WHERE col::text=`,
      `WHERE date(ts)=`, `WHERE col + 0 =` → disables the index. Use an expression index or transform the constant side.
- [ ] **Do the types match?** Column/parameter type mismatch → casting bypasses the index.
- [ ] **Is `SELECT *` not overused?** Only needed columns → covering-index / Index-Only Scan opportunity.
- [ ] **Is there an unnecessary `DISTINCT`/`ORDER BY`/`UNION`?** `UNION`→`UNION ALL` (when no duplicates).
- [ ] **Is pagination using a large `OFFSET`?** → consider keyset (cursor) pagination.
- [ ] **Correlated subquery / N+1**: is a query being executed repeatedly inside a loop? Use a join/batch.
- [ ] **Function calls**: if a function used in WHERE is `VOLATILE`, indexing/caching is impossible. Verify `IMMUTABLE`/`STABLE`.
- [ ] **Are you using parameter binding?** String concatenation is injection + hard parsing. Always use a placeholder.
- [ ] **Are you reading the entire large result?** Can it be handled as a partial range via Top-N (`ORDER BY ... LIMIT`)?

## Execution-plan warning signs (in EXPLAIN ANALYZE)

- **Estimated vs actual row-count divergence** (`rows=10` but `actual rows=100000`) → stale statistics/correlation.
  `ANALYZE` or `CREATE STATISTICS`.
- **`Seq Scan` on a large table** + a highly selective filter → missing/disabled index.
- **`Sort Method: external merge Disk`** → insufficient `work_mem` or an unnecessary sort.
- **`Nested Loop` but the inner side iterates massively** → a hash join may be better (check statistics/join key).
- **`Rows Removed by Filter` is large** → the index can't filter and rows are discarded from the table (access condition vs filter condition).
- **`Heap Fetches` is large** (Index-Only Scan) → VACUUM needed (visibility map).

## Deliverables

For each finding: problem → violated principle (principles.md §) / EXPLAIN evidence → fixed SQL → re-measurement command.
A claim that "it improved" is confirmed only by a **before/after `EXPLAIN ANALYZE` comparison**.

## KB (official PostgreSQL docs — read and cite first)
From `reference/kb/INDEX.md`, pick and read the KB matching the task type, inspect using each KB's `## Review hooks`, and
cite with the `source` URL.
- `reference/kb/execution-plan.md` — how to read execution plans, per-node meaning, diagnostic queries
- `reference/kb/index-tuning.md` — index selection/order/type, disabling patterns
- `reference/kb/join-tuning.md` — NL/Merge/Hash, subquery/semi-/anti-join
- `reference/kb/sql-antipatterns.md` — common anti-patterns and PG prescriptions
- Higher-level judgment criteria: `reference/principles.md`
