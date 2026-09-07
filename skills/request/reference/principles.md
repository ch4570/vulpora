# request DTO 설계 원칙 (헌법)

> **출처(Sources)**
> - Spring Framework Reference — Web on Servlet Stack / MVC Controller (Method Arguments): https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller/ann-methods/arguments.html
> - Spring Framework Reference — Validation (`@Valid` / `@Validated`): https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller/ann-validation.html
> - Jakarta Bean Validation 3.0 Specification (JSR 380/381): https://jakarta.ee/specifications/bean-validation/3.0/
> - Kotlin Language Reference — Annotation use-site targets: https://kotlinlang.org/docs/annotations.html#annotation-use-site-targets
> - OWASP Input Validation Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html
> - RFC 9457 — Problem Details for HTTP APIs: https://www.rfc-editor.org/rfc/rfc9457

이 문서는 요청 DTO 설계 시 **판단 기준(헌법)** 이다. 구체 문법·동작은 `reference/kb/`의 공식문서
기반 KB가 SSOT다. **충돌 시 KB(공식문서) > 본 원칙.** 원칙은 "무엇을/왜"를, KB는 "정확히 어떻게"를 다룬다.

---

## 1. 요청 DTO는 불변 값 객체다 (Immutability)

- 요청 DTO는 한 번 바인딩되면 변하지 않는다. Kotlin `data class` + `val`(또는 Java `record`)로 만든다.
- 가변 필드(`var`)·세터를 두지 않는다. 핸들러는 입력을 읽기만 하고, 변형이 필요하면 새 객체를 만든다.
- 컬렉션 필드는 노출 즉시 가변 별칭이 새지 않도록 읽기 전용으로 취급한다(방어적 복사/`List` 노출).
- 근거: 불변 입력은 숨은 부수효과를 제거하고, 검증 시점 이후 값이 바뀌지 않음을 보장한다.

## 2. 시스템 경계에서 검증한다 (Validate at the Boundary)

- 외부 입력은 **컨트롤러 경계에서** 검증한다. 비즈니스 계층으로 미검증 데이터를 흘려보내지 않는다.
- 검증을 통과한 DTO는 "이 형태가 보장된다"는 계약이 되어 하위 계층의 방어 코드를 줄인다.
- 근거: 경계에서 한 번 걸러야 내부 전 계층이 신뢰 가능한 데이터를 다룰 수 있다(OWASP).

## 3. 외부 입력은 절대 신뢰하지 않는다 (Never Trust External Input)

- 클라이언트가 보낸 값은 형식·범위·존재 여부 모두 의심한다. "프런트가 막아준다"는 가정 금지.
- 허용 목록(allowlist) 사고를 기본으로: 무엇을 받을지 명시하고 나머지는 거부한다(블록리스트 < 허용리스트).
- 식별자·열거형·길이·패턴은 명시적 제약으로 못 박는다.

## 4. 빠르게 실패한다 (Fail Fast → 400)

- 검증 실패는 처리 진입 전에 즉시 거부하고 `400 Bad Request`로 응답한다.
- 부분 처리 후 롤백 대신, 유효하지 않은 요청은 시작 자체를 막는다.
- 오류 응답은 무엇이 왜 틀렸는지 알려주되 내부 구현/스택을 노출하지 않는다(RFC 9457 Problem Detail 권장).

## 5. 바인딩 메커니즘을 의미에 맞게 분리한다 (Separation of Binding Mechanisms)

- `@RequestBody`(본문) / `@RequestParam`(쿼리·폼) / `@PathVariable`(경로) / `@RequestHeader`(헤더)는 역할이 다르다.
- 하나의 입력을 여러 출처에서 중복 수용하지 않는다. 출처가 곧 의미다.

## 6. 경로 vs 쿼리 vs 본문의 의미 (Path / Query / Body Semantics)

- **경로(path)**: 리소스를 식별하는 값(`/orders/{orderId}`). 리소스 정체성. 본문에 중복으로 넣지 않는다.
- **쿼리(query)**: 컬렉션의 필터·정렬·페이지네이션 등 선택적 조회 파라미터.
- **본문(body)**: 생성·수정할 리소스의 상태. 구조적 페이로드.
- 식별자는 경로에, 표현(representation)은 본문에 둔다.

## 7. 문자열보다 타입·열거형을 선호한다 (Prefer Types / Enums over Strings)

- 상태·구분 코드 같은 유한 집합은 `String`이 아니라 `enum`으로 받는다. 잘못된 값은 역직렬화/검증에서 걸러진다.
- 날짜·시각·금액·수량은 `String`이 아닌 의미 있는 타입(`LocalDate`, `BigDecimal`, `Int` 등)으로 받는다.
- 타입이 곧 검증이다. 표현 가능한 잘못된 상태를 타입 수준에서 줄인다.

## 8. 널 안전성을 설계로 표현한다 (Null-Safety by Design)

- Kotlin에서 필수 값은 non-null(`String`), 선택 값만 nullable(`String?`)로 선언한다. 타입이 1차 계약이다.
- Kotlin 프로퍼티 제약은 **`@field:`** 사이트 타깃을 써야 Jakarta 제약이 실제 필드에 적용된다(KB 참조).
- `@NotNull`/`@NotBlank`/`@NotEmpty`의 의미 차이를 구분해 정확한 제약을 고른다(KB 참조).

## 9. 검증과 비즈니스 규칙을 구분한다 (Validation vs Business Rules)

- DTO 검증은 **형식적/구조적 제약**(필수, 길이, 범위, 패턴, 열거형 멤버십)만 다룬다.
- "주문 금액이 잔액을 넘지 않는다" 같은 **상태 의존 규칙**은 서비스 계층의 책임이다. DTO에 넣지 않는다.
- sanitization(정제)은 검증이 아니다. 입력을 임의로 고치기보다 거부를 기본으로 한다(OWASP).

## 10. DTO는 도메인/엔티티와 분리한다 (DTO ≠ Entity)

- 요청 DTO를 영속 엔티티나 도메인 모델로 직접 쓰지 않는다. 노출 필드·검증·수명주기가 다르다.
- 외부 와이어 포맷 변경이 도메인으로 새지 않도록 경계에서 매핑한다.

---

### 우선순위 규칙
1. `reference/kb/*` (공식문서 기반) — 사실/문법의 SSOT
2. 본 `principles.md` — 판단 기준
3. 그 외 일반 지식

충돌 시 위 순서가 높은 것이 이긴다.
