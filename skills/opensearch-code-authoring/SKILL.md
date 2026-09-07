---
name: opensearch-code-authoring
description: Write or modify OpenSearch mappings, Query DSL, vector or hybrid search settings, and reindex plans with relevance, latency, and operational safety. Use when a feature, bug fix, or refactor in a repository detected as OpenSearch touches search behavior, mapping, configuration, or queries, even when the user does not name OpenSearch; do not use for review-only requests.
---

# OpenSearch code authoring

Inspect the target OpenSearch version, existing mappings/settings, client builder, document shape, workload, and evaluation signals before drafting. Preserve existing naming and index lifecycle conventions; do not invent field names, analyzer behavior, or model dimensions.

## Construction contract

- Make mappings explicit for fields that are searched, filtered, sorted, aggregated, or embedded. Match `text`/`keyword`, analyzer, doc-values, and vector dimension/space to demonstrated use.
- Build Query DSL from validated field/operator inputs. Put non-scoring constraints in filter context, constrain expensive query forms, and use a stable pagination strategy for the requested depth.
- For vector or hybrid search, keep embedding model, dimension, space type, `k`, candidate controls, and filtering strategy compatible. Tune recall and p99 together; do not claim either improves without measurement.
- Treat mapping type, analyzer, or vector changes as migration work. Supply a versioned index, reindex, alias/blue-green cutover, and rollback approach when the existing lifecycle requires it.
- Author artifacts and diagnostic/benchmark commands only. Do not mutate an index or cluster without separate authorization.

Read [mapping construction](reference/kb/mapping-construction.md) for schema changes and [query construction](reference/kb/query-construction.md) for Query DSL. The installed `opensearch-query-review`, `opensearch-schema-review`, and `opensearch-optimization` dependencies provide the shared review rationale; apply them as construction constraints.

## Deliverable

Return the mapping/query/settings or migration artifact, assumptions, compatibility notes, and recall@k/p99 plus operational verification plan.
