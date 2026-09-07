---
name: opensearch-optimization
description: >-
  Tune OpenSearch 3.5 vector/search optimization parameters and diagnose operational risk. Covers HNSW/IVF parameters
  (m/ef_construction/ef_search/nlist/nprobes), quantization (SQ/PQ/BQ)·on_disk, memory estimation·
  off-heap·circuit breaker, indexing tuning (refresh/replica/force merge)·shard sizing·ISM·caching.
  Use for performance/memory/recall tuning and migration/operational-safety checks. Grounded in the official-docs KB.
---

# OpenSearch Optimization / Operational Risk (Optimization)

Grounding principles are in `reference/principles.md`. For facts, prefer `reference/kb/`.

## Review order (proceed in this order)
1. **Confirm scale** — N·QPS·p99 SLO·RAM/heap·dimension. If absent, ask or state assumptions explicitly.
2. **Vector parameters/memory** — `reference/kb/vector-tuning-memory.md` (HNSW/IVF, ef_search≥k, quantization·off-heap).
3. **Indexing** — `reference/kb/indexing-throughput.md` (bulk·refresh/replica toggle·restore path) + `reference/kb/refresh-merge-segments.md` (force merge).
4. **Cluster** — `reference/kb/shard-sizing.md` (shards·ISM) + `reference/kb/query-caching.md` (cache·breaker).
5. **Operational anti-patterns** — triple cross-check of default/yml/test, temporary settings lingering in production, tests pinned to a defective value, mismatched variable–fixed parameter pairs. Severity + recommended parameters (current→recommended) + verification (recall@k·p99·`_knn/stats`).

## Quick checklist
- [ ] Is `ef_search ≥ maximum allowed k` (verify on boot)? Secure recall headroom (1.5~2× k).
- [ ] Memory savings SQ (fp16) first. Measured N → estimation formula → **numerically compute** the circuit breaker (50%) headroom.
- [ ] Are you trying to solve k-NN OOM by increasing heap (use off-heap instead)?
- [ ] For bulk loads with `replicas:0`/`refresh:-1`, is there a **restore code path**? force merge only after writes finish.
- [ ] For time-series indices, is there ISM·`_vN`+alias swap?
- [ ] Do "temporary/diagnostic" timeouts·caps linger in production? Is there a test that pins a defective value as the expected value?

## KB (read and cite first)
From `reference/kb/INDEX.md`: `reference/kb/indexing-throughput.md` · `reference/kb/refresh-merge-segments.md` · `reference/kb/shard-sizing.md` · `reference/kb/query-caching.md` · `reference/kb/vector-tuning-memory.md`

## Deliverable
For each finding: problem → principle/KB source → recommended parameters (current→recommended, with rationale) → verification command (`_knn/stats`·`_cat/indices`·recall@k sweep). Measure→hypothesize→adjust→re-measure. Reject any tuning that does not look at recall@k and p99 together.
