# OpenSearch Knowledge Base — 색인 (INDEX)

> OpenSearch **공식 문서**(docs.opensearch.org / documentation-website main) + 3.5.0 릴리스 노트를
> distill한 인용 가능한 KB. 각 파일 frontmatter에 `source`·`os_version`·`last_fetched`·`skills`.
> **리뷰 시 사용법**: 작업 유형에 맞는 KB를 먼저 읽고 "리뷰 훅"으로 점검하며, 지적 시 KB의
> `source` URL을 근거로 인용한다. "문서 미확인" 값은 `_settings`/공식 문서로 재확인 후 인용한다.

## 작업 유형 → 읽을 KB

### 스키마/매핑 검토
| KB | 다룸 |
|----|------|
| [schema-mapping](schema-mapping.md) | dynamic, text/keyword, multi-field, index/doc_values, _source/derived, flat_object, nested |
| [vector-indexing](vector-indexing.md) | knn_vector 필드, 엔진/space_type 매트릭스, dimension/data_type/mode |
| [korean-nori](korean-nori.md) | nori 설치·decompound_mode·사용자사전·품사·동의어 |

### 쿼리 빌딩 검토
| KB | 다룸 |
|----|------|
| [vector-query](vector-query.md) | k-NN query, efficient filtering(under-fetch), radial, nested vector |
| [hybrid-neural](hybrid-neural.md) | hybrid, normalization/RRF, neural/sparse/semantic, search pipeline |
| [dynamic-query](dynamic-query.md) | filter vs query context, terms/페이징 한계, PIT/search_after |

### 최적화 파라미터 / 운영 리스크
| KB | 다룸 |
|----|------|
| [vector-indexing](vector-indexing.md) | HNSW(m/ef_construction/ef_search)/IVF, ef_search≥k 불변식 |
| [quantization-memory](quantization-memory.md) | SQ/PQ/BQ, on_disk, 메모리 공식, off-heap, circuit breaker |
| [cluster-ops](cluster-ops.md) | 인덱싱 튜닝, 샤드 사이징, ISM, 캐시, JVM/breaker |

## 원칙 문서와의 관계
- 상위 원칙·trade-off 판단은 `../principles.md`(헌법). KB는 그 원칙의 **공식 문서 근거·세부 규칙**.
- 충돌 시 **KB(공식 문서)가 우선**. principles는 통찰을 보탠다.

## 갱신
- 각 파일 `last_fetched`·`os_version` 기준. OpenSearch 메이저 업글 시 `source`를 재fetch.
- "문서 미확인" 항목(각 KB 하단)은 인용 전 재확인 필요.
