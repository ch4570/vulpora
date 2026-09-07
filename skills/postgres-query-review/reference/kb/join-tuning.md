---
title: 조인 튜닝 (Join Tuning)
source: https://www.postgresql.org/docs/current/planner-optimizer.html
last_fetched: 2026-06-24
skills: [postgres-query-review]
---

# 조인 튜닝 (Join Tuning)

> 출처: PostgreSQL `Planner/Optimizer`·`Controlling the Planner with Explicit JOIN Clauses`(공식) + 『친절한 SQL 튜닝』 4장(통찰 보강).

## 1. 세 가지 조인 방식

| 방식 | 메커니즘 | 유리한 상황 | 위험 신호 |
|------|----------|-------------|-----------|
| **Nested Loop** | 바깥 각 행마다 안쪽을 인덱스로 탐색 | 바깥이 소량 + 안쪽 조인키에 인덱스 (OLTP) | 바깥이 대량이면 `loops` 폭증 |
| **Merge Join** | 양쪽 정렬 후 머지 | 양쪽 대량 + 이미 정렬됨 | 정렬 비용(`work_mem` 초과) |
| **Hash Join** | 작은 쪽 해시 build, 큰 쪽 probe | 대량 + 등치 조인, 인덱스 없어도 OK (배치/OLAP) | `Batches>1`(메모리 부족) |

PostgreSQL은 통계·비용으로 셋 중 자동 선택한다. **Oracle식 `USE_NL`/`USE_HASH` 힌트는 없다.**

## 2. NL 조인 튜닝 포인트 (책 4.1)

- **안쪽(후행) 테이블의 조인 컬럼에 인덱스**가 있어야 한다. 없으면 매 반복이 Seq Scan → 재앙.
- **바깥(선행)을 작게** 만든다(선택도 높은 필터 먼저 적용되도록).
- EXPLAIN에서 `Nested Loop` 안쪽 노드의 `rows × loops`가 실제 작업량.

## 3. 조인 순서

- **결과를 가장 많이 줄이는(작은) 집합을 선행**으로. PostgreSQL이 `join_collapse_limit`
  (기본 8) 안에서 순서를 탐색한다.
- 조인 테이블이 많아 플래너가 최적 순서를 못 찾으면(계획 시간↑, 나쁜 계획):
  - 통계를 정확히(`ANALYZE`, 상관컬럼 `CREATE STATISTICS`).
  - 정말 필요하면 `SET join_collapse_limit`/`from_collapse_limit` 조정 또는 명시적 JOIN 구문으로
    순서 고정(최후 수단). `pg_hint_plan` 확장은 선택지이나 의존 전에 통계부터.

## 4. 서브쿼리와 조인 (책 4.4)

- **상관 서브쿼리**(`EXISTS`, `= ANY`, `IN`)는 플래너가 **세미조인(semi join)**/조인으로 변환.
  결과 중복을 만들지 않으므로 **`EXISTS`가 안전**. `IN (서브쿼리)`도 동일하게 풀린다.
- **`NOT IN (서브쿼리)` 주의**: 서브쿼리에 NULL이 있으면 **결과가 전부 사라지는** 표준 SQL 함정.
  → **`NOT EXISTS`** 또는 `LEFT JOIN ... WHERE r.key IS NULL` (anti join)로 대체.
- **스칼라 서브쿼리**(SELECT 절): 행마다 실행될 수 있다 → 조인이나 윈도우 함수로 대체 검토.
- **불필요한 중첩/뷰**: 뷰 머징이 막히면(예: `LIMIT`, `DISTINCT`, 윈도우 포함) 최적화가 갇힌다.

## 5. 자주 나오는 처방

```sql
-- 안티조인: NOT IN → NOT EXISTS (NULL 안전 + 인덱스 활용)
SELECT * FROM orders o
WHERE NOT EXISTS (SELECT 1 FROM refunds r WHERE r.order_id = o.id);

-- 존재 여부만 필요 → EXISTS (중복/전체 스캔 방지)
SELECT * FROM customers c
WHERE EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id);

-- "각 그룹의 최신 1건" → DISTINCT ON (PG 고유, 정렬 인덱스와 궁합 좋음)
SELECT DISTINCT ON (customer_id) *
FROM orders ORDER BY customer_id, created_at DESC;

-- "각 그룹 Top-N" → LATERAL 조인
SELECT c.id, x.*
FROM customers c
CROSS JOIN LATERAL (
  SELECT * FROM orders o WHERE o.customer_id = c.id
  ORDER BY o.created_at DESC LIMIT 3
) x;
```

## 리뷰 훅

- [ ] 조인 컬럼 타입이 양쪽 동일한가(형변환으로 인덱스/해시 깨지지 않는가).
- [ ] 안쪽(NL) 조인 컬럼에 인덱스가 있는가.
- [ ] `NOT IN` 서브쿼리에 NULL 가능성은 없는가 → `NOT EXISTS`로.
- [ ] 조인 결과가 의도치 않게 곱(fan-out)으로 불어나지 않는가(중복 → 집계 왜곡).
- [ ] `Hash Join`의 `Batches>1`이면 `work_mem` 또는 조인 대상 축소 검토.
