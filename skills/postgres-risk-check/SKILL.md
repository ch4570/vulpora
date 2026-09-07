---
name: postgres-risk-check
description: >-
  Check the risk of a PostgreSQL change (migration/DDL/bulk DML). Inspect DDL lock
  levels, zero-downtime change patterns (CONCURRENTLY, NOT VALID→VALIDATE), chunking
  of large backfills, transactions/concurrency/deadlocks, lock/statement timeout,
  bloat/VACUUM, and rollback/downtime. Use PROACTIVELY when authoring/reviewing a
  migration, before a production deploy, or for destructive changes such as DROP/type change.
---

# PostgreSQL Change Risk Check

PostgreSQL `MVCC`/`Explicit Locking`/`ALTER TABLE` official docs + DML/lock/concurrency insights.
For the underlying principles, see `reference/principles.md`.

## When to block (CRITICAL)

The following carry **production-incident risk**, so block them until they are switched to a safe pattern.

- A plain `CREATE INDEX` on a large table (= write-blocking) — use `CONCURRENTLY`.
- `ALTER TABLE ... ADD COLUMN ... NOT NULL` on a large table (scan/rewrite), or
  adding a column with a volatile `DEFAULT` (table rewrite).
- `ALTER COLUMN TYPE` on a large table (full table rewrite + long-held `ACCESS EXCLUSIVE` lock).
- Adding a validated constraint (FK/CHECK) in one step — do it in two steps, `NOT VALID` → `VALIDATE`.
- `UPDATE`/`DELETE` of millions of rows in a single transaction (lock/WAL/rollback/bloat explosion) — chunk it.
- Production DDL without `lock_timeout` — the lock queue blocks every transaction behind it (a headline-incident pattern).

## Check procedure

1. **Classify the change type**: index / column / constraint / type / data backfill / DROP.
2. **Confirm the lock level** — the table in `reference/kb/migration-safety.md`.
3. **Rewrite into a safe pattern** (core patterns below).
4. **Review concurrency/deadlocks** — `reference/kb/locking-concurrency.md`.
5. **State the rollback strategy + whether there is downtime + post-change ANALYZE/VACUUM**.

## Core safe patterns (copy-paste)

```sql
-- 0) Always set timeouts first (prevents a lock storm)
SET lock_timeout = '3s';
SET statement_timeout = '0';   -- manage separately for the migration body if needed

-- 1) Index: CONCURRENTLY outside a transaction (the migration tool's non-transactional mode)
CREATE INDEX CONCURRENTLY ix_orders_customer_id ON orders (customer_id);

-- 2) Adding NOT NULL: CHECK NOT VALID → VALIDATE → SET NOT NULL (PG12+)
ALTER TABLE orders ADD CONSTRAINT ck_orders_cust_nn CHECK (customer_id IS NOT NULL) NOT VALID;
ALTER TABLE orders VALIDATE CONSTRAINT ck_orders_cust_nn;   -- weak lock, full scan but writes allowed
ALTER TABLE orders ALTER COLUMN customer_id SET NOT NULL;   -- PG12+ is fast based on the CHECK above

-- 3) Adding an FK: NOT VALID then VALIDATE
ALTER TABLE orders ADD CONSTRAINT fk_orders_customer
  FOREIGN KEY (customer_id) REFERENCES customers(id) NOT VALID;
ALTER TABLE orders VALIDATE CONSTRAINT fk_orders_customer;

-- 4) Adding a column: a constant DEFAULT is instant on PG11+ (metadata). Separate out a volatile DEFAULT
ALTER TABLE orders ADD COLUMN note text;                    -- fast
-- Separate the fill into a backfill (below)

-- 5) Large backfill: chunk + split commits (no single transaction)
--   Loop over key ranges (in the application/migration loop)
UPDATE orders SET note = '...' WHERE id BETWEEN $lo AND $hi;  -- batch size 10k–50k
```

## Deliverables

- Per change: **lock level / expected impact (whether writes are blocked, whether a rewrite occurs) / safe alternative / rollback / post-work**.
- Make clear whether it is "zero-downtime capable" or "needs a short maintenance window".

## KB (PostgreSQL official docs — read and cite first)
From `reference/kb/INDEX.md`, pick and read the KB matching the work type, check against each KB's `## Review hooks`,
and cite the `source` URL.
- `reference/kb/migration-safety.md` — lock level/rewrite per change type, CONCURRENTLY, NOT VALID→VALIDATE,
  zero-downtime type change, backfill loop, per-tool caveats (Alembic/Flyway/Django, etc.)
- `reference/kb/locking-concurrency.md` — MVCC operations, isolation levels/retry (40001), row/advisory locks, deadlocks,
  diagnostic queries, bloat/VACUUM/wraparound
- Higher-level judgment criteria: `reference/principles.md`
