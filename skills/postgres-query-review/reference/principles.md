# PostgreSQL 쿼리 검토 — 핵심 원칙 (Principles)

> 이 문서는 쿼리 튜닝의 통찰·판단 기준을 담은 "헌법"이다. KB가 "사실·규칙"이라면 여기는
> "왜·언제·어느 것을 고를지"의 판단 기준이다. **충돌 시 KB(공식 문서)가 우선**한다.
>
> **출처(Sources)**
> - PostgreSQL 공식 문서: `Performance Tips`(Using EXPLAIN), `Indexes`, `Queries`,
>   `Planner/Optimizer` (docs/current)
> - 조시형, 『친절한 SQL 튜닝』(디비안) — SQL 처리/IO, 인덱스, 조인, 소트, 옵티마이저 통찰
> - 『불친절한 SQL / PL SQL 프로그래밍』(디비안) — SQL 함수/집합/분석함수/NULL/계층
>
> 책은 대부분 Oracle 기준이므로 Oracle 고유 개념은 PostgreSQL 등가물로 치환해 적용한다
> (예: 힌트 `/*+ INDEX */` → 통계·인덱스·쿼리구조 유도, `ROWNUM` → `LIMIT`).

---

## 1. 옵티마이저는 통계가 전부다
- SQL은 **선언적**이다. "무엇을" 선언하면 "어떻게"는 옵티마이저가 만든다. 튜닝의 본질은
  **옵티마이저가 좋은 계획을 고르도록 정보를 주는 것**이다.
- 옵티마이저는 **비용(Cost) 기반**이며 cost는 추정치다. 통계가 틀리면 계획도 틀린다.
- 대량 변경 후 `ANALYZE`, autovacuum 유지. **추정 vs 실제 행수 괴리**가 크면 통계 노후 또는
  상관관계 문제 → `ANALYZE` / `CREATE STATISTICS`.

## 2. 실행계획을 먼저, 그리고 실측으로 읽어라
- `EXPLAIN`(계획만) → `EXPLAIN (ANALYZE, BUFFERS)`(실제 실행)의 순서. **cost가 낮다고 빠른 게
  아니다.** 실측으로 확인한다.
- 쓰기 쿼리의 `ANALYZE`는 `BEGIN; ... ROLLBACK;`으로 감싼다.
- 개선 주장은 **수정 전후 `EXPLAIN ANALYZE` 비교로만** 확정한다.

## 3. 인덱스는 만능이 아니다 — 효용은 랜덤 액세스 감소에서 나온다
- 인덱스의 효용 = 테이블 랜덤 액세스를 줄이는 것. **손익분기점**을 넘으면 Seq Scan이 더 싸다.
- **선행 컬럼을 가공하면 인덱스를 못 탄다**(함수·형변환·좌측 와일드카드). 상수 쪽 가공 또는
  표현식/부분 인덱스로 푼다.
- 결합 인덱스 컬럼 순서: **등치(=) → 범위 → 정렬**. 인덱스 과잉은 DML·공간 비용이다.

## 4. 조인은 데이터 양과 인덱스로 방식이 갈린다
- 소량 OLTP + 안쪽 인덱스 → Nested Loop. 대량 등치 조인 → Hash Join. PG가 통계로 자동 선택하며
  **Oracle식 조인 힌트는 없다** → 통계 최신화가 1순위 대응.
- **결과를 가장 많이 줄이는 집합을 선행**으로. `NOT IN(서브쿼리)`은 NULL 함정 → `NOT EXISTS`.

## 5. 가장 싼 튜닝은 일을 줄이는 것
- 불필요한 `SELECT *`/`DISTINCT`/`ORDER BY`/`UNION` 제거. 중복 없으면 `UNION ALL`.
- 깊은 `OFFSET` 페이지네이션은 keyset(seek)으로. Top-N은 `ORDER BY ... LIMIT` + 정렬 인덱스로.
- 루프 안 단건 쿼리(N+1)는 조인/`= ANY($1)` 배치로 묶는다.

## 6. WHERE의 함수 변동성을 의식하라
- WHERE/표현식의 함수가 `VOLATILE`이면 매행 실행되고 인덱스를 못 쓴다. 가능하면 `STABLE`/
  `IMMUTABLE`로 선언하거나 값을 미리 계산한다.

## 7. 보안과 성능을 동시에: 파라미터 바인딩
- 모든 값은 **placeholder 바인딩**으로. 문자열 연결은 SQL 인젝션 + 하드파싱(plan 재사용 불가).
  동적 식별자는 `format('%I', ...)`/`quote_ident()`로 escape.
