# e2e-evidence-report principles

1. **Evidence over assertion.** A green status is a claim; the recording, the capture and the database rows are the
   proof. A reviewer who did not run the test must be able to see what happened and what was stored.
2. **The database is the outcome.** For a case that persists data, the screen shows intent and the rows show the
   result. A matching screen with wrong rows is a failed case.
3. **Observe, never alter.** Verification queries are read-only, scoped to the case's own identifiers and run only
   against the run-owned database. A check that needs a write or a wide predicate is a missing test hook, not a query
   to improvise.
4. **One owner for the run.** Environment, execution, cleanup and verdict belong to `e2e-test-workflow`. This skill
   adds capture and reporting and never weakens a component rule to get more evidence.
5. **Temporary by default.** Evidence contains screens and rows from a test system; it lives in a fresh temporary
   directory, is masked twice, and is never committed.
6. **No upgrade.** Statuses flow from execution to report unchanged or worse. Missing evidence downgrades; it never
   becomes a pass.
