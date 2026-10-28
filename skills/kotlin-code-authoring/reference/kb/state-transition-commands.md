---
title: State-transition commands — idempotency and concurrent requests
source: https://www.rfc-editor.org/rfc/rfc9110#name-idempotent-methods
additional_sources:
  - https://jakarta.ee/specifications/persistence/3.1/
last_fetched: 2026-10-28
skills: [kotlin-code-authoring]
---

# State-transition commands: idempotency and concurrent requests

Use this when a change adds or alters a command that moves a persisted entity between states
(cancel, ship, approve, refund …), especially when the request says repeated requests must give the
same result or that concurrent requests must follow existing error rules.

RFC 9110 defines idempotency as the intended effect of several identical requests being the same as
one, and allows the responses to differ; it says nothing about how your server gets there. A request
that repeated calls return the *same result* is therefore stricter than HTTP idempotency. Jakarta Persistence optimistic locking
(`@Version`) detects a conflicting concurrent update at flush/commit and fails one of the transactions;
it does not decide which business result the loser should see. Both are inputs to a decision you make
and must state, not a guarantee you inherit.

## Analytic move: the transition × interleaving matrix

Build the matrix before writing code, from the entity's actual states and the repository's actual
concurrency mechanism (read them; do not assume a `@Version` field, lock mode, or error code exists).

1. **Rows — every (current state, command) pair**, including the target state itself
   (e.g. "already in the target state") and every new enum value against every *existing* command.
   Adding a state means each existing transition guard must be re-read for the new value.
2. **Columns — three timings for every pair of commands that can touch the same entity**,
   including the same command twice:
   - sequential (second starts after the first committed);
   - overlapping (both read the old state, then both write);
   - the reverse order of the two.
3. **Cell — the observable result** for each request: status code and error code from the existing
   error-mapping boundary, and the final persisted state.

Then check each requirement against the cells, not against the sequential column only:

- "Repeated requests give the same result" must hold in the **overlapping same-command** cell too.
  If the loser of an optimistic-lock conflict on a duplicate request gets a conflict error while the
  winner gets success, the results differ; either resolve it (e.g. on conflict, re-read and return the
  idempotent result when the entity is already in the target state, using only existing error codes)
  or state it explicitly as an open limitation. Do not claim idempotency without naming this cell.
- "Concurrent A and B follow existing error rules" means each overlapping cell maps to an
  **already existing** error code through the **existing** handler; name which one per cell.

## Artifact contract: what the answer must contain

- The matrix (or an equivalent list) with one line per cell, and which cells are resolved by code,
  which by an existing mechanism, and which are left open.
- For every behavior claim, the evidence level: *tested* (name the test), *mapped only* (a mocked
  exception proves the response mapping, not that the conflict occurs), or *reasoned* (no test).
  A mocked `ObjectOptimisticLockingFailureException` does not verify that two real transactions conflict.
- Persistence impact of a new state value: how the enum is stored (ordinal vs string), and whether
  a schema migration, column length, or DB check constraint must change. If the repository has no
  migration tooling, say so and say what a deployer must check.
- Every place that switches on the state (`when`, response mapping, queries filtering by status,
  downstream consumers) re-checked for the new value.

## Checklist

- [ ] Every (state, command) pair, including "already in target state" and new-state × existing commands, has a defined result.
- [ ] Overlapping same-command and overlapping cross-command cells each name the observable status/code and final state.
- [ ] The idempotency claim holds in the overlapping duplicate cell, or the gap is stated as a limitation.
- [ ] Only existing error codes and the existing error-mapping boundary are used.
- [ ] Each claim is labeled tested / mapped only / reasoned; no claim of verified concurrency rests on a mocked exception.
- [ ] Persistence of the new state value (enum storage, migration, constraint) is checked or flagged.
