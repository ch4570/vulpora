---
title: 검증 트리거 (@Valid vs @Validated, 중첩/메서드 검증)
source: https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller/ann-validation.html
last_fetched: 2026-06-24
skills: [request]
---

# 검증을 언제·어떻게 트리거하는가

Bean Validation 제약은 선언만으로 실행되지 않는다. **트리거**가 있어야 검증된다.
출처: Spring Framework Reference — Validation + Jakarta Bean Validation 3.0 Spec.

## 1. @Valid (Jakarta 표준)

- `jakarta.validation.Valid`. 표준 애너테이션이며 **그룹 지정 불가**(기본 그룹만).
- 컨트롤러 본문 검증의 기본형:

```kotlin
@PostMapping("/orders")
fun place(@RequestBody @Valid request: PlaceOrderRequest): ResponseEntity<*> {
    // 실패 시 MethodArgumentNotValidException → 400
}
```

- 검증 실패는 `MethodArgumentNotValidException`으로 보고된다(에러 처리 KB 참조).

## 2. @Validated (Spring)

- `org.springframework.validation.annotation.Validated`. `@Valid`의 기능 + **검증 그룹 선택** 지원.
- 그룹별 검증이 필요하면 `@Validated(OnCreate::class)`처럼 그룹을 지정한다.

```kotlin
@PostMapping("/articles")
fun create(@RequestBody @Validated(OnCreate::class) request: SaveArticleRequest)
```

| | `@Valid` | `@Validated` |
|---|----------|--------------|
| 출처 | Jakarta 표준 | Spring |
| 그룹 지정 | 불가 | 가능 |
| 중첩 필드 cascade | 가능(필드에 부착) | (클래스 레벨에선 cascade 트리거 아님) |

## 3. 중첩/연쇄 검증 (Cascaded Validation)

- 중첩 객체/컬렉션을 검증하려면 **그 필드에 `@Valid`** 를 붙여 cascade 한다. 부모만 검증해선 자식이 검증되지 않는다.

```kotlin
data class PlaceOrderRequest(
    @field:NotNull
    val memberId: Long,

    @field:NotEmpty
    @field:Valid                 // 각 요소까지 cascade
    val items: List<OrderItemRequest>,
)

data class OrderItemRequest(
    @field:NotNull val productId: Long,
    @field:Positive val quantity: Int,
)
```

- 컬렉션 요소 검증은 컨테이너 요소 제약/`@Valid` cascade로 처리된다(Bean Validation 컨테이너 요소 검증).

## 4. @RequestParam / @PathVariable 검증 (메서드 수준)

- `@RequestBody @Valid`는 객체 단위 검증이다. 반면 `@RequestParam`/`@PathVariable`의 **개별 파라미터 제약**(`@Min`, `@Size` 등)은 메서드 수준 검증이 필요하다.
- 컨트롤러 클래스에 `@Validated`를 붙이면 `MethodValidationPostProcessor`가 메서드 인자 제약을 적용한다.
- 이 경로의 실패는 `ConstraintViolationException`(또는 Spring 6.1+의 `HandlerMethodValidationException`)으로 보고된다.

```kotlin
@Validated
@RestController
class OrderController {
    @GetMapping("/orders")
    fun list(
        @RequestParam @Min(1) @Max(100) size: Int,
    ): ResponseEntity<*> { /* ... */ }
}
```

## 5. 트리거가 빠질 때의 함정

- 제약만 선언하고 `@Valid`/`@Validated`를 빠뜨리면 **검증이 전혀 일어나지 않는다**(조용한 통과).
- 중첩 필드에 `@Valid`를 안 붙이면 자식 객체 제약이 무시된다.
- 파라미터 제약은 클래스에 `@Validated`가 없으면 동작하지 않는다.

## 리뷰 훅

- [ ] `@RequestBody` 파라미터에 `@Valid`(또는 `@Validated`)가 있는가?
- [ ] 그룹별 검증이 필요할 때 `@Validated(group)`를 썼는가?
- [ ] 중첩 객체/컬렉션 필드에 `@Valid` cascade가 부착되어 있는가?
- [ ] `@RequestParam`/`@PathVariable` 제약을 쓰면 클래스에 `@Validated`가 있는가?
- [ ] 제약은 있는데 트리거가 없어 검증이 "조용히 통과"하는 곳은 없는가?
