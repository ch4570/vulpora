---
title: 트랜잭션과 읽기 전용·락
source: https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative.html
last_fetched: 2026-06-24
skills: [repository]
---

# 트랜잭션과 읽기 전용·락

> 보조 출처:
> - https://docs.spring.io/spring-data/jpa/reference/jpa/transactions.html
> - https://docs.spring.io/spring-data/jpa/reference/jpa/locking.html

## 트랜잭션 경계는 서비스 계층
- `@Transactional`은 **서비스 메서드**에 건다. 리포지토리는 영속 접근만 하고 경계를 소유하지 않는다.
- 컨트롤러에 트랜잭션을 거는 것은 지양(요청 처리·뷰 렌더링까지 트랜잭션이 늘어짐).

```kotlin
@Service
class OrderService(private val orderRepository: OrderEntityRepository) {
    @Transactional(readOnly = true)
    fun find(id: String): OrderEntity = orderRepository.findById(id).orElseThrow()

    @Transactional
    fun place(cmd: PlaceOrder): OrderEntity = orderRepository.save(cmd.toEntity())
}
```

## readOnly = true 최적화
- `@Transactional(readOnly = true)` → Hibernate flush 모드 `MANUAL`, **dirty checking·flush 생략**으로 조회 오버헤드 감소.
- 일부 드라이버/DB에서는 읽기 전용 힌트가 전달되기도 한다. 조회 전용 경로엔 일관되게 표시.

## 전파(propagation)
- 기본 `REQUIRED`(있으면 합류, 없으면 시작). 별도 트랜잭션이 필요하면 `REQUIRES_NEW`,
  보조 작업은 `NESTED`/`SUPPORTS` 등을 의도적으로 선택. 같은 클래스 내부 self-invocation은 프록시를 우회해 트랜잭션이 안 먹힐 수 있으니 주의.

## 리포지토리 기본 트랜잭션
- Spring Data 기본 CRUD 메서드는 내부적으로 트랜잭션이 적용된다(`save`/`delete` 등은 쓰기, `findBy`는 readOnly).
- 서비스 트랜잭션이 있으면 그 경계에 합류한다 → **여러 리포지토리 호출을 하나의 단위로 묶는 것은 서비스가 책임**.

## 동시성 — lost update 방지 / 락
- **lost update**: 두 트랜잭션이 같은 행을 읽고 각자 갱신하면 한쪽이 덮어써진다.
- **낙관적 락(`@Version`)** — 충돌 시 `OptimisticLockException`. 경합이 드물 때 적합.
```kotlin
@Entity class OrderEntity(@Version var version: Long = 0, /* ... */)
```
- **비관적 락(`@Lock`)** — 읽는 순간 행을 잠근다. 경합이 잦을 때.
```kotlin
@Lock(LockModeType.PESSIMISTIC_WRITE)
@Query("select o from OrderEntity o where o.id = :id")
fun findForUpdate(@Param("id") id: String): OrderEntity?
```

## 리뷰 훅
- [ ] 트랜잭션 경계가 서비스 계층에 있는가? (컨트롤러/리포지토리가 아님)
- [ ] 조회 전용 메서드에 `@Transactional(readOnly = true)`가 있는가?
- [ ] 여러 리포지토리 호출을 하나의 트랜잭션 단위로 서비스가 묶고 있는가?
- [ ] 같은 클래스 내부 호출로 `@Transactional`이 무시되는 self-invocation이 없는가?
- [ ] 동시 갱신 가능 엔티티에 `@Version`(낙관적) 또는 `@Lock`(비관적)을 적용했는가?
- [ ] 비관적 락 경로가 트랜잭션 안에서 호출되고 락 범위가 짧은가?
