---
title: 요청 DTO 불변성 (Immutable Value Object)
source: https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller/ann-methods/arguments.html
last_fetched: 2026-06-24
skills: [request]
---

# 요청 DTO는 불변 값 객체

요청 DTO를 왜, 어떻게 불변(immutable)하게 만드는지 정리한다.
출처: Spring Framework Reference(메시지 컨버터 기반 바인딩) + 일반 설계 원칙
(참고 도서: Joshua Bloch, *Effective Java* — "Minimize mutability").

## 1. 왜 불변인가

- 요청 DTO는 한 요청 동안 입력을 **운반**하는 값 객체다. 검증 통과 후 값이 바뀌면 계약이 깨진다.
- 불변 객체는 숨은 부수효과가 없고, 스레드 안전하며, 디버깅이 쉽다(principles §1).
- 검증 시점의 상태가 처리 시점까지 동일함을 보장한다.

## 2. 구현 (Kotlin / Java)

- **Kotlin**: `data class` + 전부 `val`. 세터·`var` 금지. 변형은 `copy()`로 새 객체 생성.
- **Java**: `record` 또는 `final` 필드 + 세터 없음.

```kotlin
data class UpdateProductRequest(
    @field:NotBlank
    val name: String,

    @field:PositiveOrZero
    val price: Int,
)
```

## 3. 컬렉션 방어적 처리

- 컬렉션 필드를 외부 가변 참조와 공유하면 불변성이 깨진다.
- 노출은 읽기 전용 인터페이스(`List<T>`)로 하고, 필요 시 방어적 복사(`toList()`)로 별칭 단절.
- Kotlin `List`는 읽기 전용 인터페이스지만 실제 구현이 가변일 수 있으므로, 외부에서 받은 컬렉션을
  보관할 때 `toList()`로 복사하면 안전하다.

```kotlin
data class CreateOrderRequest(
    items: List<OrderItemRequest>,
) {
    @field:NotEmpty
    @field:Valid
    val items: List<OrderItemRequest> = items.toList()  // 방어적 복사
}
```

## 4. 역직렬화와 불변성

- Jackson 등은 `data class`/`record`의 전 인자 생성자를 통해 객체를 만들 수 있다(세터 불필요).
- 모든 필드를 생성자로 받으면 부분 초기화 상태가 생기지 않아 항상 완전한 객체가 만들어진다.

## 5. DTO ≠ 엔티티

- 불변 요청 DTO를 가변 영속 엔티티로 직접 쓰지 않는다. 수명주기·노출 필드·검증이 다르다(principles §10).
- 경계에서 DTO → 도메인 모델로 매핑한다.

## 6. 안티패턴

- `var` 필드 + 세터로 만든 "빈(bean)형" 요청 객체 → 부분 초기화/중간 변형 위험.
- 생성자에서 받은 컬렉션을 그대로 보관(방어적 복사 누락).
- DTO 안에서 상태를 변형하는 헬퍼 메서드.

## 리뷰 훅

- [ ] DTO가 `data class`/`record` + 전부 `val`/`final`인가?
- [ ] 세터·`var`가 없는가?
- [ ] 컬렉션 필드를 방어적 복사하거나 읽기 전용으로 노출하는가?
- [ ] 변형이 필요할 때 `copy()`/새 객체로 처리하는가(원본 변형 없음)?
- [ ] 요청 DTO를 영속 엔티티로 직접 재사용하지 않는가?
