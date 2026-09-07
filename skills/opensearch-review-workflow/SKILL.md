---
name: opensearch-review-workflow
description: >-
  Run the complete OpenSearch review suite for queries, mappings, vector/search tuning, and
  operational safety, then synthesize one evidence-based verdict. Use for OpenSearch or
  Elasticsearch-compatible index, query, migration, relevance, capacity, or performance changes.
---

# OpenSearch Review Workflow

Apply every catalog skill whose ID starts with `opensearch-`, excluding this orchestration skill,
and fail closed when the inventory changes.

## Declared inventory and dependencies

Runnable skills, exactly:

- `opensearch-optimization`
- `opensearch-query-review`
- `opensearch-schema-review`

Optional synthesis agent: `opensearch-expert`.

`opensearch-review-workflow` is the orchestrator and is never recursively invoked as a component.

## Cost-aware native routing

Resolve portable profiles from the current runtime capability catalog at dispatch. Use the three
mandatory skill passes at `frugal/low` for a bounded static diff, promote only the affected query,
schema, or optimization pass to `standard/medium` for cross-index or rollout reasoning, and use the
optional `opensearch-expert=standard/medium` only when specialist evidence conflicts. Reserve
`frontier/high` for confirmed irreversible data or public compatibility risk.

Every native handoff uses `model_selection: explicit-native-override`; spawn with `fork_turns: none`,
the exact resolved `model`, and exact `reasoning_effort`. Never inherit the primary model or reasoning
setting. Persist requested/observed routes in the ledger and reject mismatch. Timeout, quota,
authentication, and missing cluster access do not justify a larger model.

## Input contract

Accept a repository/diff scope and any supplied mappings, templates, settings, queries, pipelines,
traffic/latency/recall measurements, cluster topology, version, and rollout constraints. Derive
missing artifacts from the repository when safe. Label unavailable runtime metrics as gaps; do not
fabricate cluster state or performance conclusions.

## Workflow

### 1. Fail-closed inventory check

Before reviewing, discover skill IDs from the canonical catalog (the frontmatter `name` of each
installed/cataloged `SKILL.md`). Build the sorted set matching `opensearch-*`, remove exactly the
orchestrator ID `opensearch-review-workflow`, and compare it with the sorted declared runnable set
above.

Use the host runtime's **effective discovered skill set after normal precedence rules**, limited to
discovery roots active for this target. Do not scan unrelated home or repository paths. If the host
cannot identify that set, or one ID resolves to ambiguous definitions, stop with
`CATALOG_UNAVAILABLE` or `AMBIGUOUS_DEPENDENCY`.

- Extra discovered ID: stop with `INVENTORY_MISMATCH` and list it; update this workflow before use.
- Declared ID missing from the catalog: stop with `MISSING_DEPENDENCY`.
- Do not approximate the check from directory names or invoke only the apparently relevant subset.

Record the discovered and declared sets in the report.

### 2. Freeze and route evidence

Freeze the target revision and shared artifact list. Give each skill the complete scope plus its
specialist inputs:

- `opensearch-query-review`: query DSL, builders, search pipelines, relevance and pagination
- `opensearch-schema-review`: mappings, analyzers, templates, vector fields, reindex/alias plan
- `opensearch-optimization`: scale, shards, memory, indexing, vector parameters, p99 and recall

Absence of a feature is a specialist `NOT_APPLICABLE` result with evidence, not a skipped run.

### 3. Run and synthesize

Run all three skills concurrently, with a hard limit of three active runs. Each result must contain
severity, confidence, artifact/path, evidence, impact, fix, rollout risk, and verification command
or measurement.

After all runs complete, optionally invoke `opensearch-expert` when findings conflict across query,
schema, and capacity concerns or a cross-cutting rollout decision is needed. Give it the original
outputs and ask it to synthesize, not rerun or overwrite specialists.

Deduplicate only identical artifact plus root cause. Preserve conflicting advice, such as recall
versus latency or mapping correctness versus migration risk, and state the trade-off. Require
recall@k and p99 together for vector performance claims and a reindex/alias path for immutable
mapping changes.

### 4. Verdict

- `INCOMPLETE`: a mandatory skill failed, timed out, or returned unusable output
- `BLOCK`: supported CRITICAL risk, data-loss risk, or unsafe no-rollback rollout
- `CHANGES_REQUIRED`: supported HIGH finding without a CRITICAL finding
- `WARNING`: only MEDIUM/LOW findings
- `APPROVE`: all three completed and no supported findings remain

Never use optional `opensearch-expert` failure to discard specialist results. Mark the synthesis
gap and retain the verdict warranted by those results.

Normalize supported severities to `CRITICAL|HIGH|MEDIUM|LOW|NONE` while retaining original labels.
When a mandatory run failure makes the verdict `INCOMPLETE` but a completed specialist found a
supported CRITICAL, add `blocking_finding_present: true` and preserve that finding.

## Output contract

Return:

1. scope, OpenSearch version/assumptions, and immutable revision
2. inventory check with exact declared/discovered IDs
3. run ledger for all mandatory skills and optional agent
4. aggregate verdict
5. unified findings with contributors and unresolved trade-offs
6. query/mapping/settings diffs or parameter changes, without applying them
7. verification matrix covering correctness, `_mapping`/`_analyze`, rollout, recall@k, p99, memory,
   and relevant cluster statistics
8. coverage gaps and next actions

## Failure and partial-result semantics

- Stop before component execution on inventory mismatch; partial coverage would falsely claim the
  complete suite ran.
- After execution begins, retain successful artifacts but return `INCOMPLETE` if any mandatory run
  fails. Never approve a partial suite.
- Mark live-cluster claims `UNVERIFIED` when access or metrics are unavailable. Static repository
  review may continue, but it cannot prove production performance or capacity.
- If the source revision changes, mark all results `STALE` and do not reconcile across revisions.
