# OpenSearch Optimization KB — 색인 (INDEX)

> OpenSearch **공식 문서**(docs.opensearch.org/latest) Tuning·Vector(optimizing storage/performance)를
> distill한 인용 가능한 KB. 각 파일 frontmatter에 `source`·`last_fetched`·`skills`.
> **리뷰 시 사용법**: 작업 유형에 맞는 KB를 먼저 읽고 "리뷰 훅"으로 점검하며, 지적 시 KB의
> `source` URL을 근거로 인용한다.

## 작업 유형 → 읽을 KB

| 작업 | KB | 다룸 |
|---|---|---|
| 적재 처리량 | [indexing-throughput](indexing-throughput.md) | bulk, refresh/replica 토글, translog, index buffer, 복원 경로 |
| 세그먼트/리프레시 | [refresh-merge-segments](refresh-merge-segments.md) | refresh, flush, segment merge, force merge, 가시성 지연 |
| 샤드 사이징 | [shard-sizing](shard-sizing.md) | 샤드 크기·개수, heap당 샤드, ISM rollover/retention |
| 캐시 | [query-caching](query-caching.md) | node query cache, shard request cache, fielddata, JVM/breaker |
| 벡터 튜닝 | [vector-tuning-memory](vector-tuning-memory.md) | HNSW/IVF 파라미터, 양자화(SQ/PQ/BQ), on_disk, 메모리 공식, off-heap, circuit breaker |

## 원칙 문서와의 관계
- 상위 통찰·우선순위는 `../principles.md`(헌법). KB는 그 원칙의 **공식 문서 근거·세부 규칙**.
- 충돌 시 **KB(공식 문서)가 우선**.

## 갱신
- 각 파일 `last_fetched` 기준. OpenSearch 메이저 업글 시 `source`를 재fetch.
- TODO(차기 KB 후보): search backpressure, segment replication, snapshot/restore 성능, GPU index build.
