# nl-sql-query Knowledge Base — 색인 (INDEX)

> 자연어→SQL 워크플로의 인용 가능한 KB. dialect 차이는 각 DB 공식 문서(postgresql.org/docs,
> dev.mysql.com/doc, learn.microsoft.com/sql)를 distill했고, 워크플로·결과 제시 규약은 내부 방법론이다.
> 각 파일 frontmatter에 `source`·`last_fetched`·`skills`를 담는다.
> **사용법**: 작업 단계에 맞는 KB를 먼저 읽고, 그 "리뷰 훅"으로 점검하며, 지적 시 KB의 `source`를 근거로 인용한다.

## 작업 단계 → 읽을 KB

### 질문 해석·SQL 구성 (authoring)
| KB | 다룸 |
|----|------|
| [nl-to-sql-workflow](nl-to-sql-workflow.md) | NL 용어→스키마 매핑, 집계/조인/필터/정렬/페이지네이션 분해, 모호성 처리 |

### dialect 문법 (writing correct SQL)
| KB | 다룸 |
|----|------|
| [dialect-differences](dialect-differences.md) | PostgreSQL/MySQL/MS-SQL 식별자·행제한·페이지네이션·자리표시자·문자열연결·날짜함수·불리언·식별자 폴딩·information_schema |

### 결과 제시 (presentation)
| KB | 다룸 |
|----|------|
| [result-presentation](result-presentation.md) | 결과 표 + 사용한 SQL + 행수/절단 + 추정·주의, 빈결과·다건, PII 과다 노출 자제 |

## 원칙 문서와의 관계
- 상위 판단 기준은 `../principles.md`(헌법). KB는 그 원칙의 **공식 문서 근거·세부 규칙**.
- dialect 단정이 충돌하면 **KB(각 DB 공식 문서)가 우선**한다.

## 갱신
- 각 파일 `last_fetched` 기준. DB 메이저 버전 변화(예: PostgreSQL/MySQL/SQL Server 신버전) 시 `source` URL을 다시 fetch해 갱신.
- TODO(차기): 윈도우 함수 dialect 차이, CTE 재귀 차이, JSON/배열 타입 질의, 타임존 처리 상세.
