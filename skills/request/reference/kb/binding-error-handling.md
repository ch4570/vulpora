---
title: 바인딩·검증 예외 처리와 Problem Detail 매핑
source: https://www.rfc-editor.org/rfc/rfc9457
last_fetched: 2026-06-24
skills: [request]
---

# 바인딩/검증 예외 처리

요청 바인딩·검증이 실패하면 어떤 예외가 발생하고, 어떻게 일관된 400 응답으로 매핑하는지 정리한다.
출처: Spring Framework MVC 에러 처리 문서 + RFC 9457 (Problem Details for HTTP APIs).

## 1. 어떤 실패가 어떤 예외가 되나

| 실패 상황 | 예외 | 비고 |
|-----------|------|------|
| `@RequestBody @Valid` 검증 실패 | `MethodArgumentNotValidException` | 필드 오류 목록 보유 |
| `@ModelAttribute` 데이터 바인딩/검증 실패 | `BindException` | `BindingResult` 보유 |
| `@RequestParam`/`@PathVariable` 제약 위반(클래스 `@Validated`) | `ConstraintViolationException` | 메서드 검증 경로 |
| (Spring 6.1+) 메서드 인자 검증 실패 | `HandlerMethodValidationException` | 통합 처리 |
| 필수 `@RequestParam` 누락 | `MissingServletRequestParameterException` | |
| 타입 변환 실패(예: 숫자에 문자) | `MethodArgumentTypeMismatchException` | |
| 본문 역직렬화 실패(깨진 JSON) | `HttpMessageNotReadableException` | |
| 지원하지 않는 미디어 타입 | `HttpMediaTypeNotSupportedException` | 415 |

## 2. 오류 정보 추출

- `MethodArgumentNotValidException.bindingResult.fieldErrors` → 필드명/거부값/메시지.
- `ConstraintViolationException.constraintViolations` → 프로퍼티 경로/메시지.
- 응답에는 사용자 친화 메시지만, 내부 스택/구현 세부는 제외.

## 3. @ExceptionHandler / @ControllerAdvice 매핑

```kotlin
@RestControllerAdvice
class ValidationExceptionHandler {

    @ExceptionHandler(MethodArgumentNotValidException::class)
    fun handleInvalid(ex: MethodArgumentNotValidException): ProblemDetail {
        val pd = ProblemDetail.forStatus(HttpStatus.BAD_REQUEST)
        pd.title = "Validation Failed"
        pd.setProperty("errors", ex.bindingResult.fieldErrors.map {
            mapOf("field" to it.field, "message" to it.defaultMessage)
        })
        return pd
    }

    @ExceptionHandler(ConstraintViolationException::class)
    fun handleConstraint(ex: ConstraintViolationException): ProblemDetail {
        val pd = ProblemDetail.forStatus(HttpStatus.BAD_REQUEST)
        pd.title = "Constraint Violation"
        pd.setProperty("errors", ex.constraintViolations.map {
            mapOf("path" to it.propertyPath.toString(), "message" to it.message)
        })
        return pd
    }
}
```

## 4. RFC 9457 Problem Detail

- RFC 9457은 HTTP API 오류의 **표준 본문 포맷**을 정의한다(이전 RFC 7807을 대체).
- 미디어 타입: `application/problem+json`.
- 표준 멤버: `type`(URI), `title`, `status`, `detail`, `instance`. 확장 멤버 추가 가능.
- Spring의 `ProblemDetail`/`ErrorResponse`가 이 포맷을 지원한다. 검증 오류 목록은 확장 멤버(`errors` 등)로 담는다.

```json
{
  "type": "about:blank",
  "title": "Validation Failed",
  "status": 400,
  "errors": [
    { "field": "orderNo", "message": "공백일 수 없습니다" }
  ]
}
```

## 5. 일관성 규칙

- 모든 검증/바인딩 실패는 **동일한 오류 스키마**로 응답(클라이언트가 한 가지 형식만 파싱).
- 상태 코드: 검증/형식 오류는 `400`, 미디어 타입은 `415`. 인가 실패(401/403)와 혼동하지 않는다.
- 내부 메시지/스택 추적을 응답에 노출하지 않는다(정보 노출 방지).

## 리뷰 훅

- [ ] `@RequestBody` 검증 실패(`MethodArgumentNotValidException`)를 처리하는 핸들러가 있는가?
- [ ] `@RequestParam`/`@PathVariable` 제약 위반(`ConstraintViolationException`)도 처리되는가?
- [ ] 오류 응답이 RFC 9457 Problem Detail 등 일관된 스키마를 따르는가?
- [ ] 상태 코드가 의미에 맞는가(검증=400, 미디어타입=415)?
- [ ] 응답에 내부 스택/구현 세부가 노출되지 않는가?
- [ ] 깨진 JSON(`HttpMessageNotReadableException`)·타입 불일치도 우아하게 400으로 처리되는가?
