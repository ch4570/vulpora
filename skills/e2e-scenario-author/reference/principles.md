# E2E 시나리오 작성 핵심 원칙 (Principles)

> 이 문서는 BDD/테스트 설계 표준과 Spring·NestJS·메시징 공식 문서에서 추출한 E2E 시나리오 작성 원리를,
> `e2e-scenario-author` 스킬의 규칙(`SCA-n`)에 대응시켜 정리한 **헌법**이다.
> KB(`kb/*.md`)가 "공식 문서의 사실·규칙"이라면, 이 문서는 "판단 기준·통찰"이다.
> 충돌 시 **KB(공식 문서)가 principles보다 우선**한다.
>
> **출처(Sources)**
> - Cucumber Gherkin Reference — Given/When/Then, Scenario Outline/Examples
>   (https://cucumber.io/docs/gherkin/reference/)
> - Kotest BehaviorSpec — Given/When/Then 테스트 스타일
>   (https://kotest.io/docs/framework/testing-styles.html)
> - ISTQB Foundation Level Syllabus — 블랙박스 테스트 설계 기법(동등 분할·경계값 분석)
>   (https://www.istqb.org/)
> - RFC 9110 (HTTP Semantics) §9.2.2 Idempotent Methods
>   (https://www.rfc-editor.org/rfc/rfc9110.html#name-idempotent-methods)
> - Spring Web MVC — Mapping Requests(`@RequestMapping` 및 메타애너테이션)
>   (https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller/ann-requestmapping.html)
> - Spring for Apache Kafka — `@KafkaListener`
>   (https://docs.spring.io/spring-kafka/reference/kafka/receiving-messages/listener-annotation.html)
> - NestJS — Controllers, Validation, Guards
>   (https://docs.nestjs.com/controllers, https://docs.nestjs.com/techniques/validation,
>   https://docs.nestjs.com/guards)

---

## 0. 대전제: 카탈로그는 "코드의 거울"이지 "사람의 기억"이 아니다

> 시나리오 카탈로그의 단일 진실 공급원(SSOT)은 **현재 소스 코드의 API 계약**이다.
> 사람의 기억·과거 스펙·머릿속 도메인 지식은 신뢰 대상이 아니다.

- 카탈로그는 매 실행 시 **코드에서 재생성(overwrite)** 되며 손편집은 보존되지 않는다(`SCA-3`).
- 사람의 맥락은 카탈로그가 아니라 별도 노트 파일에 남긴다. 카탈로그에 손으로 적은 시나리오는 다음 실행에서 사라진다.
- 따라서 "왜 이 시나리오가 있는가"의 답은 항상 **소스의 어느 매핑/리스너/핸들러에서 유도되었는가**여야 한다.

---

## 1. 코드에서 유도하라, 기억에서 짓지 마라 (Derive-from-code)

대응: `SCA-5`, `SCA-5.1`, `SCA-5.2`, `SCA-19`.

1. **API 표면은 열거(enumerate)되는 것이지 회상되는 것이 아니다.** REST 매핑(Spring `@GetMapping`,
   NestJS `@Controller` + `@Get` 등),
   메시지 리스너(`@KafkaListener`), outbox 핸들러/발행기를 정적 스캔으로 모두 찾아낸다.
   스캔 패턴이 놓친 표면은 카탈로그에 없는 표면이며, 이는 커버리지 구멍이다.
2. **경로·토픽은 해석(resolve)하라.** 매핑이 상수(`@GetMapping(Paths.ARTICLES)`)나 프로퍼티
   플레이스홀더(`@GetMapping("${api.article.path}")`)를 쓰면, 참조된 상수 선언이나 설정값을
   **카탈로그 SHA 시점 기준으로 읽어** 실제 경로를 확정한다(`SCA-5.1`).
3. **해석 실패는 침묵하지 말고 즉시 실패하라.** 미해결 표현식·누락 심볼·파싱 실패는
   `<파일>:<라인>: <사유>` 형식으로 멈춘다(`SCA-5.2`). 실패 시 카탈로그는 덮어쓰지 않는다.
   리터럴 표현식으로의 조용한 폴백은 금지(거짓 시나리오를 낳는다).
4. **인증 전제는 로컬 신호에서만 읽는다.** Spring `@PreAuthorize`/`@Secured`, NestJS `@UseGuards`,
   또는 그 로컬 신호를 감싼 프로젝트 decorator가 있을 때만 인증 시나리오를 둔다. 전역 보안 설정에서
   추론하지 않는다(과잉/누락 방지).
5. **발견 결과와 카탈로그를 기계적으로 대조하라.** Canonical source inventory의 exact target과
   required behavior floor를 catalog validator에 결합한다. 체크리스트나 모델의 “모두 작성함” 주장은
   커버리지 증거가 아니다(`SCA-19`).

---

## 2. 표면별 커버리지 하한선 (Coverage floors)

대응: `SCA-7`. 이는 권고가 아니라 **강제(normative)** 다.

| 표면 | 최소 시나리오 |
|------|---------------|
| HTTP 엔드포인트 | happy 1개; 인증 애너테이션이 있으면 `AUTH-FAIL` 1개 |
| 검증 제약(`@Valid`/`@Min`/`@NotBlank` 등)이 있는 엔드포인트 | 제약 그룹마다 `VALIDATION-FAIL` 1개 |
| 메시지 리스너 | `CONSUME` 1개 |
| 재시도/DLQ 배선이 있는 리스너 | 추가로 `DLQ` 1개 |
| outbox 핸들러(워커) | `CONSUME` 1개, 하위 발행이 있으면 `PUBLISH` 1개 |
| outbox 발행기(API) | outbox row 기록을 검증하는 `PUBLISH` 1개 |

1. **하한선은 "코드가 강제하는 것"에 정확히 비례한다.** 하한선을 넘는 경계/음성 시나리오는
   컨트롤러 코드 자체가 그 제약을 드러낼 때만 생성한다.
2. **코드에 없는 음성 경로를 발명하지 마라.** 코드가 검증·인증·충돌을 강제하지 않는다면
   그 음성 시나리오는 거짓이며, 실행 시 무의미하게 실패하거나 통과한다.
3. 체크리스트와 규칙은 **항상 일치**해야 한다. 둘이 어긋나면 규칙이 진실이다.

---

## 3. 생성의 결정론 (Determinism of generation)

대응: `SCA-6`, `SCA-6.1`, `SCA-6.2`, `SCA-11.1`, `SCA-13`.

1. **시나리오 ID는 결정론적으로 유도한다.** `E2E-{AREA}-{TARGET}-{BEHAVIOR}` 형식이며, AREA는 발견한
   안정 경로/이벤트 토큰으로, TARGET은 경로 변수 이름까지 보존해 기계적으로 만든다.
   예: `GET /api/v1/articles` → `E2E-ARTICLE-GET-HAPPY`,
   `POST /api/v1/orders` 검증 실패 → `E2E-ORDER-POST-VALIDATION-FAIL`.
2. **동일 ID 충돌은 즉시 실패다.** 두 표면이 같은 ID를 유도하면 두 위치를 인용하며 멈춘다(`SCA-6.2`).
3. **출력은 안정 정렬·정규화한다.** 전체 ID 사전순, LF 개행, 후행 공백 제거, 블록 간 빈 줄 1개(`SCA-11.1`).
4. **같은 source fingerprint에서 두 번 생성하면 전체 바이트가 동일해야 한다.** wall-clock 헤더는
   금지한다(`SCA-13`). 비결정적 생성은 허용 상태가 아니라 **스킬의 버그**다.

---

## 4. 음성·경계 규율 (Negative/boundary discipline)

대응: `SCA-7`(음성 floor), KB `boundary-and-negative-cases.md`.

1. **동등 분할 + 경계값 분석으로 후보를 뽑되, 코드가 강제하는 것만 채택한다.**
   입력 도메인을 유효/무효 동등 클래스로 나누고, 각 경계의 양쪽 값을 후보로 두되,
   최종 시나리오는 컨트롤러의 검증 애너테이션·예외 처리가 실제로 강제하는 것만 남긴다.
2. **음성 경로는 관측 가능한 실패여야 한다.** `AUTH-FAIL`은 401/403, `VALIDATION-FAIL`은 400,
   `NOT-FOUND`는 404, `CONFLICT`는 409처럼 코드가 반환하는 상태로 단언한다.
3. **happy 하나로 끝내지 마라.** 행복 경로만 있는 카탈로그는 회귀를 못 잡는다. 다만 음성의 양은
   코드의 제약 표면에 묶인다(원칙 2-2).

---

## 5. 데이터 주도 + 합성 데이터 (Data-driven, synthetic)

대응: `SCA-16`, KB `data-driven-scenarios.md`.

1. **같은 행위 다른 데이터는 파라미터화한다.** 동일 Given/When/Then이 입력 집합만 다르면
   Scenario Outline/Examples 또는 데이터셋 표로 표현해 중복을 제거한다.
2. **실데이터·PII는 절대 금지.** 실제 사용자 ID/전화/이메일/주민번호, 운영 전용 인덱스명,
   운영 전용 플래그값 금지(`SCA-16`). 저장소 픽스처에서 관찰한 합성 값이나 `{{seed.TOKEN}}`만 허용한다.
3. **실값이 반드시 필요한 시나리오는 카탈로그에서 제외**하고 노트로 분리한다(자동 실행 불가하므로).

---

## 6. 설계 단계부터의 멱등성 (Idempotency by design)

대응: `SCA-17`, KB `idempotent-scenarios.md`, RFC 9110.

1. **모든 시나리오는 상태 변경 여부를 선언한다.** 순수 GET은 `Mutates: —`,
   POST/PUT/DELETE·발행기·outbox 핸들러는 `Mutates: <resource>`.
2. **상태 변경 시나리오는 재실행 안전해야 한다.** primary fence 뒤에 finally semantics로 실행되는
   shell teardown fence를 반드시 둔다. 첫 줄은 `# teardown`이며 last-in-area는 정리 전략이 아니다.
3. **고유 키로 재실행 충돌을 피한다.** 생성 시나리오는 결정론적이되 재실행 시 충돌하지 않는
   키(고유 토큰)를 쓰거나, 멱등 메서드(PUT/DELETE) 의미(RFC 9110 §9.2.2)에 맞춰 설계한다.
4. **의존성은 명시적 배열로.** `Depends-on: [<ID>, <ID>]`, 캡처는 `Captures: <KEY>`.
   순환 의존은 자기검증에서 거부된다(`SCA-15.DEP-CYCLE`).

---

## 7. 출력 규율 (Output discipline)

대응: `SCA-10`~`SCA-18`.

1. **고정 키 스펠링·블록 포맷을 지킨다.** 실행기(runner)가 리터럴 키로 파싱하므로 철자 변경은
   다음 실행을 조용히 깨뜨린다(`SCA-11`, `SCA-15.KEY-SPELL`).
2. **primary fence는 정확히 하나이고, 변경 시나리오만 shell teardown fence 하나를 추가한다**(`SCA-12`).
3. **종료 전 자기검증(self-validation)** 으로 누락 키·잘못된 전제 문법·의존 순환·중복 ID·금지 fence를
   후보에서 잡고, 실패 시 기존 카탈로그를 건드리지 않는다(`SCA-15`).
4. **쓰기 대상은 정확히 정해진 경로만.** 리포트 디렉터리·노트 파일을 침범하지 않는다(`SCA-1`, `SCA-4`).
