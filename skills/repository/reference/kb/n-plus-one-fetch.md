---
title: N+1 문제와 fetch 전략
source: https://jakarta.ee/specifications/persistence/3.2/jakarta-persistence-spec-3.2
last_fetched: 2026-06-24
skills: [repository]
---

# N+1 문제와 fetch 전략

> 보조 출처: https://docs.spring.io/spring-data/jpa/reference/jpa/entity-graph.html

## N+1 발생 원리
- 부모 N건을 조회한 뒤, 각 부모의 **LAZY 연관**(컬렉션/단일 참조)을 반복 접근하면 연관마다 추가 쿼리가
  발생한다 → 1(부모) + N(자식) 쿼리. 화면 렌더링·DTO 변환 루프에서 흔히 터진다.

```kotlin
val orders = orderEntityRepository.findByStatus("PAID", pageable)  // 1번
orders.forEach { it.items.size }   // 각 order마다 items 조회 → N번
```

## 해결 1 — fetch join (JPQL `join fetch`)
```kotlin
@Query("select distinct o from OrderEntity o join fetch o.items where o.status = :status")
fun findWithItems(@Param("status") status: String): List<OrderEntity>
```
- 연관을 한 쿼리로 즉시 적재. 컬렉션 fetch join 시 행 곱으로 중복 → `distinct` 필요.

## 해결 2 — @EntityGraph
```kotlin
@EntityGraph(attributePaths = ["items", "member"])
fun findByStatus(status: String): List<OrderEntity>
```
- 메서드 단위로 즉시 적재할 연관을 선언. `@NamedEntityGraph`로 엔티티에 미리 정의도 가능.

## 해결 3 — batch size
- `@BatchSize(size = 100)`(엔티티/컬렉션) 또는 글로벌 `hibernate.default_batch_fetch_size`.
- LAZY 연관을 **`IN (...)` 묶음으로 적재** → N+1을 1+ceil(N/size)로 축소. 컬렉션 fetch join 대안.

## 해결 4 — DTO projection
- 연관 전체 엔티티가 필요 없으면 필요한 컬럼만 DTO로 직접 조회(JPQL `new`·QueryDSL projection)해 적재 자체를 줄인다.

## 페이징 + 컬렉션 fetch join 주의
- **컬렉션 fetch join + 페이징을 함께** 쓰면 DB에서 페이징할 수 없어 Hibernate가 **전체를 메모리로 읽어 페이징**한다
  (로그에 `firstResult/maxResults specified with collection fetch; applying in memory` 경고). 대용량에서 OOM 위험.
- 대응: 컬렉션은 **batch size로 분리 적재**하고, 페이징은 루트 엔티티에만 적용. 또는 ToOne 연관만 fetch join.

## 리뷰 훅
- [ ] 루프/스트림에서 LAZY 연관을 반복 접근하는 N+1 경로가 있는가?
- [ ] 즉시 필요한 연관을 `join fetch` 또는 `@EntityGraph`로 적재하는가?
- [ ] 컬렉션 fetch join에 `distinct`를 넣었는가?
- [ ] **컬렉션 fetch join + 페이징**을 함께 쓰지 않는가? (메모리 페이징 경고 확인)
- [ ] 대신 `@BatchSize`/`default_batch_fetch_size`로 묶음 적재를 적용했는가?
- [ ] 연관 전체가 불필요하면 DTO projection으로 줄였는가?
