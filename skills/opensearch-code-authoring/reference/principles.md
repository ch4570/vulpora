# OpenSearch code authoring principles

## Sources

- OpenSearch Mappings — https://docs.opensearch.org/latest/mappings/
- OpenSearch Query DSL — https://docs.opensearch.org/latest/query-dsl/

1. Mapping and query choices preserve both relevance behavior and operational safety.
2. Vector/search tuning is a recall, latency, and memory trade-off that must be measured.
3. Writing a cluster artifact does not authorize applying it to a cluster.
