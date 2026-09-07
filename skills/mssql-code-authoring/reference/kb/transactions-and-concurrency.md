# Transactions and concurrency

## Official sources

- [Transaction locking and row versioning guide](https://learn.microsoft.com/en-us/sql/relational-databases/sql-server-transaction-locking-and-row-versioning-guide?view=sql-server-ver17)
- [TRY...CATCH](https://learn.microsoft.com/en-us/sql/t-sql/language-elements/try-catch-transact-sql?view=sql-server-ver17)
- [XACT_STATE](https://learn.microsoft.com/en-us/sql/t-sql/functions/xact-state-transact-sql?view=sql-server-ver17)
- [SET XACT_ABORT](https://learn.microsoft.com/en-us/sql/t-sql/statements/set-xact-abort-transact-sql?view=sql-server-ver17)
- [THROW](https://learn.microsoft.com/en-us/sql/t-sql/language-elements/throw-transact-sql?view=sql-server-ver17)
- [Deadlocks guide](https://learn.microsoft.com/en-us/sql/relational-databases/sql-server-deadlocks-guide?view=sql-server-ver17)

## Transaction ownership

- State whether the application, stored procedure, or migration owns the transaction. Do not blindly commit or roll
  back a caller-owned transaction.
- Start the transaction only after inputs and required reads are known. Keep network calls, user interaction, file
  access, and slow computation outside it.
- For an owned data-changing batch, prefer `SET XACT_ABORT ON`, `TRY...CATCH`, an `XACT_STATE()` decision, rollback on
  failure, and `THROW` to preserve the error when supported by the proven version.
- An `XACT_STATE()` value of `-1` is uncommittable and can only be rolled back. A value of `1` is committable; commit
  it only when the unit owns the transaction and every invariant passed. A value of `0` has no active transaction.
- Account for `@@TRANCOUNT`, savepoints, triggers, and framework-managed transactions before publishing a stored
  procedure template.

## Locking and isolation

- Use the least strict isolation level that preserves the business invariant. Do not treat lower isolation as a
  generic speed switch.
- Maintain a consistent table/row access order across competing write paths to reduce deadlocks.
- Keep predicates selective and indexed so the engine touches fewer rows and locks fewer resources.
- Treat `READ_COMMITTED_SNAPSHOT` and `ALLOW_SNAPSHOT_ISOLATION` as database-wide operational changes. Require DBA
  approval, version-store capacity evidence, workload tests, and rollback; do not enable them inside a feature script.
- Avoid `HOLDLOCK`, `SERIALIZABLE`, `UPDLOCK`, or row/page forcing until the exact lost-update or race invariant and
  affected plan are demonstrated.

## Optimistic concurrency and retries

- Use a `rowversion` predicate or an equivalent domain version to detect lost updates when the repository contract
  supports optimistic concurrency. Check the affected-row count and return a conflict, not silent success.
- Retry only transient deadlock victims at an application boundary that can replay the complete idempotent unit.
  Bound attempts and jitter; never retry an unknown partial side effect.
- Capture the deadlock graph or equivalent evidence before changing lock hints or isolation.

## Verification

Exercise concurrent writers, lost-update detection, deadlock order, error paths, nested transaction ownership, and
connection-pool reuse. Confirm no failed batch leaves an open or uncommittable transaction on the session.
