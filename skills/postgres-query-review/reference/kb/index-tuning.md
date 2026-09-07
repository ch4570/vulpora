---
title: 인덱스 튜닝 (Index Tuning)
source: https://www.postgresql.org/docs/current/indexes.html
last_fetched: 2026-06-24
skills: [postgres-query-review]
---

# 인덱스 튜닝 (Index Tuning)

> 출처: PostgreSQL `Indexes`(공식 문서) + 『친절한 SQL 튜닝』 2·3장(인덱스 기본/튜닝, 통찰 보강).

## 1. 인덱스의 본질

- B-tree 인덱스는 **정렬된 자료구조**. 수직 탐색(루트→리프)으로 시작점을 찾고, 수평 탐색
  (리프 연결리스트)으로 범위를 읽는다.
- 인덱스의 효용 = **테이블 랜덤 액세스를 줄이는 것**. 인덱스로 위치를 찾고 테이블 블록을
  한 건씩 찾아가는 비용이 핵심.
- **손익분기점**: 읽을 비율이 임계(대략 한 자릿수~십몇 %)를 넘으면 Seq Scan이 더 싸다.
  → 인덱스는 "선택도 높은(=결과가 적은) 조건"에 효과적.

## 2. 인덱스를 못 타는 패턴 (가장 흔한 성능 버그)

| 패턴 | 예 | 처방 |
|------|-----|------|
| 선행 컬럼 가공 | `WHERE lower(email)=$1` | 표현식 인덱스 `CREATE INDEX ON t (lower(email))` 또는 컬럼 자체를 저장 |
| 날짜 함수 | `WHERE date(created_at)=$1` | `WHERE created_at >= $1 AND created_at < $1 + interval '1 day'` |
| 형변환 | `WHERE phone = 1012345678`(컬럼이 text) | 타입 일치: `WHERE phone = $1::text` (값 쪽 캐스팅) |
| 좌측 와일드카드 | `WHERE name LIKE '%kim'` | 뒤집기 인덱스, 또는 trigram(`pg_trgm` + GIN) |
| 선두 컬럼 없는 결합인덱스 | idx `(a,b)` 에 `WHERE b=$1` | `b` 단독/선두 인덱스 또는 컬럼 순서 재설계 |
| `OR` 분기 | `WHERE a=$1 OR b=$2` | 각 컬럼 인덱스 → BitmapOr, 또는 `UNION ALL` 분해 |
| NULL 검색 | `WHERE col IS NULL` | 부분 인덱스 `WHERE col IS NULL` |
| 부정 조건 | `WHERE status <> 'X'` | 부분 인덱스 또는 긍정 조건으로 재작성 |

## 3. 결합 인덱스 컬럼 순서 (PG 공식 규칙)

1. **등치(=) 조건 → 앞**
2. **범위(<,>,BETWEEN,LIKE 'x%') 조건 → 중간**
3. **ORDER BY / GROUP BY → 뒤** (정렬 생략용)

```sql
-- WHERE status = $1 AND created_at > $2 ORDER BY id DESC
CREATE INDEX ON orders (status, created_at, id);
```

- 범위 조건 뒤의 컬럼은 정렬 효과가 깨질 수 있으니, "등치 → 정렬 → 범위" 순서가 정렬 생략에
  유리한 경우도 있다. **실제 쿼리의 EXPLAIN으로 Sort 노드가 사라지는지 확인**.
- **선택도 높은 컬럼을 앞에** 두는 것이 일반 원칙이나, 정렬 생략/액세스 패턴이 우선할 때도 있다.

## 4. PostgreSQL 인덱스 종류 선택

```sql
-- 기본 (등치/범위/정렬)
CREATE INDEX ON t (col);                       -- B-tree

-- 배열/jsonb/전문검색
CREATE INDEX ON docs USING gin (tags);         -- WHERE tags @> '{x}'
CREATE INDEX ON docs USING gin (body jsonb_path_ops);
CREATE INDEX ON docs USING gin (to_tsvector('simple', body));

-- 범위/기하/근접
CREATE INDEX ON res USING gist (period);       -- daterange &&, 근접검색

-- 초대형 + 물리정렬(시계열)
CREATE INDEX ON events USING brin (created_at);

-- LIKE '%중간%' 부분일치
CREATE EXTENSION pg_trgm;
CREATE INDEX ON t USING gin (name gin_trgm_ops);
```

## 5. 고급 기법

```sql
-- 부분 인덱스: 자주 거르는 부분집합만 (작고 빠름)
CREATE INDEX ON orders (created_at) WHERE status = 'OPEN';
CREATE INDEX ON users (email) WHERE deleted_at IS NULL;

-- 표현식 인덱스
CREATE INDEX ON users (lower(email));

-- 커버링 인덱스 → Index-Only Scan (테이블 미접근)
CREATE INDEX ON orders (customer_id) INCLUDE (status, total_amount);

-- 정렬 방향/NULLS 위치까지 맞추기
CREATE INDEX ON t (created_at DESC NULLS LAST);
```

- **Index-Only Scan**은 SELECT 컬럼이 모두 인덱스에 있을 때만. `Heap Fetches`가 크면
  VACUUM으로 visibility map을 갱신해야 효과가 난다.

## 6. 인덱스 과잉의 비용

- 인덱스가 많을수록 **INSERT/UPDATE/DELETE가 느려지고** 저장공간·VACUUM 부담이 는다.
- **중복 인덱스 제거**: `(a)`는 `(a,b)`로 대체 가능. `pg_stat_user_indexes.idx_scan=0`인
  인덱스는 미사용 후보 → 제거 검토(단, 가끔 쓰는 배치/제약 백킹 인덱스 주의).
- 새 인덱스는 운영에서 **`CREATE INDEX CONCURRENTLY`** 로(쓰기 락 회피). 상세는 risk-check 스킬.

## 7. 검증

```sql
-- 인덱스 적용 전후 비교
EXPLAIN (ANALYZE, BUFFERS) SELECT ...;   -- 전
CREATE INDEX CONCURRENTLY ...;
ANALYZE t;
EXPLAIN (ANALYZE, BUFFERS) SELECT ...;   -- 후 (Seq Scan→Index Scan, buffers 감소 확인)
```

## 리뷰 훅

- [ ] WHERE/JOIN/ORDER BY 컬럼에 인덱스가 있는가. 없으면 풀스캔 위험을 지적했는가.
- [ ] 선행 컬럼 가공·형변환·좌측 와일드카드 등 인덱스 무력화 패턴이 없는가(있으면 표현식/부분 인덱스 처방).
- [ ] 결합 인덱스 컬럼 순서가 "등치(=) → 범위 → 정렬" 규칙을 따르는가(EXPLAIN으로 Sort 생략 확인).
- [ ] 데이터 특성에 맞는 인덱스 종류(B-tree/GIN/GiST/BRIN/trgm)를 선택했는가.
- [ ] 중복·미사용 인덱스(`idx_scan=0`)로 DML/공간 부담을 키우지 않는가.
- [ ] 운영 인덱스 생성을 `CREATE INDEX CONCURRENTLY`로 했는가(쓰기 락 회피).
- [ ] 효과를 인덱스 적용 전후 `EXPLAIN (ANALYZE, BUFFERS)` 비교로 입증했는가.
