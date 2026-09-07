---
title: 쿼리 메서드 (파생 쿼리·@Query)
source: https://docs.spring.io/spring-data/jpa/reference/jpa/query-methods.html
last_fetched: 2026-06-24
skills: [repository]
---

# 쿼리 메서드 (파생 쿼리·@Query)

> 보조 출처: https://docs.spring.io/spring-data/jpa/reference/jpa/query-methods-details.html

## 파생 쿼리 메서드 (메서드 이름 → 쿼리)
메서드 이름을 파싱해 쿼리를 자동 생성한다. **주어(intro) + 술어(criteria)** 구조.

- 주어: `findBy…`, `readBy…`, `getBy…`, `queryBy…`, `countBy…`, `existsBy…`, `deleteBy…`
- 술어 연결: `And`, `Or`
- 비교: `Between`, `LessThan`, `GreaterThan`, `In`, `Like`/`Containing`/`StartingWith`, `IsNull`, `True`/`False`, `IgnoreCase`
- 정렬: `OrderBy<Field>Asc|Desc`
- 결과 제한: `findFirst`, `findTop10`

```kotlin
interface OrderEntityRepository : JpaRepository<OrderEntity, String> {
    fun findByStatusAndAmountGreaterThan(status: String, amount: Long): List<OrderEntity>
    fun existsByMemberId(memberId: String): Boolean
    fun countByStatus(status: String): Long
    fun findTop10ByStatusOrderByCreatedAtDesc(status: String): List<OrderEntity>
}
```

## 파생 쿼리의 한계
- 조건이 많아지면 **메서드 이름이 비대해져 가독성이 무너진다**. 이때는 `@Query`·QueryDSL로 전환한다.
- 조인·서브쿼리·동적 조건은 파생 쿼리로 표현하기 어렵다.

## @Query (JPQL / native)
```kotlin
@Query("select o from OrderEntity o where o.status = :status and o.amount >= :min")
fun search(@Param("status") status: String, @Param("min") min: Long): List<OrderEntity>

@Query(value = "select * from orders where status = :status", nativeQuery = true)
fun searchNative(@Param("status") status: String): List<OrderEntity>
```
- **named parameters(`:name` + `@Param`)** 를 권장한다(위치 파라미터보다 안전·가독).
- native 쿼리는 DB 종속·매핑 주의. 가능하면 JPQL 우선.

## @Modifying (DML 벌크 연산)
```kotlin
@Modifying(clearAutomatically = true)
@Query("update OrderEntity o set o.status = :to where o.status = :from")
fun bulkUpdateStatus(@Param("from") from: String, @Param("to") to: String): Int
```
- UPDATE/DELETE JPQL은 **`@Modifying` 필수**, 호출은 트랜잭션 안에서.
- 벌크 연산은 **영속성 컨텍스트를 우회**한다 → 1차 캐시 stale. `clearAutomatically`/`flushAutomatically`로 동기화.

## 리뷰 훅
- [ ] 파생 쿼리 메서드 이름이 과도하게 길지 않은가? (길면 `@Query`/QueryDSL로 전환)
- [ ] `@Query`에서 위치 파라미터 대신 named parameter(`@Param`)를 썼는가?
- [ ] native 쿼리를 불필요하게 쓰지 않았는가? (JPQL로 표현 가능한지 확인)
- [ ] UPDATE/DELETE JPQL에 `@Modifying`이 붙어 있고 트랜잭션 안에서 호출되는가?
- [ ] 벌크 `@Modifying` 후 영속성 컨텍스트 stale 위험을 `clearAutomatically`로 처리했는가?
- [ ] 존재/카운트 의도에 `findBy` 대신 `existsBy`/`countBy`를 썼는가?
