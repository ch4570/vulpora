---
title: 실행계획 읽기 (EXPLAIN)
source: https://www.postgresql.org/docs/current/using-explain.html
pg_version: current (17/18)
last_fetched: 2026-06-22
consumers: [postgres-dba]
---

# KB: 실행계획 읽기 (EXPLAIN)

## 리뷰 훅 (이걸 점검하라)
- [ ] **추정 rows vs 실제 rows** 괴리가 큰가 → 통계 낡음/상관관계. `ANALYZE`/`CREATE STATISTICS`.
- [ ] 대형 테이블에 `Seq Scan` + 선택적 필터 → 인덱스 부재/무력화.
- [ ] `Rows Removed by Filter` 큼 → 인덱스가 못 거르고 읽고 버림(액세스 vs 필터 조건).
- [ ] `Sort Method: external merge Disk` / `Hash ... Batches > 1` → `work_mem` 부족.
- [ ] `Index Only Scan`에 `Heap Fetches` 큼 → visibility map 미갱신 → VACUUM.
- [ ] `Nested Loop` 안쪽 `rows × loops`가 실제 작업량. loops 폭증이면 Hash join 검토.

## 근거 (공식 문서 요지)
- 노드 표기: `(cost=시작..총 rows=추정 width=바이트)` + `ANALYZE` 시 `(actual time=시작..총 rows=실제 loops=N)`.
- **cost는 추정치(임의 단위, seq_page_cost=1.0 기준), actual은 실측.** 둘을 비교하는 게 핵심.
- **`ANALYZE`는 쿼리를 실제 실행한다.** 쓰기 쿼리는 `BEGIN; ... ROLLBACK;`으로 감싼다.
- **`BUFFERS`**(ANALYZE 시 자동): `shared hit/read/written/dirtied`로 논리 vs 물리 I/O 확인.
- **loops 곱셈 규칙**: 안쪽 노드의 actual rows/time은 1회 기준 → 총량 = `rows × loops`.
- `Limit` + 인덱스 = Top-N 조기 종료(부분범위 처리). `BitmapAnd/Or`의 actual rows=0은 표기 한계(무시).

## 진단 옵션
```sql
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, SETTINGS) SELECT ...;
```
- `SETTINGS`: 계획에 영향 준 비기본 파라미터(work_mem 등) 노출.

## 인용 시
"PG `Using EXPLAIN` 기준, 추정 rows=N 인데 actual rows=M(괴리) → 통계 갱신 필요" 식으로 근거를 단다.
