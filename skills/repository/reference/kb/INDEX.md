# Repository(영속 접근) Knowledge Base — 색인 (INDEX)

> Spring Data JPA·Jakarta Persistence·Spring Framework **공식 문서**를 distill한 인용 가능한 KB.
> 각 파일은 frontmatter에 `source`(원문 URL)·`last_fetched`·`skills`를 담는다.
> **리뷰 시 사용법**: 작업 유형에 맞는 KB 파일을 먼저 읽고, 그 "리뷰 훅"으로 점검하며,
> 지적할 때 KB의 `source` URL을 근거로 인용한다. (예: "Spring Data `Pageable` 기준 …")

## 작업 유형 → 읽을 KB

### 쿼리 작성
| KB | 다룸 |
|----|------|
| [query-methods](query-methods.md) | 파생 쿼리(findBy/existsBy/countBy/deleteBy + And/Or/Between/In/Like/OrderBy), 한계, @Query(JPQL/native), named param, @Modifying |
| [spring-data-repositories](spring-data-repositories.md) | Repository/CrudRepository/JpaRepository 계층, 자동 구현, save/saveAll, 커스텀(Impl), exists/count |

### 페이지네이션
| KB | 다룸 |
|----|------|
| [pagination-sorting](pagination-sorting.md) | Pageable/Page/Slice/Sort, count 비용, Slice로 count 회피, keyset/cursor, Sort 안전성 |

### 성능 (N+1)
| KB | 다룸 |
|----|------|
| [n-plus-one-fetch](n-plus-one-fetch.md) | N+1 원리, fetch join, @EntityGraph, batch size, DTO projection, 페이징+컬렉션 fetch 주의 |

### 트랜잭션·락
| KB | 다룸 |
|----|------|
| [transactions-readonly](transactions-readonly.md) | @Transactional 경계(서비스), readOnly 최적화, 전파, lost update, 비관적/낙관적 락 |

### 빈 구성
| KB | 다룸 |
|----|------|
| [bean-naming](bean-naming.md) | 빈 이름 규칙·충돌, override=false 부팅 실패, 내장 빈명 충돌 회피(Job/Spring Batch), 타입 기반 주입 |

## 한 줄 요약

| KB | 한 줄 |
|----|------|
| spring-data-repositories | 인터페이스만 선언하면 구현은 자동 생성 — JPA repo는 인터페이스, JDBC/집계는 클래스 |
| query-methods | 단순은 파생 쿼리, 복잡하면 @Query/QueryDSL — named param·@Modifying |
| pagination-sorting | 다건은 항상 페이징 — count 불필요하면 Slice, 대용량은 keyset |
| n-plus-one-fetch | LAZY 반복 접근이 N+1 — fetch join/@EntityGraph/batch size로 제거 |
| transactions-readonly | 트랜잭션은 서비스가 소유 — 조회는 readOnly, 동시성은 락 |
| bean-naming | 빈명 충돌은 부팅 실패 — 내장 빈명 피하고 타입 기반 주입 |

## 원칙 문서와의 관계
- 상위 원칙은 [`../principles.md`](../principles.md)(헌법). KB는 그 원칙의 **공식 문서 근거·세부 규칙**이다.
- 충돌 시 **KB(공식 문서)가 우선**하며, principles는 상위 통찰을 보탠다.
- 원칙↔KB 대응: 추상화/쿼리(원칙 2)→query-methods·spring-data-repositories, 페이지네이션(원칙 3)→pagination-sorting,
  N+1(원칙 4)→n-plus-one-fetch, 읽기 전용 트랜잭션(원칙 1·5)→transactions-readonly, 타입 주입·빈명(원칙 7)→bean-naming.

## 갱신
- 각 파일 `last_fetched` 기준. Spring Data/Spring Framework 메이저 업그레이드 시 `source` URL을 다시 fetch해 갱신.
- TODO(차기): projection(인터페이스/DTO/동적), Specification/Criteria, auditing(@CreatedDate), 멀티 데이터소스/트랜잭션 KB 추가 여지.
