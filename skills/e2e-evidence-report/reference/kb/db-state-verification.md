---
title: Read-only database state verification for E2E cases
source: https://www.postgresql.org/docs/current/sql-set-transaction.html
additional_sources:
  - https://dev.mysql.com/doc/refman/8.4/en/set-transaction.html
last_fetched: 2026-10-28
skills: [e2e-evidence-report]
---

# Read-only database state verification for E2E cases

Use this when a TC's outcome is persisted. The query proves what the case stored; it must not be able to change it.

## Where to query

- Only the database container the workflow's `environment.json` lists as run-owned. Connect through its mapped
  endpoint or `docker exec` into that exact container ID. A shared, staging or production URL, or a database the run
  did not create, means the check is `NOT_RUN`.
- Use the credentials the run created for the test database. Never read credentials from the user's environment,
  home directory or the application's production configuration.

## How to query

- Open a read-only transaction: PostgreSQL `BEGIN TRANSACTION READ ONLY;` (or `SET TRANSACTION READ ONLY` as the
  first statement), MySQL `START TRANSACTION READ ONLY;`. Roll back at the end.
- One `SELECT` or `WITH … SELECT` per check. No `FOR UPDATE`/`FOR SHARE`, no function that writes, no DDL.
- Scope by the case's run-namespace identifiers in the `WHERE` clause (the IDs from the case's data manifest).
  Never select a whole table to "find" the row.
- Select only the columns the TC's expectation names, and cap rows (`LIMIT 50`).
- Run it after the case's action and before its cleanup. Poll with a bounded deadline only when the write is
  asynchronous, and record the attempts.

## What to record

The query text, the expectation in words, the returned rows (masked), and `PASS`/`FAIL`. Expectations cover what
must exist, what must have changed, and what must stay untouched (e.g. no second row for a duplicate request).

## 리뷰 훅

- [ ] The target database is the run-owned container from `environment.json`.
- [ ] Every query runs in a read-only transaction, is a single SELECT, and has the case identifiers in its predicate.
- [ ] Rows are capped and masked before they enter `evidence.json`.
- [ ] A failed or missing DB check keeps the case from `PASS`.
