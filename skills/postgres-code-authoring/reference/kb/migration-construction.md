---
title: PostgreSQL migration construction
source: https://www.postgresql.org/docs/current/ddl.html
last_fetched: 2026-08-25
skills: [postgres-code-authoring]
---

# PostgreSQL migration construction

PostgreSQL data definition covers table structure, defaults, identity, constraints, schemas, and table changes. Author migrations against the target version and existing migration tool, preserving domain integrity and explicitly planning riskier changes.

- Encode known domain invariants in primary-key, not-null, unique, check, and foreign-key constraints where the existing model permits them.
- Prefer additive or staged migrations when a change can lock, rewrite, backfill, or invalidate existing data. Do not conceal a destructive change behind a generic migration name.
- State any required backfill, deployment ordering, rollback/forward-fix strategy, and verification query/test.
- Follow the repository's transaction and concurrent-index conventions; do not assume every DDL statement has the same transaction or lock behavior.

## 리뷰 훅

- [ ] Table, column, type, default, and constraint names come from schema evidence.
- [ ] The migration preserves or deliberately changes each relevant domain invariant.
- [ ] Large/destructive changes include staging, rollback/forward-fix, and verification notes.
- [ ] The migration matches the target PostgreSQL version and local migration-tool convention.
