---
title: 인덱스 설계 (순서·부분·표현식·커버링)
source: https://www.postgresql.org/docs/current/indexes-multicolumn.html, indexes-partial.html, indexes-index-only-scans.html
pg_version: current (17/18)
last_fetched: 2026-06-22
consumers: [postgres-dba]
---

# KB: 인덱스 설계

## 결합(다중컬럼) 컬럼 순서 (핵심 규칙)
1. **등치(=) 조건 → 앞**
2. **범위(< > BETWEEN, `LIKE 'x%'`) → 중간**
3. **ORDER BY / GROUP BY → 뒤**(정렬 연산 생략)
```sql
-- WHERE status=$1 AND created_at>$2 ORDER BY id DESC
CREATE INDEX ON orders (status, created_at, id);
```
- 선두 컬럼에 등치 조건이 없으면 결합 인덱스 효율 급감.

## 부분 인덱스 (partial)
```sql
CREATE INDEX ON orders (created_at) WHERE status = 'OPEN';
CREATE UNIQUE INDEX ON users (email) WHERE deleted_at IS NULL;  -- 부분 유일성
```
- 자주 거르는 부분집합만 인덱싱 → 작고 빠름. WHERE 식은 같은 테이블 컬럼만, 서브쿼리/집계 불가.
- **주의(generic plan)**: 부분 인덱스의 WHERE 상수가 **파라미터로 들어오면** 매칭 안 될 수 있음 →
  그런 큐 패턴은 non-partial로.

## 표현식 인덱스
```sql
CREATE INDEX ON users (lower(email));   -- WHERE lower(email)=$1 가 타도록
```
- 표현식은 **IMMUTABLE**이어야 함(`function-volatility.md`).

## 커버링 / Index-Only Scan
```sql
CREATE INDEX ON orders (customer_id) INCLUDE (status, total_amount);
```
- SELECT 컬럼을 인덱스에 포함 → 테이블 미접근. `Heap Fetches` 크면 VACUUM 필요(visibility map).
- INCLUDE는 검색조건에 못 쓰고 unique 판정에서 제외. 넓은 컬럼 남용 시 인덱스 비대.

## 리뷰 훅
- [ ] WHERE/JOIN/ORDER BY 컬럼에 인덱스가 있는가.
- [ ] 선두 컬럼 가공/형변환으로 인덱스를 못 타지 않는가.
- [ ] 중복 인덱스(`(a)` ⊂ `(a,b)`) 없는가. 미사용 인덱스(`pg_stat_user_indexes.idx_scan=0`)는 정리.
- [ ] 인덱스가 많아 DML이 느려지지 않는가(쓰기 부하 vs 조회 이득).
