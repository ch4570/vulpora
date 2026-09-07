---
name: opensearch-query-review
description: >-
  Review OpenSearch 3.5 search queries. Inspect dynamic bool queries (filter vs query context,
  builder safety, paging), vector k-NN queries (k/ef_search, efficient filtering, under-fetch,
  radial, nested), hybrid (normalization/RRF)·neural/sparse/semantic, and search pipelines. Use
  when authoring/modifying queries or diagnosing search-result/latency problems. Ground claims in
  the OpenSearch official-docs KB.
---

# OpenSearch Query Building Review (Query Review)

Grounding principles are in `reference/principles.md`. For facts, prefer `reference/kb/` (official docs).

## Review order (proceed exactly like this)
1. **What the query is asking** — result set, filter selectivity, frequency, sort/paging pattern.
2. **Dynamic bool** check — `reference/kb/query-dsl-basics.md` (filter context, term/match, builder safety).
3. **Relevance·paging** — `reference/kb/relevance-scoring.md` (BM25/boost/min_score) · `reference/kb/pagination-search-after.md`.
4. **Vector/hybrid** check — `reference/kb/vector-hybrid-query.md` (k vs ef_search, efficient filtering, normalization/RRF). **If hybrid/neural grep returns 0, state "not applicable"**.
5. **Slowness diagnosis** — `reference/kb/profiling-explain.md` (Profile API). Provide a fix (query diff) with severity + re-measurement (recall@k·p99).

## Quick checklist
- [ ] Is a no-score condition in `must`? → `filter`/`must_not` (skip scoring + cache).
- [ ] Does the dynamic builder enforce a field whitelist, a `terms` size cap, and avoid `script`/wildcard?
- [ ] Is deep paging using `from`+`size`? → `search_after`/PIT.
- [ ] In k-NN, is `ef_search ≥ k`? A variable `k` with a fixed `ef_search` means a ceiling mismatch.
- [ ] When a filter is present, is it efficient k-NN filtering, and does a selective filter under-fetch (over-fetch/exact fallback)?
- [ ] (hybrid) Is there a normalization/RRF processor? Are the neural ingest↔query model_id the same?
- [ ] Did a type-based client work around `terms` via `bool.should`? → replace with the native form.

## KB (read and cite first)
From `reference/kb/INDEX.md`: `reference/kb/query-dsl-basics.md` · `reference/kb/relevance-scoring.md` · `reference/kb/vector-hybrid-query.md` · `reference/kb/pagination-search-after.md` · `reference/kb/profiling-explain.md`

## Deliverable
For each finding: problem → principle/KB source → query diff → re-measurement (recall@k sweep·p99). "It got faster" is confirmed only by measurement.
