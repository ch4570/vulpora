# Schema Doc Extract Knowledge Base — 색인 (INDEX)

> 마이그레이션·코드에서 스키마를 정적 추출해 ERD + 테이블 명세를 만드는 인용 가능한 KB.
> 각 파일 frontmatter에 `source`·`last_fetched`·`skills`를 담는다.
> **사용법**: 작업 유형에 맞는 KB를 먼저 읽고, 그 "리뷰 훅"으로 점검하며, 지적 시 KB의 `source`를 근거로 인용한다.

## 작업 유형 → 읽을 KB

### 추출 (extraction)
| KB | 다룸 |
|----|------|
| [extraction-workflow](extraction-workflow.md) | 마이그레이션 누적 리플레이 → 누적 스키마 모델, ORM 메타데이터 병합, drift 화해 알고리즘 |

### 렌더링 (rendering)
| KB | 다룸 |
|----|------|
| [mermaid-erdiagram-syntax](mermaid-erdiagram-syntax.md) | Mermaid erDiagram 문법, crow's-foot 카디널리티 토큰, 완전한 동작 예시 |

### 산출 (output)
| KB | 다룸 |
|----|------|
| [output-layout](output-layout.md) | 하우스 산출 레이아웃(**테이블 명세는 스키마당 `tables/<schema>.md` 분리** + `_index.md`, ERD는 단일 `erd.md`), `컬럼|타입|NULL|기본값|키|설명` 명세 포맷, 인덱스/제약/관계 하위 섹션, diff용 정렬 |

## 원칙 문서와의 관계
- 상위 판단 기준은 `../principles.md`(헌법). KB는 그 원칙의 **공식 문서 근거·세부 규칙·알고리즘**.
- 충돌 시 **KB(공식 문서)가 우선**한다. 단 `output-layout`은 내부 규약이므로 프로젝트 관례가 있으면 그것이 우선.

## 갱신
- 각 파일 `last_fetched` 기준. Mermaid/Flyway 메이저 변화 시 `source` URL을 다시 fetch해 갱신.
- TODO(차기): 파티션·상속 테이블 처리, 뷰/함수(R__) 표현, 멀티 스키마 ERD 분할, 시퀀스·트리거 표기.
