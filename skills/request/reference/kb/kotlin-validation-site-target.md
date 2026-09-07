---
title: 'Kotlin @field: 사이트 타깃과 Jakarta 제약 적용'
source: https://kotlinlang.org/docs/annotations.html#annotation-use-site-targets
last_fetched: 2026-06-24
skills: [request]
---

# Kotlin 애너테이션 사이트 타깃과 Bean Validation

Kotlin에서 생성자 프로퍼티에 Jakarta 제약을 붙일 때 **`@field:`** 사이트 타깃이 왜 필요한지 정리한다.
출처: Kotlin Language Reference — Annotation use-site targets + Spring/Jakarta 검증 동작.

## 1. 왜 `@field:` 가 필요한가

- Kotlin의 생성자 프로퍼티(`val name: String`)는 컴파일 시 **여러 요소**(생성자 파라미터, 필드, getter)로 펼쳐진다.
- 애너테이션을 사이트 타깃 없이 붙이면 Kotlin의 기본 적용 규칙에 따라 **파라미터**에 붙을 수 있고, 그러면
  실제 **필드**에 제약이 없어 Bean Validation이 인식하지 못한다.
- Bean Validation은 보통 **필드**(또는 getter)의 제약을 읽으므로, `@field:`로 명시적으로 필드에 부착해야
  제약이 실제로 적용된다.

```kotlin
// ❌ 사이트 타깃 없음 — 파라미터에만 붙어 검증이 적용되지 않을 수 있음
data class PlaceOrderRequest(
    @NotBlank val orderNo: String,
)

// ✅ @field: 로 필드에 부착 — 제약이 실제로 적용됨
data class PlaceOrderRequest(
    @field:NotBlank val orderNo: String,
)
```

## 2. 사이트 타깃 종류 (참고)

| 타깃 | 적용 위치 |
|------|-----------|
| `@field:` | 백킹 필드 |
| `@get:` | getter |
| `@param:` | 생성자 파라미터 |
| `@property:` | 프로퍼티 자체 |
| `@set:` / `@setparam:` | setter / setter 파라미터 |

- Jakarta 제약은 관례상 **`@field:`** 를 쓴다(필드 접근 기반 검증과 일치).

## 3. data class 불변성 매핑

- 요청 DTO는 `data class` + **`val`** 로 불변 값 객체를 만든다(principles §1).
- `var`/세터를 두지 않는다. 복사/변형이 필요하면 `copy()`로 새 객체를 만든다.

```kotlin
data class PlaceOrderRequest(
    /** 주문 번호 (공백 불가) */
    @field:NotBlank
    val orderNo: String,

    /** 결제 수단 (프로토콜 enum) */
    @field:NotNull
    val payment: PaymentMethod,

    /** 주문 항목 (1개 이상, 각 요소까지 검증) */
    @field:NotEmpty
    @field:Valid
    val items: List<OrderItemRequest>,
)
```

## 4. 널 가능성 매핑

- 필수 값은 non-null 타입(`String`)으로 선언 → 타입이 1차 계약. 누락 시 역직렬화 단계에서 실패.
- 선택 값만 nullable(`String?`)로 선언하고, 필요한 추가 제약을 더한다.
- Kotlin 타입 자체가 `@NotNull` 역할을 일부 하지만, 역직렬화 경로/플랫폼 타입 때문에 명시적
  `@field:NotNull`을 함께 두는 것이 안전하다.

## 5. KDoc

- 각 필드에 한국어 KDoc으로 의미·제약을 적는다(SKILL 규칙). 협업·자동 문서화에 도움.

## 리뷰 훅

- [ ] 모든 Jakarta 제약에 `@field:` 사이트 타깃이 붙어 있는가?
- [ ] DTO가 `data class` + `val`(불변)인가? `var`/세터가 없는가?
- [ ] 필수 값은 non-null, 선택 값만 nullable로 선언했는가?
- [ ] 중첩 컬렉션 요소 검증에 `@field:Valid` cascade가 있는가?
- [ ] 필드별 한국어 KDoc이 있는가?
