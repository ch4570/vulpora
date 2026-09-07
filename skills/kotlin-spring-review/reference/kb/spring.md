---
title: Spring 베스트 프랙티스 — Kotlin 리뷰 체크
source: https://docs.spring.io/spring-framework/reference/
last_fetched: 2026-06-24
skills: [kotlin-spring-review]
---

# Spring 베스트 프랙티스 — 코드 리뷰 체크 (Kotlin)

> 근거: Spring Framework 6.2 공식 레퍼런스(Context7 조회) + 정립된 실무. Clean Code 11장(시스템)과 정렬.

## 1. 의존성 주입 (DI)
- 🟠 **HIGH**: 필드 주입(`@Autowired lateinit var`) / 세터 주입(필수 의존성) → **생성자 주입**.
  공식문서: *"생성자 주입이 일반적으로 권장된다 — 객체 생성 시점에 모든 필수 의존성이 보장된다. 필드 주입은 아껴 써라."*
- 🟢 Kotlin은 주생성자 `val` 파라미터로 자연스럽게 생성자 주입:
  ```kotlin
  @Service
  class PlaceOrderService(
      private val loadProductPort: LoadProductPort,
      private val saveOrderPort: SaveOrderPort,
  ) : PlaceOrderUseCase { ... }
  ```
  단일 생성자면 `@Autowired` 불필요. 선택적 의존성만 nullable/기본값.
- 🟡 순환 의존성 → 설계 냄새(SRP 위반). 이벤트/포트 재설계 검토.
- 🟡 `@Component` 남발/필드로 `ApplicationContext` 끌어 쓰는 서비스 로케이터 패턴 지양(Clean Code 11장 R11.5).

## 2. 트랜잭션 (@Transactional)
- 🔴/🟠 **자기호출(self-invocation) 함정**: 같은 빈 내부 메서드 호출은 프록시를 거치지 않아
  `@Transactional`이 **동작하지 않는다**. 공식문서: *"프록시 모드(기본)에서는 프록시가 가로채는 외부 호출만 트랜잭션을 시작한다. 자기호출은 트랜잭션을 시작하지 않는다."*
  → 별도 빈으로 분리하거나 구조 변경. (`AopContext.currentProxy()`는 권장되지 않음.)
- 🟡 조회 전용 메서드 → `@Transactional(readOnly = true)`.
- 🟠 Kotlin 예외는 모두 unchecked라 기본 롤백 대상이지만, 롤백 정책을 명시적으로 검토
  (`rollbackFor`/`noRollbackFor`). 잡아서 삼킨 예외는 롤백을 막는다(트랜잭션 의도와 불일치).
- 🟠 트랜잭션 경계는 **application(유스케이스) 레이어**에. 컨트롤러/리포지토리에 흩뿌리지 말 것.
- 🟡 `propagation`/`isolation`/`timeout` 기본값 의존 시, 실제 요구(중첩 트랜잭션, 격리 수준)와 맞는지.
- 🟠 트랜잭션 안에서 외부 HTTP/메시지 발행(긴 작업) → 커넥션 점유·일관성 문제. 트랜잭션 밖으로/아웃박스.
- 🟠 `private`/`final` 메서드의 `@Transactional`은 프록시 불가(주의). Kotlin은 클래스/메서드가 기본 `final` —
  CGLIB 프록시가 필요하면 `kotlin-spring`(all-open) 플러그인으로 `@Transactional` 빈이 자동 open 되는지 확인.

## 3. 웹 레이어 (Controller)
- 🟠 컨트롤러에 비즈니스 로직 → 유스케이스로 위임. 컨트롤러는 변환/검증/HTTP 매핑만.
- 🟠 도메인 엔티티를 요청/응답에 직접 노출 → 전용 요청/응답 `data class`(DTO). (Clean Code 8장 경계)
- 🟠 입력 검증: `@Valid` + Bean Validation, 또는 도메인 생성 시 `require`. 신뢰 경계에서 검증.
- 🟡 예외 처리 일원화: `@RestControllerAdvice`로 도메인 예외 → HTTP 상태/에러 응답 매핑(소수의 도메인 예외).
- 🔴 에러 응답에 스택트레이스/내부 메시지/시크릿 노출 금지.
- 🟡 일관된 응답 엔벨로프(success/data/error/meta) 사용 여부.

## 4. 영속성 (JPA / Repository)
- 🟠 **N+1 쿼리**: 연관 조회 루프 → fetch join/`@EntityGraph`/배치 사이즈.
- 🟠 무한 조회 → 페이징(`Pageable`)·`LIMIT`. 무제한 결과 반환 금지.
- 🟡 JPA 엔티티를 도메인 모델로 그대로 쓰면 어노테이션이 도메인을 오염 → 헥사고날에선 JPA 엔티티(어댑터)와
  도메인 모델 분리 + 매퍼. (간단한 서비스면 실용적 절충 허용 — 트레이드오프 설명)
- 🟠 Kotlin + JPA 주의: `data class`를 `@Entity`로 쓰지 말 것(`equals/hashCode`·프록시 문제). 엔티티는 일반 class,
  `val` 식별자 + 가변 필드 최소화, no-arg 플러그인 사용.
- 🟠 지연 로딩 컬렉션을 트랜잭션 밖에서 접근(LazyInitializationException) — 경계 확인.
- 🟢 변경 감지(dirty checking) 의존 시 의도 명확화. 벌크 연산 후 영속성 컨텍스트 clear.

## 5. 설정 / 구성
- 🟡 설정값은 `@ConfigurationProperties`(타입 안전) > 흩어진 `@Value`. 하위 함수에 설정 기본값 박지 말 것(Clean Code G35).
- 🔴 **시크릿 하드코딩 금지** — 환경변수/시크릿 매니저. 저장소에 키/비밀번호/토큰 커밋 금지.
- 🟡 프로파일(`@Profile`)·조건부 빈이 의도대로 격리되는지.

## 6. 동시성 (Spring 런타임)
- 🔴 **CRITICAL**: 싱글톤 빈(`@Service`/`@Component`/`@Repository`)의 가변 인스턴스 필드 → 요청 스레드 공유 레이스.
  상태는 메서드 로컬/요청 스코프/불변으로. (Clean Code 13장)
- 🟠 `@Async` 메서드도 자기호출 함정 + 예외 전파(`Future`/`@Async` 핸들러) 확인. 전용 `Executor` 지정.
- 🟠 코루틴 사용 시(WebFlux/`suspend` 컨트롤러): `GlobalScope` 금지, 블로킹은 `Dispatchers.IO`(상세 `kotlin-idioms.md` 14절).

## 7. 보안 (Spring Security 포함)
- 🔴 인증/인가 누락된 엔드포인트, 메서드 보안(`@PreAuthorize`) 우회.
- 🔴 SQL 인젝션: 문자열 연결 쿼리 → 파라미터 바인딩(JPQL 파라미터/`@Query` named param/Criteria).
- 🔴 사용자 입력으로 경로/명령 구성(경로 순회·커맨드 인젝션).
- 🟠 CSRF(상태 변경 폼), 민감 데이터 로깅/응답 노출, 과도한 정보 에러.
- 🟡 비밀번호 해싱(BCrypt 등), 토큰 만료/검증.

## 8. 테스트 (Spring 슬라이스)
- 🟡 무거운 `@SpringBootTest` 남발 → 슬라이스(`@WebMvcTest`/`@DataJpaTest`/`@JsonTest`) 또는 순수 단위 테스트.
- 🟡 도메인/유스케이스는 컨테이너 없이 순수 단위 테스트(포트는 페이크/목). (Clean Code 9장 FIRST-Fast)
- 🟡 통합 테스트의 외부 의존은 Testcontainers/페이크. 시간/랜덤은 `Clock`/시드 주입.
- 🟡 `MockMvc`/`WebTestClient`로 웹 계약 검증. 80%+ 커버리지(변경 코드 기준).

## Kotlin + Spring 셋업 체크
- 🟢 `kotlin-spring`(all-open), `kotlin-jpa`(no-arg) 플러그인 적용 — `@Component`/`@Transactional`/`@Entity`가
  자동 open/no-arg 되는지. 없으면 프록시/JPA 인스턴스화 런타임 오류.
- 🟢 nullable ↔ DB 컬럼 nullability 일치. `lateinit`은 DI 주입 비-원시 `var`에만.

## 리뷰 훅
- [ ] 🟠 필수 의존성을 생성자 주입으로 받는가 (필드/세터 주입 아님).
- [ ] 🔴/🟠 `@Transactional` 자기호출(self-invocation) 함정이 없는가, 조회는 `readOnly=true`인가.
- [ ] 🟠 트랜잭션 경계가 application 레이어에 있고, 트랜잭션 안에서 외부 HTTP/메시지 발행을 하지 않는가.
- [ ] 🟠 컨트롤러가 도메인 엔티티를 직접 노출하지 않고 DTO를 쓰는가, `@Valid`로 입력을 검증하는가.
- [ ] 🔴 시크릿 하드코딩이 없는가, SQL 인젝션(문자열 연결 쿼리)이 없는가, 인증/인가가 적용됐는가.
- [ ] 🔴 싱글톤 빈에 가변 인스턴스 필드가 없는가.
- [ ] 🟠 N+1/무제한 조회가 없는가 (fetch join/`@EntityGraph`/페이징), `data class`를 `@Entity`로 쓰지 않는가.
