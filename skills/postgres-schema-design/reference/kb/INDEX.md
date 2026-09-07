# PostgreSQL 스키마 설계 KB — 색인 (INDEX)

> PostgreSQL **공식 문서**를 distill한 인용 가능한 KB. 각 파일은 frontmatter에
> `source`(원문 URL)·`last_fetched`·`skills`를 담는다.
> **리뷰 시 사용법**: 설계 주제에 맞는 KB를 먼저 읽고, 그 **`## 리뷰 훅`** 체크리스트로 점검하며,
> 지적할 때 KB의 `source` URL을 근거로 인용한다. (예: "PG `Constraints` 기준 …")

## 작업 유형 → 읽을 KB

| 작업 유형 | 읽을 KB |
|-----------|---------|
| 엔티티/관계/정규화·일반화·식별자 전략 | [data-modeling](data-modeling.md) |
| PK/NOT NULL/FK/UNIQUE/CHECK/EXCLUDE | [constraints-integrity](constraints-integrity.md) |
| 점/선분 이력·기간 중첩 방지·감사·소프트 삭제 | [history-modeling](history-modeling.md) |
| 명명 규칙·데이터 표준화·도메인 타입 | [naming-standards](naming-standards.md) |

## 각 KB 한 줄 요약

| KB | 다룸 |
|----|------|
| [data-modeling](data-modeling.md) | 6대 질적 특성, 엔티티/관계/속성, 정규화, 일반화/특수화 물리구현, 식별자 전략 |
| [constraints-integrity](constraints-integrity.md) | 제약 종류 표, FK 인덱스, NULL/UNIQUE 함정, EXCLUDE, 생성컬럼/도메인, 무결성 검증 쿼리 |
| [history-modeling](history-modeling.md) | 점 vs 선분 이력, range+EXCLUDE 중첩 금지, 감사 컬럼/로그, 소프트 삭제, 이력 파티셔닝 |
| [naming-standards](naming-standards.md) | PG 식별자 규칙(소문자/snake_case), 명명 표준 표, 데이터 표준화, 컬럼 순서, 안티패턴 |

## 원칙 문서와의 관계
- 상위 원칙·판단 기준은 `../principles.md`(헌법). KB는 그 원칙의 **공식 문서 근거·세부 규칙**.
- 충돌 시 **KB(공식 문서)가 principles(책 통찰)보다 우선**한다.

## 갱신
- 각 파일 `last_fetched` 기준. PG 메이저 업그레이드 시 `source` URL을 다시 fetch해 갱신.
- TODO(차기 KB 후보): data types 상세(numeric/timestamptz/uuid/enum/range), generated columns,
  partitioning(RANGE/LIST/HASH·pruning·UNIQUE), jsonb 남용 경계·인덱싱.
