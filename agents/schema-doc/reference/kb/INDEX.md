# Schema Cartographer Knowledge Base — 색인 (INDEX)

> 공식 문서(Flyway·JPA·Mermaid)와 모델링 이론을 distill한 인용 가능한 KB. 각 파일은 frontmatter에
> `title`·`source`(원문 URL)·`last_fetched`·`consumers`를 담는다.
> **사용법**: 작업 단계에 맞는 KB를 먼저 읽고, 그 "리뷰 훅"으로 자기 점검하며,
> 근거를 댈 때 KB의 `source` URL을 인용한다. (예: "Flyway docs 기준 V 적용 순서 …")

## 작업 단계 → 읽을 KB

### 소스 도출 (마이그레이션 + 코드)
| KB | 다룸 |
|----|------|
| [extraction-workflow](extraction-workflow.md) | 마이그레이션 누적 리플레이, ORM 병합, drift 화해의 전체 절차 |
| [flyway-schema-replay](flyway-schema-replay.md) | V/R 버전 순서 리플레이로 누적 스키마 재구성, ADD/DROP/RENAME/타입변경/인덱스/제약 적용, 파일명 순서 |
| [orm-entity-extraction](orm-entity-extraction.md) | ORM 어노테이션에서 테이블/컬럼/관계/enum 추출(JPA 일반), 명명 전략, 드리프트 caveat |

### 관계 모델링
| KB | 다룸 |
|----|------|
| [relationship-cardinality-inference](relationship-cardinality-inference.md) | FK·UNIQUE·조인테이블·nullable로 1:1/1:N/N:M·선택성 추론 |

### 산출물 작성 (ERD + 명세)
| KB | 다룸 |
|----|------|
| [output-layout](output-layout.md) | 결정적 디렉터리 레이아웃, 스키마별 명세 분리, 정렬·drift 규칙 |
| [mermaid-erdiagram-syntax](mermaid-erdiagram-syntax.md) | Mermaid `erDiagram` 문법: 엔티티 블록, 속성 줄, 관계·crow's-foot 토큰, 인용/이스케이프 |
| [table-spec-format](table-spec-format.md) | 하우스 포맷: 테이블별 컬럼 표(컬럼/타입/NULL/기본값/키/설명) + 인덱스·제약·관계 목록 |

## 원칙 문서와의 관계
- 상위 원칙(물리 우선·발명 금지·결정론 등)은 `../principles.md`(헌법). KB는 그 원칙의 **공식 문서 근거·세부 규칙**.
- 충돌 시 **KB(공식 문서)가 우선**하며, principles는 모델링 통찰을 보탠다.

## 갱신
- 각 파일 `last_fetched` 기준. Flyway/JPA/Mermaid 메이저 변경 시 `source` URL을 다시 fetch해 갱신.
- TODO(차기): Liquibase/Alembic/Prisma 마이그레이션 리플레이 KB, dbml/PlantUML 출력 포맷 KB, 뷰·시퀀스·파티션 표기 KB.
