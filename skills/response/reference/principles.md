# 응답 DTO / 엔벨로프 설계 원칙 (헌법)

> **출처(Sources)**
> - Spring Framework — Web on Servlet Stack (Spring MVC): https://docs.spring.io/spring-framework/reference/web/webmvc.html
> - Spring MVC — Error Responses (ProblemDetail / ErrorResponse): https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-ann-rest-exceptions.html
> - RFC 9457 — Problem Details for HTTP APIs: https://www.rfc-editor.org/rfc/rfc9457
> - RFC 9110 — HTTP Semantics (상태 코드): https://www.rfc-editor.org/rfc/rfc9110
> - RFC 7231 — HTTP/1.1 Semantics and Content (RFC 9110으로 대체된 역사적 문서): https://www.rfc-editor.org/rfc/rfc7231
> - RFC 8288 — Web Linking (`Link` 헤더): https://www.rfc-editor.org/rfc/rfc8288

이 문서는 응답(Response) 계층의 **헌법**이다. 일반 원칙을 정의하며, 충돌 시 우선순위는
**KB(`reference/kb/*`) > 본 원칙 > 개인 취향** 이다. KB는 출처에 근거한 구체 사실/규칙이므로,
본 원칙과 어긋나면 KB를 따른다.

---

## 1. 일관된 응답 엔벨로프 (Consistent Envelope)

- 같은 API 표면 안에서 **성공/실패 응답의 형태는 예측 가능**해야 한다. 같은 의미의 데이터는
  항상 같은 위치·이름·타입으로 노출한다.
- 페이지네이션 목록은 **단일 공유 엔벨로프**(공유 커서 페이지 엔벨로프 / 공통 프로토콜 모듈)로
  감싼다. 엔드포인트마다 새 래퍼를 발명하지 않는다.
- 엔벨로프를 둘지(`{success,data,error,meta}`) 본문을 그대로 둘지는 트레이드오프가 있다
  (→ `kb/response-envelope-design.md`). 한 API 안에서는 **하나의 선택을 일관**되게 적용한다.

## 2. 매핑은 응답이 소유한다 (Response Owns Mapping)

- 도메인 model → 응답 DTO 변환은 **컨트롤러가 아니라 응답 DTO의 `companion object { fun from(model) }`
  팩토리**가 소유한다. 컨트롤러는 호출만 한다.
- 도메인 엔티티/모델을 **직렬화 대상으로 직접 노출하지 않는다**. 항상 명시적 응답 DTO를 거친다
  (엔티티 누출·지연로딩·순환참조·내부 필드 유출 방지).

## 3. 오류는 기계가 읽을 수 있어야 한다 (Machine-Readable Errors)

- 오류 응답은 **RFC 9457 Problem Details**(`application/problem+json`)를 기준 형태로 한다.
  `type`/`title`/`status`/`detail`/`instance` + 필요한 확장 멤버.
- Spring의 `ProblemDetail` / `ErrorResponse` / `@ExceptionHandler`로 통일된 오류 형태를 생성한다
  (→ `kb/problem-detail-rfc9457.md`, `kb/error-response-design.md`).

## 4. 올바른 상태 코드 의미 (Correct Status Semantics)

- HTTP 상태 코드는 **장식이 아니라 계약**이다. RFC 9110 의미에 맞춰 선택한다:
  생성=201(+`Location`), 본문 없음=204, 클라이언트 오류=4xx, 검증 실패=400/422, 충돌=409,
  서버 오류=5xx (→ `kb/http-status-codes.md`).
- 모든 오류를 200으로 감싸고 본문에 성공/실패를 넣는 패턴은 **상태 코드 계약을 깨므로 지양**한다.

## 5. 페이지네이션 메타데이터 계약 (Pagination Contract)

- 목록 응답은 **페이지네이션 메타**를 명확한 계약으로 노출한다.
  오프셋: `total`/`page`/`size`, 커서: `nextCursor`/`hasNext`.
- 커서/키셋 페이지네이션은 **안정적 정렬(stable ordering)**이 전제다. 대량/변동이 큰 집합은
  오프셋보다 커서를 선호한다 (→ `kb/pagination-metadata.md`).

## 6. 내부 정보를 절대 누출하지 않는다 (Never Leak Internals)

- 오류 응답에 **스택트레이스·SQL·내부 클래스/경로·예외 메시지 원문**을 넣지 않는다.
  사용자/클라이언트에게는 안전한 메시지를, 서버 로그에는 상세 컨텍스트를 남긴다.
- `detail`/`title`은 보안 관점에서 점검한다(정보 노출은 OWASP 약점) (→ `kb/error-response-design.md`).

## 7. 응답 DTO는 불변 (Immutability)

- 응답 DTO는 **`data class` + `val`**로 불변하게 만든다. 빌드 후 변형하지 않는다.
- 가변 컬렉션·노출된 가변 상태를 응답에 담지 않는다(공통 코딩 스타일의 불변성 원칙과 일치).

## 8. 안정적 필드 계약 / 버저닝 인식 (Stable Contract & Versioning)

- 필드 이름·타입·의미는 **공개 계약**이다. 임의로 바꾸지 않는다. 직렬화 이름은 Jackson 설정으로
  명시적으로 고정한다(`@JsonProperty`, 명명 전략) (→ `kb/content-negotiation-serialization.md`).
- 날짜/시간은 **ISO-8601**, 시각 필드는 타임존 인식 형식으로 일관 표현한다.
- 파괴적 변경은 버전/미디어타입/필드 추가로 흡수한다. **필드 제거·의미 변경은 호환성 점검 필수**.
