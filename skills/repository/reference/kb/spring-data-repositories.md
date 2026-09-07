---
title: Spring Data 리포지토리 핵심 개념
source: https://docs.spring.io/spring-data/jpa/reference/repositories/core-concepts.html
last_fetched: 2026-06-24
skills: [repository]
---

# Spring Data 리포지토리 핵심 개념

## 리포지토리 인터페이스 계층
- **`Repository<T, ID>`** — 마커 인터페이스. 관리 대상 타입·ID 타입을 캡처한다(저장소 추상화의 최상위).
- **`CrudRepository<T, ID>`** — 표준 CRUD: `save`, `saveAll`, `findById`, `findAll`, `existsById`, `count`, `delete`, `deleteById`, `deleteAll`.
- **`PagingAndSortingRepository<T, ID>`** — 페이징·정렬(`Pageable`, `Sort`)을 추가. (Spring Data 3.x에서 별도 분리)
- **`JpaRepository<T, ID>`** — JPA 특화. flush, batch delete, `getReferenceById` 등 추가. **도메인 리포지토리의 기본 베이스.**

```kotlin
interface OrderEntityRepository : JpaRepository<OrderEntity, String>
```

## 자동 구현
- 인터페이스만 선언하면 Spring Data가 **런타임 프록시로 구현체를 생성**한다. 구현 클래스를 직접 작성하지 않는다.
- `@Repository`는 인터페이스에 **붙이지 않아도** 자동 등록·예외 변환(`PersistenceExceptionTranslation`)이 적용된다. (직접 작성하는 JDBC/집계 **클래스**에는 `@Repository`를 붙인다.)

## save / saveAll
- `save(entity)` — 새 엔티티면 INSERT, 식별자가 있으면 MERGE/UPDATE. 반환값(병합된 인스턴스)을 사용하라.
- `saveAll(entities)` — 컬렉션 저장. **JPA에서는 내부적으로 건별 `save` 반복**이라 진정한 배치가 아니다. 대량 처리는 JDBC batch(별도 `*JdbcRepository`)를 고려.
- 새 엔티티 판별은 식별자 null 또는 `Persistable.isNew()`로 결정된다.

## 커스텀 리포지토리 (Impl 패턴)
표준/파생 쿼리로 표현 못 하는 동작은 커스텀 프래그먼트로 분리한다.
```kotlin
interface OrderRepositoryCustom { fun searchComplex(cond: Cond): List<OrderEntity> }
class OrderRepositoryCustomImpl(private val queryFactory: JPAQueryFactory) : OrderRepositoryCustom { /* QueryDSL */ }
interface OrderEntityRepository : JpaRepository<OrderEntity, String>, OrderRepositoryCustom
```
- 구현 클래스 이름은 **프래그먼트 인터페이스명 + `Impl`** 규칙을 따라야 자동 연결된다.

## exists / count
- `existsById(id)`·파생 `existsBy…`는 존재 확인에 `findById` 후 null 체크보다 가볍다(엔티티 미적재).
- `count()`·파생 `countBy…`는 집계 쿼리. 대용량에서 전체 count는 비싸다 → 4(페이지네이션) 참고.

## 리뷰 훅
- [ ] 도메인 JPA 리포지토리는 `JpaRepository`를 상속한 **인터페이스**인가? (구현 클래스 직접 작성 금지)
- [ ] 인터페이스에 불필요한 `@Repository`를 붙이지 않았는가?
- [ ] 직접 작성한 JDBC/집계 **클래스**에는 `@Repository`가 있는가?
- [ ] 존재 확인에 `findById` 대신 `existsBy…`/`existsById`를 썼는가?
- [ ] 커스텀 프래그먼트 구현 클래스 이름이 `…Impl` 규칙을 따르는가?
- [ ] `save` 반환값(병합 인스턴스)을 사용하는가? 대량 저장에 `saveAll`을 진짜 배치로 오해하지 않았는가?
