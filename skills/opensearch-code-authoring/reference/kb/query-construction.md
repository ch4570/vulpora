---
title: OpenSearch query construction
source: https://docs.opensearch.org/latest/query-dsl/
last_fetched: 2026-08-25
skills: [opensearch-code-authoring]
---

# OpenSearch query construction

OpenSearch Query DSL supplies the JSON query structure. Construct it from validated query inputs and the existing index contract, separating scoring intent from non-scoring filters and verifying search quality under the intended workload.

- Allowlist dynamic fields and operators in builders; bind caller values into the typed client/JSON structure rather than concatenating JSON fragments.
- Use filter context for non-scoring predicates and keep text/vector/hybrid clauses aligned with the mapping and model contract.
- Select paging deliberately: avoid deep `from`/`size` traversal where the existing contract supports PIT plus `search_after`.
- Measure recall@k and p99 latency for vector/hybrid or material relevance changes; use the repository's ground truth and benchmark process when available.

## 리뷰 훅

- [ ] Dynamic query input is validated against known fields/operators and bounded where needed.
- [ ] Filter, scoring, paging, and sort behavior match the user-visible search contract.
- [ ] Vector/hybrid queries are compatible with their mapping/model and include recall@k plus p99 verification.
- [ ] No relevance or latency improvement is claimed without measurement.
