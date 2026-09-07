---
name: opensearch-schema-review
description: >-
  Review OpenSearch 3.5 index mappings/schemas. Check the dynamic policy, text/keyword, multi-field,
  index/doc_values, _source/derived source, nested cost, knn_vector fields (dimension/
  space_type/engine/method/mode), and the Korean nori analyzer. Use when designing/modifying a mapping
  or reviewing an index schema. Grounds findings in a KB based on the official OpenSearch docs.
---

# OpenSearch Schema/Mapping Review (Schema Review)

The grounding principles are in `reference/principles.md`. For facts, prefer `reference/kb/` (the official docs).

## Review order (proceed in this order)
1. **What index does this index?** — Identify the domain, language (Korean?), time-series nature, and scale (N).
2. **Mapping in general** — Check the review hooks in `reference/kb/field-types.md` · `reference/kb/dynamic-mapping-risks.md`.
3. **Analyzers** — Check `reference/kb/analyzers-tokenizers.md` (search vs index analyzer, normalizer, nori). **If the nori grep returns 0 hits, state "not applicable"**.
4. **Vector fields** — Check `reference/kb/knn-vector-field.md` (dimension/space_type/engine/mode consistency, immutability).
5. **Templates** — `reference/kb/index-templates.md`. Along with the severity, provide a fix (mapping JSON diff) + a zero-downtime reindex/alias strategy.

## Quick checklist
- [ ] Is `dynamic` set to `strict`/`false` on production indexes (to prevent mapping explosion)?
- [ ] Is sorting/aggregation/exact on `keyword` and full-text search on `text`? Are unused fields `index:false`/`doc_values:false`?
- [ ] Does the `knn_vector` `dimension` match the model output, and is the `space_type` consistent with normalization?
- [ ] Is the `engine` faiss/lucene (**migrate if nmslib**)? Are the core fields explicit in the mapping (to prevent dynamic inference)?
- [ ] Are large vectors duplicated in `_source` → derived source (beware that nested/copy_to are unsupported)?
- [ ] (Korean) Is nori configured with `decompound_mode`, a user dictionary, parts of speech, and a search-time `synonym_graph`?

## KB (read and cite first)
From `reference/kb/INDEX.md`, read the following, check against the "review hooks", and cite via the `source` URL:
- `reference/kb/field-types.md` · `reference/kb/analyzers-tokenizers.md` · `reference/kb/knn-vector-field.md` · `reference/kb/index-templates.md` · `reference/kb/dynamic-mapping-risks.md`

## Deliverable
For each finding: problem → violated principle (principles.md §)/KB source → mapping diff → verification (`_mapping`/`_analyze`). Because mappings are immutable, accompany any change with a zero-downtime reindex/alias strategy.
