---
title: 오류 응답 설계와 보안
source: https://cheatsheetseries.owasp.org/cheatsheets/Error_Handling_Cheat_Sheet.html
last_fetched: 2026-06-24
skills: [response]
---

# 오류 응답 설계 (Error Response Design)

> 출처: OWASP Error Handling Cheat Sheet + RFC 9457(Problem Details) + Spring MVC Error Responses.
> 핵심: **오류 형태는 일관되게, 내부 정보는 절대 누출하지 않는다.**

## 1. 일관된 오류 형태

- 모든 오류를 **RFC 9457 Problem Detail**로 통일한다(→ `problem-detail-rfc9457.md`).
  자체 `{error:{code,message}}`와 Problem Detail을 섞지 않는다.
- 프로그램 분기용 식별자는 확장 멤버 `code`(예: `"INSUFFICIENT_STOCK"`)로, 사람용 설명은 `detail`로.

## 2. 검증 오류 매핑 (Field Errors)

- 다중 필드 검증 실패는 확장 멤버 `errors` 배열로 **필드별** 노출한다:

```json
{
  "type": "about:blank",
  "title": "Validation failed",
  "status": 400,
  "detail": "Request has 2 invalid fields.",
  "errors": [
    { "field": "email", "reason": "must be a well-formed email address" },
    { "field": "totalAmount", "reason": "must be greater than 0" }
  ]
}
```

- Spring에서는 `MethodArgumentNotValidException`을 `@ControllerAdvice`에서 잡아
  `BindingResult.fieldErrors`를 `errors`로 매핑한다.
- 검증 오류 상태는 400 또는 422 중 **하나로 일관** (→ `http-status-codes.md`).

## 3. 내부 정보 누출 금지 (OWASP)

- 오류 응답에 넣지 **말 것**: 스택트레이스, 예외 클래스/패키지명, SQL/쿼리, 파일 경로,
  서버 버전·프레임워크 상세, 원시 예외 메시지(특히 DB/외부 API 메시지).
- 사용자/클라이언트에는 **안전하고 일반적인 메시지**를, 서버 로그에는 상세 컨텍스트 + 상관관계 ID
  (`traceId`)를 남긴다. 응답의 `instance`/`traceId`로 로그와 연결한다.
- 존재 은닉이 필요한 리소스는 403 대신 404로 응답할 수 있다(열거 공격 방어).

## 4. 메시지 보안

- 인증 실패 메시지를 세분화하지 않는다("아이디 없음"/"비밀번호 틀림" 구분 → 계정 열거).
  일반화된 "자격 증명이 올바르지 않습니다".
- 5xx에는 `detail`을 일반화하고 상세는 로그로만.

## 5. 단일 처리 지점

- `@ControllerAdvice` + `ResponseEntityExceptionHandler` 확장으로 **오류 변환을 한 곳**에 모은다.
  Spring 기본 예외(파싱/검증/415/405 등)도 Problem Detail로 일관 매핑된다.
- 컨트롤러마다 try/catch로 제각각 오류를 만들지 않는다.

## 리뷰 훅

- [ ] 모든 오류가 Problem Detail로 일관되며 자체 포맷과 혼용이 없는가?
- [ ] 검증 실패가 필드별 `errors` 배열로 노출되는가?
- [ ] 스택트레이스/SQL/예외 클래스/경로/버전 등 내부 정보가 응답에 없는가?
- [ ] 사용자 메시지는 안전하게 일반화하고 상세는 서버 로그로만 보내는가?
- [ ] 인증 실패 메시지가 계정 열거를 돕지 않는가?
- [ ] 오류 변환이 `@ControllerAdvice` 단일 지점에 모여 있는가?
- [ ] 응답에 로그 상관관계 ID(`traceId`/`instance`)가 있는가?
