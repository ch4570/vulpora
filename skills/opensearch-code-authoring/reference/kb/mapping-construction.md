---
title: OpenSearch mapping construction
source: https://docs.opensearch.org/latest/mappings/
last_fetched: 2026-08-25
skills: [opensearch-code-authoring]
---

# OpenSearch mapping construction

Mappings define how OpenSearch indexes and searches document fields. Draft an explicit mapping from the observed document contract and query use, then plan a safe index transition when a mapping cannot be changed in place.

- Use field types and multi-fields to match actual full-text, exact-match, sorting, aggregation, and retrieval needs.
- Verify analyzer/normalizer, dynamic policy, and vector dimension/space/model compatibility from existing code or supplied evidence.
- Avoid mapping changes that silently alter query semantics. For immutable or incompatible changes, use the repository's versioned-index, reindex, and alias cutover pattern.

## 리뷰 훅

- [ ] Every explicit field type follows an observed document and query use.
- [ ] Analyzer, keyword/text, vector, and dynamic choices have compatibility evidence.
- [ ] Incompatible changes include reindex, cutover, and rollback/forward-fix notes.
