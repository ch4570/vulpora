---
title: Spring MVC 인자 바인딩 (@RequestBody / @RequestParam / @PathVariable 등)
source: https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller/ann-methods/arguments.html
last_fetched: 2026-06-24
skills: [request]
---

# Spring MVC 컨트롤러 인자 바인딩

요청의 각 부분을 핸들러 메서드 파라미터로 바인딩하는 애너테이션과 그 의미를 정리한다.
출처: Spring Framework Reference — Web on Servlet Stack / Controller Method Arguments.

## 1. 바인딩 애너테이션 개요

| 애너테이션 | 출처 | 용도 | 기본 필수 여부 |
|------------|------|------|----------------|
| `@RequestBody` | HTTP 본문 | JSON/XML 등 직렬화된 페이로드를 객체로 역직렬화 | 필수(`required=true`) |
| `@RequestParam` | 쿼리스트링/폼 데이터 | 단일 스칼라 파라미터 | 필수(기본 true) |
| `@PathVariable` | URI 템플릿 변수 | 경로의 리소스 식별자 | 필수 |
| `@ModelAttribute` | 쿼리/폼 → 객체 | 여러 폼 필드를 객체로 바인딩 | — |
| `@RequestHeader` | HTTP 헤더 | 헤더 값 | 필수(기본 true) |
| `@CookieValue` | 쿠키 | 쿠키 값 | 필수(기본 true) |
| `@RequestPart` | multipart | 파트(파일/JSON 파트) | — |

## 2. @RequestBody

- 본문을 `HttpMessageConverter`(JSON이면 보통 Jackson)로 대상 타입으로 역직렬화한다.
- `Content-Type` 기반 컨텐트 협상(content negotiation)으로 컨버터가 선택된다.
- `@Valid` / `@Validated`와 함께 쓰면 역직렬화 직후 Bean Validation이 트리거된다(별도 KB 참조).
- `@RequestBody(required = false)`로 본문 없음을 허용할 수 있다.
- 한 핸들러에 본문은 하나만. 본문은 스트림이라 두 번 읽을 수 없다.

## 3. @RequestParam

- 쿼리 파라미터 또는 `application/x-www-form-urlencoded` 폼 필드를 단일 값으로 바인딩.
- 옵션 속성:
  - `required` (기본 `true`) — 누락 시 `MissingServletRequestParameterException` → 400.
  - `defaultValue` — 지정 시 `required`는 자동으로 `false`가 되고, 누락 시 기본값 사용.
  - `name`/`value` — 파라미터명 매핑.
- 선택 파라미터는 `@RequestParam(required = false)` + nullable 타입 또는 `defaultValue`로 표현.
- `List<T>`/배열로 다중 값(`?id=1&id=2`) 수용 가능.

```kotlin
@GetMapping("/orders")
fun list(
    @RequestParam(defaultValue = "0") page: Int,
    @RequestParam(defaultValue = "20") size: Int,
    @RequestParam(required = false) status: OrderStatus?,
): ResponseEntity<*> { /* ... */ }
```

## 4. @PathVariable

- URI 템플릿 변수(`/orders/{orderId}`)를 바인딩. 리소스 **식별자**의 자리.
- 기본 필수이며, 변수명이 파라미터명과 같으면 `name` 생략 가능.
- 식별자는 경로에 두고 본문(@RequestBody)에 중복 수록하지 않는다.

```kotlin
@PostMapping("/orders/{orderId}/items")
fun addItem(
    @PathVariable orderId: Long,
    @RequestBody @Valid request: AddOrderItemRequest,
): ResponseEntity<*> { /* ... */ }
```

## 5. @ModelAttribute (폼/쿼리 → 객체)

- 여러 쿼리/폼 필드를 하나의 객체로 바인딩. `@RequestBody`(본문 역직렬화)와 다르다.
- 데이터 바인딩 단계에서 채워지며, 실패는 `BindException`/`BindingResult`로 보고된다.
- JSON 본문 API에는 `@RequestBody`를, HTML 폼/쿼리 기반에는 `@ModelAttribute`를 쓴다.

## 6. @RequestHeader / @CookieValue

- 단일 헤더/쿠키 값을 바인딩. `required`, `defaultValue` 지원.
- 인증 토큰 등은 헤더에서 받되, DTO 본문 필드로 섞지 않는다(출처가 곧 의미, principles §5).

## 7. 컨텐트 협상 요약

- 요청 `Content-Type` → 어떤 메시지 컨버터가 본문을 읽을지 결정.
- 응답은 `Accept` 헤더로 협상. 본문 바인딩은 요청 측 `Content-Type`이 핵심.
- 지원하지 않는 미디어 타입은 `415 Unsupported Media Type`.

## 리뷰 훅

- [ ] 식별자가 `@PathVariable`에 있고 `@RequestBody`에 중복되지 않는가?
- [ ] 선택 파라미터에 `required = false` 또는 `defaultValue`가 명시되었는가?
- [ ] 본문 API에 `@RequestBody`(필요 시 `@Valid`)를, 폼/쿼리에 `@RequestParam`/`@ModelAttribute`를 올바르게 썼는가?
- [ ] 한 핸들러에 `@RequestBody`가 하나뿐인가?
- [ ] 헤더/쿠키 값이 DTO 본문 필드로 잘못 섞이지 않았는가?
- [ ] 다중 값 파라미터를 `List`/배열로 올바르게 받는가?
