---
title: 실행계획 읽는 법 (EXPLAIN)
source: https://www.postgresql.org/docs/current/using-explain.html
last_fetched: 2026-06-24
skills: [postgres-query-review]
---

# 실행계획 읽는 법 (EXPLAIN)

> 출처: PostgreSQL `Using EXPLAIN`(공식 문서) + 『친절한 SQL 튜닝』 1·7장(통찰 보강).
> Oracle의 AutoTrace/`V$SQL`/`DBMS_XPLAN`에 해당하는 PG 도구는 `EXPLAIN`과 `pg_stat_statements`.

## 1. 기본 명령

```sql
-- 계획만 (실행 안 함, 추정치)
EXPLAIN SELECT ...;

-- 실제 실행 + 실측치(시간/행수) + 버퍼 I/O
EXPLAIN (ANALYZE, BUFFERS) SELECT ...;

-- 옵션 풀세트
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, SETTINGS, WAL, FORMAT TEXT) SELECT ...;
```

- `ANALYZE`는 **쿼리를 실제로 실행한다.** INSERT/UPDATE/DELETE에 쓰려면 반드시 감싼다:
  ```sql
  BEGIN;
  EXPLAIN (ANALYZE, BUFFERS) UPDATE ...;
  ROLLBACK;
  ```
- `BUFFERS`: shared hit/read(블록 I/O)를 보여줘 "논리적 vs 물리적 I/O"(책 1.3.5)를 확인.
- `SETTINGS`: 계획에 영향 준 비기본 파라미터 표시(`work_mem` 등).

## 2. 계획 트리 읽는 법

- 들여쓰기된 **자식 노드가 먼저** 실행되어 부모로 행을 올려보낸다(상향식).
- 각 노드 표기:
  `Node (cost=시작..총 rows=추정행 width=바이트) (actual time=시작..총 rows=실제행 loops=반복)`
- **cost는 예상치, actual은 실측치.** 비용 단위는 임의(랜덤 페이지 1.0 기준 상대값).
- **`loops`를 곱하라.** Nested Loop 안쪽 노드의 `actual rows`는 1회 기준 → 실제 총량은
  `rows × loops`.

## 3. 핵심 노드와 의미

| 노드 | 의미 | 점검 포인트 |
|------|------|-------------|
| `Seq Scan` | 테이블 전체 스캔 | 대형 테이블 + 선택적 필터면 인덱스 부재/무력화 의심 |
| `Index Scan` | 인덱스로 찾고 테이블 액세스 | 랜덤 액세스 비용. 결과 많으면 손익분기점 초과 가능 |
| `Index Only Scan` | 인덱스만으로 해결(테이블 미접근) | `Heap Fetches` 크면 VACUUM 필요 |
| `Bitmap Heap Scan` + `Bitmap Index Scan` | 인덱스로 비트맵 만들어 테이블 일괄 액세스 | 중간 선택도에 유리(랜덤→순차화) |
| `Nested Loop` | 바깥 각 행마다 안쪽 반복 | 안쪽에 인덱스 있어야. 대량 반복이면 위험 |
| `Hash Join` + `Hash` | 한쪽 해시 build, 다른쪽 probe | 대량 등치 조인에 유리. `Batches>1`이면 메모리 부족 |
| `Merge Join` | 양쪽 정렬 후 머지 | 이미 정렬된 입력이면 저렴 |
| `Sort` | 정렬 | `Sort Method: ... Disk`면 `work_mem` 부족 |
| `Aggregate`/`HashAggregate`/`GroupAggregate` | 집계 | Group은 정렬 입력 필요 |
| `Gather`/`Parallel ...` | 병렬 실행 | 워커 수와 효율 확인 |
| `Limit` | 상위 N건 | Top-N 부분범위 처리(인덱스로 정렬 생략 시 강력) |

## 4. 위험 신호 체크리스트

1. **추정 vs 실제 행 수 괴리** — 옵티마이저가 잘못된 가정을 함. 통계 최신화(`ANALYZE`),
   상관 컬럼이면 `CREATE STATISTICS (dependencies, ndistinct) ON a,b FROM t;`.
2. **`Rows Removed by Filter` 가 큼** — 인덱스가 행을 거르지 못하고 읽은 뒤 버림.
   "액세스 조건"(인덱스로 범위 좁힘) vs "필터 조건"(읽고 버림) 구분(책 3.3.3).
3. **`Sort Method: external merge Disk` / `Batches > 1`** — 메모리 부족.
   불필요한 정렬 제거 또는 세션 `SET work_mem`.
4. **`Heap Fetches` 큼** (Index Only Scan) — VACUUM으로 visibility map 갱신.
5. **`Nested Loop` + 큰 `loops`** — 통계 오류로 작은 줄 알고 NL 선택. 조인키 인덱스/통계 점검.

## 5. 진단용 시스템 뷰

```sql
-- 자주/오래 걸리는 쿼리 (확장 필요: CREATE EXTENSION pg_stat_statements;)
SELECT query, calls, total_exec_time, mean_exec_time, rows
FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 20;

-- 테이블 스캔/통계 상태
SELECT relname, seq_scan, idx_scan, n_live_tup, n_dead_tup,
       last_analyze, last_autoanalyze
FROM pg_stat_user_tables ORDER BY seq_scan DESC;

-- 인덱스 사용량 (idx_scan=0 이면 미사용 의심)
SELECT relname, indexrelname, idx_scan, idx_tup_read
FROM pg_stat_user_indexes ORDER BY idx_scan ASC;
```

## 6. 자주 하는 오해

- **"cost가 낮으면 무조건 빠르다"** — cost는 추정. 실측(`ANALYZE`)으로 확인.
- **"인덱스가 있으니 인덱스를 탄다"** — 선행 컬럼 가공/형변환/낮은 선택도면 안 탄다.
- **"Seq Scan은 항상 나쁘다"** — 작은 테이블·대부분 행을 읽는 쿼리는 Seq Scan이 정답.

## 리뷰 훅

- [ ] 진단에 `EXPLAIN (ANALYZE, BUFFERS)`(실측치)를 썼는가. 추정만 보고 단정하지 않았는가.
- [ ] 쓰기 쿼리(INSERT/UPDATE/DELETE)의 `ANALYZE`를 `BEGIN; ... ROLLBACK;`으로 감쌌는가.
- [ ] Nested Loop 안쪽 노드의 실제 작업량을 `rows × loops`로 계산했는가.
- [ ] 추정 행수와 실제 행수의 괴리를 확인했는가(통계 노후/상관관계 신호).
- [ ] `Rows Removed by Filter`·`Heap Fetches`·`Sort Method: ... Disk`·`Batches>1` 신호를 점검했는가.
- [ ] 개선 주장을 수정 전후 `EXPLAIN ANALYZE` 비교로 입증했는가.
