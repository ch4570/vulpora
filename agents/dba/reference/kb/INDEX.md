# PostgreSQL Knowledge Base — 색인 (INDEX)

> PostgreSQL **공식 문서(docs/current)** 를 distill한 인용 가능한 KB. 각 파일은 frontmatter에
> `source`(원문 URL)·`pg_version`·`last_fetched`·`skills`를 담는다.
> **리뷰 시 사용법**: 작업 유형에 맞는 KB 파일을 먼저 읽고, 그 "리뷰 훅"으로 점검하며,
> 지적할 때 KB의 `source` URL을 근거로 인용한다. (예: "PG `Using EXPLAIN` 기준 …")

## 작업 유형 → 읽을 KB

### 쿼리 검토
| KB | 다룸 |
|----|------|
| [explain-plans](explain-plans.md) | 실행계획 노드/신호, ANALYZE·BUFFERS, loops 곱셈 |
| [planner-statistics](planner-statistics.md) | ANALYZE/통계, 추정 괴리, 확장통계 `CREATE STATISTICS` |
| [index-types](index-types.md) | B-tree/Hash/GiST/SP-GiST/GIN/BRIN 선택 |
| [index-design](index-design.md) | 컬럼 순서, 부분/표현식/커버링, Index-Only |
| [function-volatility](function-volatility.md) | VOLATILE/STABLE/IMMUTABLE, 인덱스/캐싱 영향 |
| [parallel-query](parallel-query.md) | 병렬 활성/비활성 요인 |
| [jsonb](jsonb.md) | jsonb 연산자·GIN opclass |
| [bulk-loading](bulk-loading.md) | COPY·청크·대량 처리 |

### 스키마/테이블 설계
| KB | 다룸 |
|----|------|
| [data-types](data-types.md) | 타입 선택(numeric/timestamptz/text/jsonb/uuid/enum/range) |
| [constraints](constraints.md) | PK/NOT NULL/FK(+인덱스)/UNIQUE/CHECK/EXCLUDE |
| [generated-columns](generated-columns.md) | STORED/VIRTUAL, 파생값 자동화 |
| [partitioning](partitioning.md) | RANGE/LIST/HASH, pruning, UNIQUE 제약 |
| [jsonb](jsonb.md) | jsonb 남용 경계·인덱싱 |
| [index-types](index-types.md) / [index-design](index-design.md) | 인덱스 설계 |
| [function-volatility](function-volatility.md) | 생성컬럼/CHECK 함수 제약 |

### 변경 리스크 / 운영
| KB | 다룸 |
|----|------|
| [mvcc-isolation](mvcc-isolation.md) | MVCC, 격리수준, 재시도(40001) |
| [locking](locking.md) | 테이블/행 락 등급, 데드락, advisory |
| [alter-table-safety](alter-table-safety.md) | ALTER 락·재작성, NOT VALID→VALIDATE |
| [create-index-safety](create-index-safety.md) | CONCURRENTLY, INVALID 인덱스 복구 |
| [vacuum-maintenance](vacuum-maintenance.md) | VACUUM/autovacuum/bloat/wraparound |
| [bulk-loading](bulk-loading.md) | 대량 적재·백필 청크 |
| [constraints](constraints.md) / [partitioning](partitioning.md) | 제약/파티션 운영 락 |

## 원칙 문서와의 관계
- 상위 원칙·Oracle→PG 치환표는 `../principles.md`(헌법). KB는 그 원칙의 **공식 문서 근거·세부 규칙**.
- 충돌 시 **KB(공식 문서)가 우선**하며, principles는 책 기반 통찰을 보탠다.

## 갱신
- 각 파일 `last_fetched` 기준. PG 메이저 업그레이드 시 `source` URL을 다시 fetch해 갱신.
- TODO(차기): full-text search, REINDEX, logical replication, server config(work_mem 등) KB 추가 여지.
