---
title: SQL 안티패턴과 PostgreSQL 처방
source: https://www.postgresql.org/docs/current/queries.html
last_fetched: 2026-06-24
skills: [postgres-query-review]
---

# SQL 안티패턴과 PostgreSQL 처방

> 출처: PostgreSQL `Queries`·`Functions and Operators`(공식) + 『친절한 SQL 튜닝』·『불친절한 SQL 프로그래밍』(통찰 보강). Oracle 구문은 PG로 치환.

## 1. 성능 안티패턴

| 안티패턴 | 왜 나쁜가 | 처방 |
|----------|-----------|------|
| `SELECT *` | 불필요 컬럼 전송, Index-Only Scan 무력화 | 필요한 컬럼만 명시 |
| WHERE 절 컬럼 가공 | 인덱스 무력화 | 상수쪽 가공 / 표현식 인덱스 |
| `OFFSET 100000 LIMIT 20` | 앞 10만행 다 읽고 버림 | keyset: `WHERE id > $last ORDER BY id LIMIT 20` |
| `COUNT(*)` 전체 카운트 | 대형 테이블 풀스캔 | 근사치 `pg_class.reltuples`, 또는 카운터 테이블 |
| `UNION` (중복 없는데) | 불필요한 정렬/중복제거 | `UNION ALL` |
| `DISTINCT`로 조인 중복 덮기 | 잘못된 조인을 가림 | 조인 조건 수정 / `EXISTS` |
| `NOT IN (서브쿼리)` | NULL이면 결과 소실 | `NOT EXISTS` |
| 함수 기반 필터(`VOLATILE`) | 매행 실행, 인덱스 불가 | `STABLE`/`IMMUTABLE`로 선언, 값 미리 계산 |
| 루프 안 단건 쿼리(N+1) | 왕복 폭증 | 조인 / `= ANY($1)` 배치 / `IN` |
| 와일드카드 앞 `LIKE '%x'` | 인덱스 불가 | `pg_trgm` GIN, 전문검색 |
| 큰 IN 리스트 수만 개 | 파싱/계획 비용 | `= ANY(ARRAY[...])` / 임시테이블 조인 |

## 2. 페이지네이션: OFFSET vs Keyset

```sql
-- 나쁨: 깊은 페이지일수록 느려짐
SELECT * FROM posts ORDER BY created_at DESC OFFSET 100000 LIMIT 20;

-- 좋음: keyset/seek (인덱스 (created_at, id) 필요)
SELECT * FROM posts
WHERE (created_at, id) < ($last_created_at, $last_id)
ORDER BY created_at DESC, id DESC
LIMIT 20;
```

## 3. NULL 함정 (책 『불친절한 SQL』 NULL 관련 함수 장)

- `NULL = NULL` → `NULL`(거짓). NULL 비교는 항상 `IS NULL` / `IS DISTINCT FROM`.
- 집계: `COUNT(col)`은 NULL 제외, `COUNT(*)`는 포함. `SUM`/`AVG`는 NULL 무시.
- `col IN (a, b, NULL)` 과 `col NOT IN (a, b, NULL)`의 비대칭 주의(위 1번 표).
- 정렬: NULL은 기본적으로 가장 큼(`NULLS LAST` on ASC는 명시 필요). 인덱스와 `NULLS` 순서 일치.
- Oracle `NVL`→`COALESCE`, `DECODE`→`CASE`, `NVL2`→`CASE`.

## 4. 업서트 / 멱등 쓰기 (Oracle `MERGE` 대체)

```sql
INSERT INTO inventory (sku, qty) VALUES ($1, $2)
ON CONFLICT (sku) DO UPDATE
SET qty = inventory.qty + EXCLUDED.qty;
```
- PG15+는 `MERGE`도 지원하나, 단순 upsert는 `ON CONFLICT`가 간결·안전.

## 5. 계층/재귀 (Oracle `CONNECT BY` 대체)

```sql
WITH RECURSIVE tree AS (
  SELECT id, parent_id, name, 1 AS depth FROM categories WHERE parent_id IS NULL
  UNION ALL
  SELECT c.id, c.parent_id, c.name, t.depth + 1
  FROM categories c JOIN tree t ON c.parent_id = t.id
)
SELECT * FROM tree;
```

## 6. 윈도우 함수로 self-join/서브쿼리 제거

```sql
-- 직전 행과 비교, 누적합, 순위 등은 윈도우 함수가 정석
SELECT *,
  LAG(amount) OVER (PARTITION BY customer_id ORDER BY created_at)  AS prev_amount,
  SUM(amount) OVER (PARTITION BY customer_id ORDER BY created_at)  AS running_total,
  ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY created_at DESC) AS rn
FROM orders;
```

## 7. 대량 처리

- 단건 `INSERT` 반복 < **다중행 `INSERT`** < **`COPY`**(가장 빠름). 적재 시 인덱스/제약은
  나중에. 상세는 risk-check 스킬의 대량 백필 가이드.
- 대량 `UPDATE`/`DELETE`는 한 트랜잭션에 몰지 말고 **청크 분할**(락·WAL·롤백·bloat 완화).

## 8. 보안 (항상)

- **파라미터 바인딩**만 사용. 문자열 연결로 SQL을 만들지 않는다(인젝션 + 하드파싱).
- 동적 식별자(테이블/컬럼명)가 불가피하면 `format('%I', ident)` / `quote_ident()`로 escape.

## 리뷰 훅

- [ ] `SELECT *`·불필요한 `DISTINCT`/`ORDER BY`/`UNION`(중복 없으면 `UNION ALL`)이 없는가.
- [ ] 깊은 `OFFSET` 페이지네이션을 keyset(seek)으로 바꿀 수 있는가.
- [ ] `NOT IN (서브쿼리)`를 `NOT EXISTS`로 바꿔 NULL 함정을 피했는가.
- [ ] WHERE의 함수가 `VOLATILE`이라 매행 실행·인덱스 불가가 되지 않는가.
- [ ] 루프 안 단건 쿼리(N+1)를 조인/`= ANY($1)` 배치로 묶었는가.
- [ ] upsert는 `ON CONFLICT`, 계층은 `WITH RECURSIVE`, self-join은 윈도우 함수로 단순화했는가.
- [ ] 모든 값 입력에 파라미터 바인딩을 쓰고 문자열 연결을 배제했는가(인젝션·하드파싱).
