# OpenSearch Query KB — 색인 (INDEX)

> OpenSearch **공식 문서**(docs.opensearch.org/latest) Query DSL·Vector search·Search pipelines를
> distill한 인용 가능한 KB. 각 파일 frontmatter에 `source`·`last_fetched`·`skills`.
> **리뷰 시 사용법**: 작업 유형에 맞는 KB를 먼저 읽고 "리뷰 훅"으로 점검하며, 지적 시 KB의
> `source` URL을 근거로 인용한다.

## 작업 유형 → 읽을 KB

| 작업 | KB | 다룸 |
|---|---|---|
| bool/term/match 조립 | [query-dsl-basics](query-dsl-basics.md) | leaf vs compound, filter vs query context, term/match/range, 동적 빌더 안전성 |
| 관련도·점수 조정 | [relevance-scoring](relevance-scoring.md) | BM25, boost, function_score, constant_score, min_score, explain |
| 벡터·하이브리드 | [vector-hybrid-query](vector-hybrid-query.md) | k-NN query, efficient filtering, radial/nested, hybrid normalization/RRF, neural |
| 페이징 | [pagination-search-after](pagination-search-after.md) | from/size 한계, search_after, PIT, scroll, track_total_hits |
| 성능 진단 | [profiling-explain](profiling-explain.md) | Profile API, explain, slow log, terminate_after, 흔한 병목 |

## 원칙 문서와의 관계
- 상위 통찰·우선순위는 `../principles.md`(헌법). KB는 그 원칙의 **공식 문서 근거·세부 규칙**.
- 충돌 시 **KB(공식 문서)가 우선**.

## 갱신
- 각 파일 `last_fetched` 기준. OpenSearch 메이저 업글 시 `source`를 재fetch해 갱신.
- TODO(차기 KB 후보): `dis_max`/`multi_match` 타입별 비교, `rescore` 단계, percolate query, `collapse` 결과 접기.
