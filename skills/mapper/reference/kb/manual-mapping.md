---
title: 수동 매퍼 작성 (object / 확장함수)
source: https://kotlinlang.org/docs/extensions.html
last_fetched: 2026-06-24
skills: [mapper]
---

# 수동 매핑 (hand-written)

## 형태
변환을 손수 작성한다. 두 가지가 흔하다.

1. **`object` 매퍼** — 상태 없는 싱글톤에 `toModel`/`toEntity`를 모은다(이 프로젝트의 기본).
2. **Kotlin 확장 함수** — 수신 타입에 변환을 붙인다(Kotlin extensions, 공식 문서).

```kotlin
object OrderMapper {
    fun toModel(entity: OrderEntity): Order =
        Order(
            id = entity.id,
            status = entity.status,
            memberId = entity.memberId,
        )

    fun toEntity(model: Order): OrderEntity =
        OrderEntity(
            id = model.id,
            status = model.status,
            memberId = model.memberId,
        )

    fun toModels(entities: List<OrderEntity>): List<Order> = entities.map(::toModel)
}
```

확장 함수 버전:
```kotlin
fun OrderEntity.toModel(): Order = Order(id = id, status = status, memberId = memberId)
```

## 생성자 기반 (불변 `val` 호환)
엔티티/모델이 불변 `val`이면 setter 주입이 불가능하다. 생성자로만 채운다. 수동 매퍼는 자연히 생성자
기반이므로 불변 객체와 잘 맞는다. Spring + Kotlin 환경에서도 불변 데이터 클래스가 권장된다
(Spring Kotlin support — https://docs.spring.io/spring-framework/reference/languages/kotlin.html).

## 중첩·컬렉션 매핑
- 중첩 nullable: `entity.address?.let(::toAddressModel)`
- 컬렉션: 단건 변환을 재사용 — `entities.map(::toModel)`

```kotlin
fun toModel(entity: MemberEntity): Member =
    Member(
        id = entity.id,
        address = entity.address?.let(::toAddress),   // null이면 null 유지
        orders = entity.orders.map(::toOrderModel),
    )
```

## 장단점
- **장점**: 코드가 투명해 동작이 한눈에 보이고 디버깅(브레이크포인트)이 쉽다. 불변 객체·복잡한 변환 규칙에
  강하다. 별도 코드 생성 설정(kapt/KSP)이 필요 없다.
- **단점**: 필드가 많으면 보일러플레이트가 늘고, 필드 추가 시 매퍼 갱신을 놓치기 쉽다(컴파일 검증이 없음).

## 리뷰 훅
- [ ] 모든 매핑이 **생성자**로 이뤄지는가(불변 `val` 호환)?
- [ ] nullable 중첩을 `?.let(::toX)`로 안전하게 처리했는가?
- [ ] 컬렉션 매핑이 단건 변환을 재사용하는가?
- [ ] 새 필드 추가 시 `toModel`/`toEntity` 양쪽을 모두 갱신했는가?
- [ ] 매퍼가 무상태이며 외부 I/O/조회를 포함하지 않는가?
