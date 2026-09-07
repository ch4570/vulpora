# OpenSearch Code Authoring Knowledge Base — INDEX

## 작업 유형 → 읽을 KB

| 작업 신호 | KB | 다룸 |
|---|---|---|
| mapping, analyzer, `text`/`keyword`, vector field, reindex | [mapping-construction](mapping-construction.md) | explicit mapping과 lifecycle-safe transition |
| Query DSL, bool/filter, pagination, k-NN, hybrid | [query-construction](query-construction.md) | validated query shape와 relevance/latency verification |

## KB 한 줄 요약

| KB | 한 줄 요약 |
|---|---|
| [mapping-construction](mapping-construction.md) | field use와 vector compatibility를 증거로 mapping과 전환 계획을 작성한다 |
| [query-construction](query-construction.md) | 안전한 query input과 filter/paging/vector contract를 작성하고 recall@k·p99로 검증한다 |

## 원칙 문서와의 관계

상위 판단 기준은 [principles](../principles.md)다. 대상 OpenSearch version과 repository lifecycle convention이 이 KB보다 우선한다.

## 갱신

OpenSearch major version, model/vector compatibility, 또는 relevance incident가 바뀌면 공식 문서를 다시 확인한다.
