---
title: Spring 공식 문서 KB
source: https://docs.spring.io/spring-framework/reference/core/beans/dependencies/factory-collaborators.html
last_fetched: 2026-06-24
skills: [kotlin-spring-review]
---

# Spring 공식 문서 KB (코드 리뷰 기준)

> 조회일: 2026-06-22 · 출처: docs.spring.io (Framework 6.2 / Boot 3.4)

Kotlin + Spring 백엔드 코드 리뷰 규칙. 각 규칙 = 명령형 진술 → FLAG → FIX → 심각도.
심각도: 🔴 CRITICAL(머지 차단) · 🟠 HIGH(머지 전 수정) · 🟡 MEDIUM(개선) · 🟢 LOW(선택)

---

## 1. 핵심 IoC / DI

**1.1 필수 의존성은 생성자 주입.** 공식: *"The Spring team generally advocates constructor injection, as it lets you implement application components as immutable objects and ensures that required dependencies are not null ... returned to the client code in a fully initialized state."*
- FLAG: `@Autowired lateinit var repo` (필드 주입) → FIX: `class UserService(private val repo: UserRepository)` 🟠

**1.2 선택적 의존성에만 세터 주입.** *"use constructors for mandatory dependencies and setter methods ... for optional dependencies ... that can be assigned reasonable default values."* 🟡

**1.3 단일 생성자 빈은 `@Autowired` 생략. 생성자 인자 과다는 책임 분리 신호.** *"A large number of constructor arguments is a bad code smell."* FLAG: 인자 6개+ → FIX: SRP 분리 🟡

**1.4 순환 의존은 설계 재검토.** FLAG: A↔B 생성자 상호주입 → `BeanCurrentlyInCreationException` → FIX: 제3 빈 추출/이벤트 분리, 최후수단 `@Lazy` 🟠

**출처: https://docs.spring.io/spring-framework/reference/core/beans/dependencies/factory-collaborators.html**

---

## 2. 선언적 트랜잭션 (`@Transactional`)

**2.1 자기 호출(self-invocation)에 트랜잭션 기대 금지.** 기본 프록시 모드에서 내부 호출은 프록시를 안 거쳐 `@Transactional` 무시.
- FLAG: 같은 클래스의 `this.txMethod()` 호출 → FIX: 별도 빈 분리 주입(또는 AspectJ) 🔴 (조용히 미적용 → 정합성 위험)

**2.2 프록시 모드는 public 메서드만.** protected/private/internal의 `@Transactional` 무시. 🟠

**2.3 체크 예외 롤백은 `rollbackFor` 명시.** 자동 롤백은 unchecked/Error만. FLAG: 체크 예외 던지며 롤백 기대 → FIX: `@Transactional(rollbackFor=[IOException::class])` 🟠

**2.4 조회 전용은 `readOnly = true`.** 🟡

**2.5 독립 실행 감사/로그는 propagation 명시(`REQUIRES_NEW`).** 🟡

**2.6 `@Transactional`은 인터페이스가 아닌 구체 클래스 메서드에.** 🟡

**출처: https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative.html**

---

## 3. Web MVC (컨트롤러·검증·예외)

**3.1 `@RequestBody`/`@ModelAttribute`/`@RequestPart`에 `@Valid`.** 위반 시 `MethodArgumentNotValidException`. FLAG: 검증 없이 바인딩 → FIX: `@Valid @RequestBody req` + 제약 어노테이션 🟠

**3.2 단순 파라미터 제약(`@Min` 등)은 파라미터 직접 선언 + 클래스에 `@Validated`.** `@Valid`만으론 메서드 검증 미트리거. 위반 시 `HandlerMethodValidationException`. 🟠

**3.3 `Errors`/`BindingResult`는 검증 대상 바로 뒤에.** FLAG: 사이에 다른 파라미터 → FIX: `fun save(@Valid form: Form, bindingResult: BindingResult)` 🟠

**3.4 `MethodArgumentNotValidException`과 `HandlerMethodValidationException` 둘 다 처리.** 🟡

**3.5 교차 예외 처리는 `@ControllerAdvice`로 중앙화.** 🟡

**3.6 REST 에러는 `ProblemDetail`(RFC 9457).** FLAG: ad-hoc 에러 JSON → FIX: `ProblemDetail` 🟡

**3.7 다중 `@ControllerAdvice`는 `@Order` 명시(광범위 핸들러는 최저 우선).** 🟡

**출처:**
- **https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller/ann-validation.html**
- **https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller/ann-exceptionhandler.html**

---

## 4. 테스트 (슬라이스 vs 전체)

**4.1 전체 컨텍스트보다 슬라이스 선호.** *"load only the parts ... required to test a 'slice'."* FLAG: 단위 테스트에 `@SpringBootTest` → FIX: `@WebMvcTest`/`@DataJpaTest` 🟡

**4.2 `@WebMvcTest`는 단일 컨트롤러 + `@MockitoBean` 협력자.** 일반 `@Component`는 미스캔. FLAG: 서비스 빈 없어 로드 실패 → FIX: `@WebMvcTest(UserController::class)` + `@MockitoBean`(구 `@MockBean` deprecated) 🟠

**4.3 JPA는 `@DataJpaTest`.** 기본 인메모리 DB 대체 + 각 테스트 트랜잭션 롤백. 실제 DB 검증은 `@AutoConfigureTestDatabase(replace=Replace.NONE)`. 🟡

**4.4 한 클래스에 여러 슬라이스 어노테이션 혼용 금지.** FLAG: `@WebMvcTest`+`@DataJpaTest` 동시 → FIX: 하나 선택 + 필요한 `@AutoConfigure…`만 수동 추가 🟠

**4.5 진짜 통합엔 `@SpringBootTest` + `webEnvironment` 의도대로.** 실제 HTTP는 `RANDOM_PORT`. 🟡

**출처: https://docs.spring.io/spring-boot/reference/testing/spring-boot-applications.html**

---

## 5. Spring Boot (구성 프로퍼티·프로파일)

**5.1 흩어진 `@Value` 대신 `@ConfigurationProperties`.** 🟡

**5.2 불변 설정은 생성자 바인딩(Kotlin data class + `val`, `@DefaultValue`).** 🟡

**5.3 `@ConfigurationProperties`에 `@Validated` + JSR-303 → 기동 시 fail-fast.** FLAG: 필수 설정 누락 런타임 NPE → FIX: `@Validated` + 제약 🟠

**5.4 설정 클래스는 다른 빈 주입 말고 환경만.** 🟡

**5.5 `@ConfigurationPropertiesScan` 또는 `@EnableConfigurationProperties`로 등록.** FLAG: 스캔 누락 바인딩 미적용 → 🟠

**5.6 플레이스홀더는 정규형(kebab-case).** FLAG: `${app.myName}` → FIX: `${app.my-name}` 🟡

**5.7 환경별 `application-{profile}` + `spring.profiles.active`, 다중은 last-wins.** FLAG: 코드 `if(env=="prod")` → FIX: 프로파일 파일 분리 🟡

**5.8 운영 시크릿을 프로파일/소스에 평문 저장 금지.** 환경변수/configtree/시크릿 매니저로 외부화. FLAG: `application-prod.yaml`에 DB 비번 → 🔴

**출처: https://docs.spring.io/spring-boot/reference/features/external-config.html**

---

### 요약 (리뷰 우선순위)
| 규칙 | 심각도 |
|---|---|
| 2.1 self-invocation `@Transactional` 무시 | 🔴 |
| 5.8 시크릿 평문 | 🔴 |
| 1.1 필수 의존성 필드 주입 | 🟠 |
| 1.4 생성자 순환 의존 | 🟠 |
| 2.2 non-public `@Transactional` | 🟠 |
| 2.3 체크 예외 미롤백 | 🟠 |
| 3.1~3.3 검증/`@Validated`/`BindingResult` | 🟠 |
| 4.2/4.4 `@WebMvcTest` 모킹/슬라이스 혼용 | 🟠 |
| 5.3/5.5 설정 검증·등록 누락 | 🟠 |

## 리뷰 훅
- [ ] 🔴 `@Transactional` self-invocation 무시 / 설정·소스에 시크릿 평문 저장이 없는가.
- [ ] 🟠 필수 의존성 필드 주입 / 생성자 순환 의존 / non-public `@Transactional` / 체크 예외 미롤백이 없는가.
- [ ] 🟠 `@Valid`·`@Validated`·`BindingResult` 위치가 올바른가 (검증 누락 없음).
- [ ] 🟠 슬라이스 테스트(`@WebMvcTest`/`@DataJpaTest`) 모킹·혼용이 올바른가, 설정 검증·등록(`@Validated`/스캔)이 누락되지 않았는가.
