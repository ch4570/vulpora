---
title: 응답 엔벨로프 설계
source: https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller/ann-methods/responseentity.html
last_fetched: 2026-06-24
skills: [response]
---

# 응답 엔벨로프 설계 (Response Envelope)

> 출처: Spring MVC `ResponseEntity`/`@ResponseBody` + RFC 9110(상태 코드 의미).
> 핵심: **한 API 안에서 응답 형태를 하나로 통일한다. 상태 코드와 본문의 책임을 중복시키지 않는다.**

## 1. 엔벨로프 vs 베어 본문

| 방식 | 형태 | 장점 | 단점 |
|------|------|------|------|
| 베어 본문 + 상태 코드 | `OrderResponse` 그대로, 상태=HTTP | HTTP 표준과 정렬, 간결, 캐시 친화 | 메타(페이지) 부착 위치 별도 필요 |
| 엔벨로프 | `{ success, data, error, meta }` | 일관 래핑, 메타 동봉 용이 | 중복(상태↔success), 한 겹 더 깊어짐 |

- **권고**: 성공 단건은 베어 본문 + 적절한 상태 코드. 목록은 페이지 메타 때문에 엔벨로프
  (`{ data, _pagination }`)를 쓴다. 오류는 RFC 9457 Problem Detail.
- 어떤 선택을 하든 **API 전체에서 하나로 통일**한다. 엔드포인트마다 다른 래핑은 금지.

## 2. 안티패턴: 만능 200 엔벨로프

- 모든 응답을 `200 OK` + `{ "success": false, "error": ... }`로 보내는 패턴은:
  - HTTP 상태 코드 계약을 무력화(중간 캐시/게이트웨이/클라이언트 표준 처리 깨짐).
  - `success` 불리언과 상태 코드가 **이중 진실 소스**가 되어 불일치 위험.
- 상태 코드로 성공/실패를 표현하고, 본문은 데이터/문제 상세에 집중한다.

## 3. 일관 엔벨로프 예시

성공 단건(베어):
```json
{ "id": "9f3c", "status": "PAID", "totalAmount": 12000 }
```

성공 목록(엔벨로프):
```json
{ "data": [ { "id": "9f3c" } ], "_pagination": { "nextCursor": null, "hasNext": false } }
```

오류(Problem Detail):
```json
{ "type": "about:blank", "title": "Bad Request", "status": 400, "detail": "..." }
```

## 4. JSON 직렬화 / 필드 명명

- 필드 명명 전략(snake_case vs camelCase)을 **한 번 정해 전역 고정**한다(Jackson 설정).
- 직렬화 이름은 계약이므로 리팩터링 시 자동 변경되지 않게 `@JsonProperty`로 못박는다
  (특히 `_pagination`처럼 언더스코어가 필요한 메타) (→ `content-negotiation-serialization.md`).
- null 포함/제외 정책을 전역으로 통일.

## 5. `ResponseEntity` 사용

- 상태 코드/헤더(예: 201의 `Location`)를 제어해야 할 때 `ResponseEntity<T>`를 쓴다.
- 단순 200 본문이면 DTO를 그대로 반환(`@ResponseBody`)하는 것이 간결.

## 리뷰 훅

- [ ] 응답 형태(베어/엔벨로프)가 API 전체에서 일관된가?
- [ ] 성공/실패를 HTTP 상태 코드로 표현하고, 만능 200 엔벨로프를 쓰지 않는가?
- [ ] 목록은 `{ data, _pagination }` 형태로 메타를 동봉하는가?
- [ ] 오류는 Problem Detail로 통일되어 있는가?
- [ ] 필드 명명 전략이 전역으로 고정(Jackson)되어 있는가?
- [ ] 201 등 헤더 제어가 필요한 곳에 `ResponseEntity`를 쓰는가?
