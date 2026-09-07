# JPA Entity Knowledge Base — 색인 (INDEX)

> JPA/Hibernate/Kotlin **공식 문서**를 distill한 인용 가능한 KB. 각 파일은 frontmatter에
> `title`·`source`(원문 URL)·`last_fetched`·`skills`를 담는다.
> **리뷰 시 사용법**: 작업 유형에 맞는 KB 파일을 먼저 읽고, 그 "리뷰 훅"으로 점검하며,
> 지적할 때 KB의 `source` URL을 근거로 인용한다. (예: "Hibernate User Guide `equals/hashCode` 기준 …")

## 작업 유형 → 읽을 KB

### 새 엔티티 매핑
| KB | 다룸 |
|----|------|
| [entity-mapping-basics](entity-mapping-basics.md) | @Entity/@Table/@Column/@Id, access type, 스키마 한정 |
| [identity-strategies](identity-strategies.md) | @GeneratedValue, 복합키, 자연/인조키 |
| [kotlin-entity-pitfalls](kotlin-entity-pitfalls.md) | data class 금지, all-open/no-arg, val·var |

### 정체성·동등성
| KB | 다룸 |
|----|------|
| [equals-hashcode](equals-hashcode.md) | 생성 id 함정, 비즈니스 키, 프록시 대응 |

### 연관관계·성능
| KB | 다룸 |
|----|------|
| [associations-fetching](associations-fetching.md) | 관계 유형, 소유측, LAZY, N+1, cascade |

### 영속 상태·운영
| KB | 다룸 |
|----|------|
| [entity-lifecycle-state](entity-lifecycle-state.md) | 엔티티 상태, dirty checking, @Version, Persistable, auditing |

## KB 한 줄 요약
| KB | 한 줄 |
|----|-------|
| [entity-mapping-basics](entity-mapping-basics.md) | 기본 매핑 어노테이션과 스키마 한정 @Table 규칙 |
| [identity-strategies](identity-strategies.md) | 식별자 생성 전략 trade-off와 복합키 매핑 |
| [equals-hashcode](equals-hashcode.md) | 엔티티 동등성을 안전하게 구현하는 법 |
| [associations-fetching](associations-fetching.md) | 관계 방향·소유와 N+1 회피 |
| [kotlin-entity-pitfalls](kotlin-entity-pitfalls.md) | Kotlin로 엔티티 쓸 때 지켜야 할 것들 |
| [entity-lifecycle-state](entity-lifecycle-state.md) | 영속 컨텍스트·상태·Persistable·감사 |

## 원칙 문서와의 관계
- 상위 원칙은 `../principles.md`(헌법). KB는 그 원칙의 **공식 문서 근거·세부 규칙**.
- **충돌 시 KB(공식 문서)가 우선**하며, principles는 통찰·판단 기준을 보탠다.

## 갱신
- 각 파일 `last_fetched` 기준. JPA/Hibernate/Kotlin/Spring 메이저 업그레이드 시 `source` URL을
  다시 fetch해 갱신한다.
- TODO(차기 KB 후보): `@Embeddable` 값 타입·컬렉션, 상속 매핑(SINGLE_TABLE/JOINED),
  컨버터(`AttributeConverter`), 2차 캐시, `@Filter`/소프트 삭제, 멀티테넌시.
