---
title: Problem Details (RFC 9457) 오류 응답
source: https://www.rfc-editor.org/rfc/rfc9457
last_fetched: 2026-06-24
skills: [response]
---

# Problem Details for HTTP APIs (RFC 9457)

> 출처: RFC 9457 (RFC 7807을 대체) + Spring MVC Error Responses
> (https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-ann-rest-exceptions.html).
> 핵심: **오류는 기계가 읽을 수 있는 표준 형태(`application/problem+json`)로 반환한다.**

## 1. 미디어 타입

- JSON: **`application/problem+json`** (XML은 `application/problem+xml`).
- 일반 `application/json`이 아니라 problem 미디어 타입을 명시해, 클라이언트가 오류 본문 스키마를
  구분할 수 있게 한다.

## 2. 표준 멤버 (RFC 9457 §3.1)

| 멤버 | 타입 | 의미 |
|------|------|------|
| `type` | URI(string) | 문제 유형 식별 URI. 생략 시 `"about:blank"`로 간주 |
| `title` | string | 문제 유형의 짧은 사람이 읽는 요약(인스턴스마다 바뀌지 않음) |
| `status` | number | HTTP 상태 코드(원본 상태와 일치해야 함) |
| `detail` | string | 이 발생 인스턴스에 특화된 사람이 읽는 설명 |
| `instance` | URI(string) | 이 특정 발생을 식별하는 URI(예: 요청 경로/추적 ID) |

- 모든 멤버는 **선택적**이다. `type`이 `about:blank`이면 `title`은 상태 코드의 표준 사유구절과
  동일해야 한다(권고).
- `detail`은 **사람을 위한 설명**이지 프로그램 분기용이 아니다. 분기는 `type`/확장 멤버로 한다.

## 3. 확장 멤버 (Extension Members)

- 표준 멤버 외에 **추가 필드**를 최상위에 둘 수 있다(예: `errors`, `code`, `traceId`).
- 소비자는 모르는 확장 멤버를 **무시**해야 한다. 확장 멤버 이름은 안정적 계약으로 관리한다.

```json
{
  "type": "https://example.com/problems/insufficient-stock",
  "title": "Insufficient stock",
  "status": 409,
  "detail": "Product 'P-1001' has 2 in stock but 5 were requested.",
  "instance": "/orders/9f3c",
  "code": "INSUFFICIENT_STOCK",
  "traceId": "b7e2..."
}
```

## 4. Spring 통합

- **`ProblemDetail`**: RFC 9457 본문을 표현하는 Spring 타입.
  `ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, "...")`로 생성하고
  `setType(...)`, `setProperty("code", ...)`(확장 멤버)로 채운다.
- **`ErrorResponse`**: 상태 + 헤더 + `ProblemDetail`을 묶는 추상. 예외를 구현하면
  Spring이 표준 오류 응답으로 렌더링.
- **`@ExceptionHandler` / `@ControllerAdvice`**: 예외를 잡아 `ProblemDetail`로 변환하는 단일 지점.
  `ResponseEntityExceptionHandler`를 확장하면 Spring 기본 예외가 자동으로 Problem Detail로 매핑됨.

```kotlin
@ExceptionHandler(InsufficientStockException::class)
fun handle(ex: InsufficientStockException): ProblemDetail =
    ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, ex.message ?: "conflict").apply {
        type = URI.create("https://example.com/problems/insufficient-stock")
        title = "Insufficient stock"
        setProperty("code", "INSUFFICIENT_STOCK")
    }
```

## 5. 일관성 규칙

- `status` 멤버는 **실제 HTTP 상태와 반드시 일치**시킨다.
- 오류 형태는 한 API 안에서 통일한다(직접 만든 `{error:{...}}`와 Problem Detail을 섞지 않는다).
- 내부 정보 누출 금지(→ `error-response-design.md`).

## 리뷰 훅

- [ ] 오류 응답 미디어 타입이 `application/problem+json`인가?
- [ ] `type`/`title`/`status`/`detail`/`instance` 의미를 올바르게 사용했는가?
- [ ] `status` 멤버가 실제 HTTP 상태 코드와 일치하는가?
- [ ] 프로그램 분기를 `detail` 문자열이 아니라 `type`/확장 멤버(`code`)로 하는가?
- [ ] `@ControllerAdvice`/`@ExceptionHandler`로 오류 변환이 단일 지점에 모여 있는가?
- [ ] 확장 멤버 이름이 안정적 계약으로 문서화되어 있는가?
- [ ] 오류 형태가 API 전체에서 일관(자체 포맷과 혼용 없음)된가?
