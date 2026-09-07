---
title: 병렬 쿼리
source: https://www.postgresql.org/docs/current/parallel-query.html
pg_version: current (17/18)
last_fetched: 2026-06-22
consumers: [postgres-dba]
---

# KB: 병렬 쿼리

## 리뷰 훅
- [ ] 큰 테이블 집계/스캔이 느린데 `Gather`가 안 보이면 → 병렬 비활성 요인 점검.
- [ ] WHERE/SELECT에 쓴 함수가 `PARALLEL UNSAFE/RESTRICTED`면 병렬이 죽는다 → 함수 라벨 확인.
- [ ] `max_parallel_workers_per_gather=0`이거나 테이블이 작으면 병렬 안 함(정상).

## 근거 (공식 문서 요지)
- 병렬 노드: `Gather`, `Gather Merge`, `Parallel Seq/Index Scan`, `Parallel Join/Aggregate/Append`.
- 트리거 요인: 테이블 크기, `parallel_setup_cost`, `parallel_tuple_cost`, `max_parallel_workers_per_gather`.
- **병렬을 막는 것**: PARALLEL UNSAFE 함수, 일부 CTE, `FOR UPDATE`(행잠금), 커서, 비-safe UDF.
- 일반적 기대 효과 2~4배. 소형 테이블은 이득 없음.

## 처방
```sql
-- UDF가 병렬을 막는다면 안전하다고 확신될 때만 라벨링
ALTER FUNCTION my_fn(...) PARALLEL SAFE;
-- 세션에서 병렬 강제 확인(진단용)
SET max_parallel_workers_per_gather = 4;
EXPLAIN (ANALYZE) SELECT count(*) FROM big WHERE ...;  -- Gather 노드 확인
```
