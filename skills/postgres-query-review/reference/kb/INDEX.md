# PostgreSQL 쿼리 검토 KB — 색인 (INDEX)

> PostgreSQL **공식 문서**를 distill한 인용 가능한 KB. 각 파일은 frontmatter에
> `source`(원문 URL)·`last_fetched`·`skills`를 담는다.
> **리뷰 시 사용법**: 작업 유형에 맞는 KB를 먼저 읽고, 그 **`## 리뷰 훅`** 체크리스트로 점검하며,
> 지적할 때 KB의 `source` URL을 근거로 인용한다. (예: "PG `Using EXPLAIN` 기준 …")

## 작업 유형 → 읽을 KB

| 작업 유형 | 읽을 KB |
|-----------|---------|
| 느린 쿼리 진단·실행계획 해석 | [execution-plan](execution-plan.md) |
| 인덱스 부재/무력화·인덱스 설계 | [index-tuning](index-tuning.md) |
| 조인 방식/순서·서브쿼리 검토 | [join-tuning](join-tuning.md) |
| `SELECT *`·페이지네이션·N+1 등 안티패턴 | [sql-antipatterns](sql-antipatterns.md) |

## 각 KB 한 줄 요약

| KB | 다룸 |
|----|------|
| [execution-plan](execution-plan.md) | `EXPLAIN (ANALYZE, BUFFERS)` 노드·신호, loops 곱셈, 진단 시스템 뷰 |
| [index-tuning](index-tuning.md) | 인덱스 본질·손익분기점, 무력화 패턴, 결합 컬럼 순서, 종류 선택, 부분/표현식/커버링 |
| [join-tuning](join-tuning.md) | NL/Merge/Hash 선택, NL 튜닝, 조인 순서, 세미/안티 조인, `DISTINCT ON`·LATERAL |
| [sql-antipatterns](sql-antipatterns.md) | 성능 안티패턴 표, keyset 페이지네이션, NULL 함정, upsert/재귀/윈도우, 바인딩 |

## 원칙 문서와의 관계
- 상위 원칙·판단 기준은 `../principles.md`(헌법). KB는 그 원칙의 **공식 문서 근거·세부 규칙**.
- 충돌 시 **KB(공식 문서)가 principles(책 통찰)보다 우선**한다.

## 갱신
- 각 파일 `last_fetched` 기준. PG 메이저 업그레이드 시 `source` URL을 다시 fetch해 갱신.
- TODO(차기 KB 후보): parallel query, JSONB 연산자/GIN, planner statistics(`CREATE STATISTICS`),
  function volatility(WHERE 함수의 인덱스 영향), bulk loading(`COPY`).
