---
name: postgres-review-workflow
description: >-
  Run all PostgreSQL query, migration-risk, and schema-design skills plus operational DBA and data
  modeling reviewers, then reconcile their advice. Use for SQL, DDL, migrations, data models,
  performance incidents, or database changes that need one deployability-aware verdict.
---

# PostgreSQL Review Workflow

Run the complete PostgreSQL skill family and both mandatory database agents against one source
snapshot. Reconcile logical model quality with real PostgreSQL operational behavior.

## Declared inventory and dependencies

Runnable skills, exactly:

- `postgres-query-review`
- `postgres-risk-check`
- `postgres-schema-design`

Mandatory agents:

- `postgres-dba`
- `data-modeling-reviewer`

Exclude the orchestrator ID `postgres-review-workflow` from recursive component execution.

## Cost-aware native routing

Resolve portable profiles from the current runtime capability catalog at dispatch. Use query and
schema skill passes at `frugal/low` for bounded static changes; use migration risk, DBA, and data
modeling passes at `standard/medium` when operational or semantic judgment is required. Raise only
the affected pass to `frontier/high` for confirmed corruption, irreversible migration, authority,
or public-contract risk.

Every native handoff uses `model_selection: explicit-native-override`; spawn with `fork_turns: none`,
the exact resolved `model`, and exact `reasoning_effort`. Never inherit the primary model or reasoning
setting. Record requested/observed routes in the five-entry ledger and make mismatch `INCOMPLETE`.
Timeout, quota, authentication, and absent database access are not capability escalation signals.

## Input contract

Accept the repository/diff scope plus available SQL, DDL/migrations, schema metadata, PostgreSQL
version, table/index sizes, row counts, query frequency, `EXPLAIN (ANALYZE, BUFFERS)` output,
deployment window, replication topology, and rollback constraints. State assumptions and preserve
the target revision. Never execute mutating SQL against a live database as part of review.

## Workflow

### 1. Inventory and preflight

Discover canonical frontmatter skill IDs matching `postgres-*`, remove exactly
`postgres-review-workflow`, and compare the sorted set with the three declared runnable skills.
Stop before review on an extra or missing ID, and report `INVENTORY_MISMATCH` or
`MISSING_DEPENDENCY`. Verify both mandatory agents by exact ID.

The canonical catalog is the host runtime's **effective discovered skill set after its normal
precedence rules**, limited to discovery roots active for this target. Do not scan unrelated home or
repository paths. If the host cannot identify that effective set, or the same ID resolves to
ambiguous definitions, stop with `CATALOG_UNAVAILABLE` or `AMBIGUOUS_DEPENDENCY`.

Classify the scope as query, logical/physical schema, migration/backfill, or a combination. Every
mandatory dependency still runs; irrelevant areas return evidence-backed `NOT_APPLICABLE`.

### 2. Parallel specialist pass

Run at most four dependencies concurrently; start the fifth when a slot opens. Supply one frozen
scope to all runs. Require severity, confidence, SQL/artifact location, evidence, impact,
recommendation, rollback/deploy notes, and verification.

- Query review owns SQL correctness, plans, index usability, joins, sorting, pagination, and
  before/after measurement.
- Risk check owns locks, rewrites, transaction size, concurrency, timeouts, rollback, and downtime.
- Schema design owns constraints, types, normalization, keys, relationships, and history modeling.
- `postgres-dba` owns PostgreSQL operational feasibility and production safety.
- `data-modeling-reviewer` owns semantic correctness, cardinality, business keys, temporal meaning,
  redundancy, and conceptual/logical model quality.

### 3. Reconcile operational and modeling advice

Deduplicate only findings with the same database object or SQL location and root cause. Preserve
every contributor and the strongest supported severity.

For every recommendation that changes the model, record both views:

- **Modeling effect:** integrity, semantics, cardinality, normalization, redundancy, evolvability
- **Operational effect:** lock level, rewrite/scan, index build, WAL/replication, bloat, latency,
  deployment sequence, rollback, and maintenance window

Do not let a clean target model justify unsafe one-step DDL. Do not let migration convenience erase
required integrity. When advice conflicts, produce a staged target-state migration that preserves
meaning while using safe PostgreSQL primitives; otherwise mark the conflict unresolved. Never
claim performance improvement without before/after plan or measurement evidence.

### 4. Verdict

- `INCOMPLETE`: any mandatory dependency failed, timed out, or returned unusable output
- `BLOCK`: supported CRITICAL safety, corruption, integrity, or irreversible rollout risk
- `CHANGES_REQUIRED`: no CRITICAL finding and at least one supported HIGH finding
- `WARNING`: only MEDIUM/LOW findings
- `APPROVE`: all five dependencies completed and no supported finding remains

Unknown production size or absent plans lower confidence and may make deployability conditional;
they do not justify guessing.

Normalize supported severities to `CRITICAL|HIGH|MEDIUM|LOW|NONE` while retaining each contributor's
original label. When the verdict is `INCOMPLETE` but a completed pass found a supported CRITICAL,
keep `INCOMPLETE` as the terminal verdict and add `blocking_finding_present: true`; never hide the
known blocker behind the coverage failure.

## Output contract

Return:

1. scope, PostgreSQL version, revision, assumptions, and evidence availability
2. declared/discovered skill inventory and five-entry run ledger
3. aggregate verdict
4. unified findings with exact objects/locations, contributors, evidence, and dissent
5. reconciliation matrix: modeling target | operational risk | safe staged action | rollback |
   verification
6. corrected SQL/DDL proposals without applying them
7. before/after EXPLAIN plan, lock/concurrency, integrity, and rollout verification checklist
8. coverage gaps and next actions

## Failure and partial-result semantics

- Inventory mismatch stops all component execution; complete-family coverage is part of the
  contract.
- Preserve successful outputs after a runtime failure, but return `INCOMPLETE`; never approve four
  out of five reviews.
- Treat unavailable database access as an explicit static-only limitation. Do not run destructive
  probes to fill the gap.
- Mark results `STALE` if the migration/schema revision changes during the run.
- Retry malformed output once with the contract restated; retain the failed dependency and gap if
  it remains unusable.
