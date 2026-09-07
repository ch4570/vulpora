---
title: 코드에서 API 표면 열거 (Spring REST/NestJS REST/Kafka/Outbox)
source: https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller/ann-requestmapping.html, https://docs.spring.io/spring-kafka/reference/kafka/receiving-messages/listener-annotation.html, https://docs.nestjs.com/controllers, https://docs.nestjs.com/techniques/validation, https://docs.nestjs.com/guards
last_fetched: 2026-08-29
skills: [e2e-scenario-author]
---

# KB: API 표면 발견 (정적 스캔)

## 원칙: 표면은 코드에서 열거한다, 기억하지 않는다
> 카탈로그 생성의 입력은 **현재 소스의 매핑·리스너·핸들러**다(`SCA-5`). 정적 스캔으로 모두
> 찾아내고, 놓친 표면은 곧 커버리지 구멍이다.

먼저 `scripts/discover-surfaces.js <repository-root> docs/e2e-scenarios/CONTRACT.md`로 canonical source
inventory를 만든다. Catalog 생성 뒤에는 이 파일을 `validate-catalog.js`의 세 번째 인자로 넘겨 target과
required behavior floor를 exact-match한다(`SCA-19`). 사람의 체크리스트만으로 “전부 찾았다”고 판정하지 않는다.

## REST 매핑 (Spring Web MVC)
`@RequestMapping` 및 그 단축 애너테이션이 HTTP 표면을 정의한다.

| 애너테이션 | 의미 |
|------------|------|
| `@RequestMapping` | 범용 매핑(메서드·경로 지정). 클래스/메서드 양쪽 가능 |
| `@GetMapping`/`@PostMapping`/`@PutMapping`/`@DeleteMapping`/`@PatchMapping` | 메서드별 단축 |
| `@RestController`/`@Controller` | 핸들러 클래스 표시 |

핵심 규칙(공식):
1. **경로는 합성된다.** 클래스 레벨 `@RequestMapping("/api/v1/articles")` + 메서드 레벨
   `@GetMapping("/{id}")` → `GET /api/v1/articles/{id}`. 둘을 반드시 결합해 전체 경로를 확정한다.
2. **클래스 레벨만 있는 경우**: 메서드 매핑이 없는 클래스도 스캔해 표면을 누락하지 않는다.
3. **메타애너테이션(합성 애너테이션)**: 프로젝트가 `@GetMapping`을 감싼 커스텀 애너테이션
   (예: `@PublicArticleApi`)을 쓰면, 그 애너테이션 정의를 따라가 간접 `@RequestMapping`을 찾는다.
4. 메서드/경로/요청 바디 형태/응답 형태/인증 전제(지역 `@PreAuthorize`만)/검증 제약을 함께 읽는다.

스캔 패턴(예시; 빌드시스템 자동감지 후 소스 루트에 적용):
```text
직접 매핑:   '@(Get|Post|Put|Delete|Patch)Mapping'
클래스 매핑: '@RequestMapping'   (메서드 매핑 없는 클래스 필터)
합성 애너테이션: '@(RestController|Controller)' → 참조 애너테이션 재탐색
```

## 메시지 리스너 (Spring for Apache Kafka)
`@KafkaListener`가 컨슈머 표면을 정의한다.

핵심 규칙(공식):
1. `@KafkaListener(topics = ...)` 또는 `topicPattern`/`topicPartitions`로 구독 토픽을 지정.
2. **토픽은 리터럴이 아니라 프로퍼티 플레이스홀더**일 수 있다: `topics = "${app.topic.order-events}"`.
   이 경우 설정값을 카탈로그 SHA 시점으로 해석해 실제 토픽명을 확정한다(`SCA-5.1`).
3. `@KafkaListener`는 클래스+메서드 조합(`@KafkaListener` 클래스 + `@KafkaHandler` 메서드)도 가능.
4. **재시도/DLQ 배선**: `@RetryableTopic` 또는 `errorHandler` 참조가 있으면 DLQ 시나리오 표면이 추가됨(`SCA-7`).

스캔 패턴(예시):
```text
리스너:      '@KafkaListener(?:s)?'
재시도/DLQ:  '@RetryableTopic'
```

## REST 매핑 (NestJS)
NestJS는 `@Controller()`의 optional prefix와 `@Get()`/`@Post()` 등 method decorator의 path를
결합해 route를 만든다. 애플리케이션 bootstrap에서 `setGlobalPrefix()`를 호출하면 그 값도 앞에 붙는다.

1. `package.json`에 `@nestjs/common`과 `@nestjs/core`가 모두 있고 해당 package의 `src/**/*.ts`가
   있어야 `node-nestjs` profile로 인정한다. 이름만 비슷한 일반 Node repository는 지원 대상으로 보지 않는다.
2. `setGlobalPrefix` + `@Controller` + method decorator를 모두 정적으로 해석해 exact target을 만든다.
   상수는 선언까지 따라가며, 계산식·환경 의존 값은 `SCA-5.2`로 실패한다.
3. 인증 floor는 class/handler의 `@UseGuards` 또는 정의 내부에서 `UseGuards`를 감싼 프로젝트 decorator만
   근거로 삼는다. 전역 guard는 endpoint별 계약을 증명하지 않으므로 추론하지 않는다.
4. class-validator decorator는 `useGlobalPipes(new ValidationPipe(...))` 또는 handler-local
   `@UsePipes(...ValidationPipe...)`가 확인될 때만 validation behavior를 만든다.
5. `*.spec.ts`, `*.test.ts`, declaration file과 build output은 production surface에서 제외한다.

스캔 패턴(예시):
```text
컨트롤러/메서드: '@Controller|@(Get|Post|Put|Delete|Patch)'
전역 prefix/검증: 'setGlobalPrefix|useGlobalPipes.*ValidationPipe'
지역 인증:       '@UseGuards|UseGuards\\('
```

## Outbox 핸들러/발행기
트랜잭셔널 아웃박스 패턴의 두 방향 표면:
| 방향 | 신호(예시 패턴) | 표면 |
|------|------------------|------|
| 워커(소비) | `OutboxEventHandler<...>` 구현 | `CONSUME` (+하위 발행 시 `PUBLISH`) |
| API(발행) | `OutboxEvent(Publisher|Saver)`, `outboxRepository` | outbox row 기록 검증 `PUBLISH` |

- 핸들러가 다루는 이벤트 타입과 발행하는 하위 토픽을 코드에서 읽어 표면을 확정한다.

## 경로 상수 / 프로퍼티 해석 (필수)
> 매핑이 상수·플레이스홀더를 쓰면 **반드시 해석**한다(`SCA-5.1`).

1. **상수 참조**: `@GetMapping(Paths.ARTICLES)` → `Paths.ARTICLES` 선언을 읽어 실제 문자열로 치환.
2. **프로퍼티 플레이스홀더**: `@GetMapping("${api.article.path}")` → 설정 파일의 값을 카탈로그 SHA
   시점으로 읽어 치환.
3. **해석 불가 시 즉시 실패**: 런타임/프로파일 의존으로 정적 해석이 불가능하면
   `<파일>:<라인>: <사유>` 형식으로 멈춘다(`SCA-5.2`). 리터럴 표현식으로의 조용한 폴백 금지.

## 결정론적 ID 생성 (`SCA-6`)
열거된 표면마다 `E2E-{AREA}-{TARGET}-{BEHAVIOR}` ID를 기계적으로 만든다:
1. AREA = 발견한 안정 경로/토픽/이벤트 토큰(예: `/api/v1/articles` → `ARTICLE`, `order-events` → `ORDER`).
2. TARGET = 경로 변수 이름을 보존한 세그먼트+HTTP 메서드의 UPPER-KEBAB.
3. 예: `GET /api/v1/articles` → `E2E-ARTICLE-GET-HAPPY`,
   `POST /api/v1/orders` size 하한 실패 → `E2E-ORDER-POST-VALIDATION-FAIL-SIZE-MIN`,
   `order-events` 컨슈머 → `E2E-ORDER-CONSUME`.
4. **동일 ID 충돌 시 두 위치를 인용하며 즉시 실패**(`SCA-6.2`). 안정 AREA를 만들 수 없으면 fail closed.

## 리뷰 훅
- [ ] REST 경로를 **클래스+메서드 매핑 결합**으로 전체 경로를 확정했는가.
- [ ] NestJS 경로에 정적으로 해석한 **global prefix + controller prefix + method path**를 모두 반영했는가.
- [ ] **합성/메타애너테이션**을 따라가 간접 `@RequestMapping`을 놓치지 않았는가.
- [ ] `@KafkaListener`/outbox 핸들러/발행기를 모두 열거했는가(컨슈머·발행 양방향).
- [ ] **상수/프로퍼티 경로·토픽을 해석**했는가(미해결 시 `SCA-5.2`로 즉시 실패).
- [ ] 인증 전제를 **지역 애너테이션/decorator**(`@PreAuthorize`, `@UseGuards` 등)에서만 읽고 전역 설정에서 추론하지 않았는가.
- [ ] NestJS validation behavior가 실제 `ValidationPipe`와 DTO class-validator metadata 양쪽으로 증명되는가.
- [ ] 재시도/DLQ 배선(`@RetryableTopic` 등)을 감지해 DLQ 표면을 추가했는가.
- [ ] ID를 결정론 규칙으로 생성하고, 동일 ID 충돌을 즉시 실패로 처리했는가(`SCA-6`, `SCA-6.2`).
- [ ] 안정 AREA를 만들 수 없는 표면을 빈 `MISC` 시나리오로 숨기지 않고 실패했는가.
