---
title: null 안전과 불변 객체 매핑
source: https://mapstruct.org/documentation/stable/reference/html/#mapping-result-for-null-arguments
last_fetched: 2026-06-24
skills: [mapper]
---

# null 안전 · 불변 객체 매핑

## null 안전 매핑
매핑은 타입 시스템이 다른 두 세계를 잇는 지점이라 null 처리가 핵심이다.

- **Kotlin nullable ↔ Java `Optional`/`null`**: Kotlin `T?`는 Java의 `null` 또는 `Optional<T>`와 대응한다.
  경계에서 변환 규칙을 명시한다(예: `optional.orElse(null)`, `value?.let { Optional.of(it) }`).
- 소스 인자 자체가 null일 때 무엇을 반환할지 정한다. MapStruct는 이를
  `NullValueMappingStrategy`로 제어한다(MapStruct null 처리 문서 참고).
- 개별 프로퍼티 null은 "그대로 전달 / 기본값 / 예외" 중 하나로 정책을 둔다. 암묵적으로 넘기지 않는다.

```kotlin
fun toModel(entity: MemberEntity): Member =
    Member(
        id = entity.id,
        nickname = entity.nickname ?: DEFAULT_NICKNAME,   // 기본값 정책 명시
        email = entity.email,                              // null 그대로 전달
    )
```

Kotlin null 안전은 컴파일러가 `?`/`!!`로 강제한다(Kotlin null safety —
https://kotlinlang.org/docs/null-safety.html). 매퍼에서 `!!` 남발 대신 정책을 명시하라.

## 불변 객체 매핑은 생성자/빌더만 가능
불변 객체(`val`)는 setter가 없으므로 **생성자 또는 빌더로만** 채울 수 있다. setter 주입 방식은
적용 불가다. 수동 매퍼는 생성자 기반이라 자연스럽고, MapStruct도 빌더/생성자 경로가 있으면 동작한다.

## 필수값 검증 · 기본값
- 필수값(예: `id`)이 null이면 매핑 시점에 빠르게 실패시킨다(`require(...)`/예외).
- 선택값은 기본값 정책을 둔다.

```kotlin
fun toEntity(model: Order): OrderEntity {
    val id = requireNotNull(model.id) { "Order.id는 영속화 전 필수" }
    return OrderEntity(id = id, status = model.status)
}
```

## 부분 업데이트(@MappingTarget)의 한계
MapStruct `@MappingTarget`은 **기존 인스턴스를 갱신**하는 부분 업데이트를 지원하지만, 이는 가변 타깃을
전제한다. 불변 객체에는 적용할 수 없으므로 부분 업데이트가 필요하면 `copy(...)`로 **새 객체를 생성**한다.

```kotlin
val updated = order.copy(status = OrderStatus.SHIPPED)   // 불변 갱신
```

## defensive copy (방어적 복사)
가변 컬렉션/배열을 매핑할 때는 외부에서 내부 상태를 바꾸지 못하도록 방어적 복사를 한다.

```kotlin
fun toModel(entity: OrderEntity): Order =
    Order(items = entity.items.toList())   // 가변 리스트를 그대로 공유하지 않음
```

## 리뷰 훅
- [ ] nullable 프로퍼티의 변환 정책(전달/기본값/예외)이 명시돼 있는가?
- [ ] Kotlin nullable ↔ Java Optional/null 경계 변환이 정확한가?
- [ ] 불변 타깃을 생성자/빌더로 채우는가(setter 주입 없음)?
- [ ] 필수값을 매핑 시점에 검증(`require`)하는가?
- [ ] 부분 업데이트를 `@MappingTarget` 대신 `copy(...)`로 처리하는가(불변)?
- [ ] 가변 컬렉션/배열에 방어적 복사를 적용했는가?
