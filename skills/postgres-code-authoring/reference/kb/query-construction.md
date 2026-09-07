---
title: PostgreSQL query construction
source: https://www.postgresql.org/docs/current/using-explain.html
last_fetched: 2026-08-25
skills: [postgres-code-authoring]
---

# PostgreSQL query construction

PostgreSQL plans each query according to its structure and data properties; `EXPLAIN` exposes the plan used for a query. Draft SQL with explicit result, predicate, join, ordering, and parameter contracts, then verify consequential performance choices against the plan rather than guessing.

- Bind runtime values with the target driver's placeholders; do not interpolate values into SQL text.
- Select required columns and use a deterministic `ORDER BY` before a caller-visible limit or cursor.
- Base index proposals on observed `WHERE`, join, and ordering patterns. A plan can use index conditions, filters, scans, joins, and sorts differently as cardinality changes.
- Treat `EXPLAIN ANALYZE` as an operational action: use it only when the target and authorization make execution safe.

## 리뷰 훅

- [ ] SQL values are bound, and identifiers were verified from schema evidence.
- [ ] Result columns, order, and pagination are explicit where the caller depends on them.
- [ ] Index or performance changes name the observed access pattern and a plan/measurement check.
- [ ] No performance outcome is asserted without before/after evidence.
