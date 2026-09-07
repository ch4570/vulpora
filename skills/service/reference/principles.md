# service — 원칙(헌법)

> **출처(Sources)**
> - Spring Framework Reference — Data Access / Transaction Management: <https://docs.spring.io/spring-framework/reference/data-access/transaction.html>
> - Spring Framework Reference — Declarative Transaction Management (`@Transactional`): <https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative.html>
> - Spring Framework Reference — Data Access Exception Hierarchy: <https://docs.spring.io/spring-framework/reference/data-access/dao.html>

이 문서는 서비스 계층 설계의 **불변 규칙**이다. 충돌 시 우선순위는 **KB(`reference/kb/`) > 이 원칙 > 일반 통념**이다. 각 원칙은 위 공식 문서에 근거한다.

---

## 1. 서비스는 트랜잭션 경계다 (Transaction boundary)
트랜잭션은 **서비스 메서드**에서 시작하고 끝난다. 컨트롤러/리스너/배치 스텝에는 트랜잭션 경계를 두지 않는다. 하나의 서비스 메서드 = 하나의 **논리적 작업 단위(unit of work)**. 선언적 트랜잭션(`@Transactional`)은 프록시 기반 AOP로 동작하므로, 경계가 되는 메서드는 외부에서 빈을 거쳐 호출되어야 하고(자기 호출 금지) `open`이어야 한다.

## 2. 읽기 전용이 기본, 쓰기는 명시한다 (readOnly default + explicit writes)
클래스 레벨 `@Transactional(readOnly = true)`를 기본값으로 둔다. 쓰기 메서드만 메서드 레벨에서 `readOnly`를 해제하고(예: `@Transactional` 또는 `@Transactional(propagation = REQUIRES_NEW)`) 명시적으로 재정의한다. 이는 "기본은 읽기, 쓰기는 의도적"이라는 안전한 기본값을 코드로 강제한다.

## 3. 전파(propagation)는 의도적으로 선택한다 (Deliberate propagation)
전파는 기본값(`REQUIRED`)에 의존하지 말고 **이유와 함께** 선택한다. 호출자 트랜잭션과 분리되어 자체 커밋되어야 하는 쓰기는 `REQUIRES_NEW`를 쓴다(배치 chunk의 resourceless 트랜잭션, Kafka 리스너 컨텍스트와 분리). `REQUIRES_NEW`는 기존 트랜잭션을 **중단(suspend)**시키는 비용이 있으므로 남용하지 않는다.

## 4. 트랜잭션은 짧게 유지한다 (Keep transactions short)
트랜잭션 안에서 **외부 I/O(원격 호출, 외부 API, 사용자 대기, 메시지 발행 응답 대기)를 하지 않는다.** 긴 트랜잭션은 DB 락과 커넥션을 오래 점유해 처리량을 떨어뜨린다. 외부 호출은 트랜잭션 밖에서 수행하고, 대량 처리는 chunk 단위로 분할한다.

## 5. 서비스는 영속의 단일 진입점이다 (Single entry point to persistence)
시스템의 나머지(컨트롤러, 리스너, 다른 도메인, 배치 writer)는 **서비스를 통해서만** 해당 엔티티의 영속에 닿는다. repository를 직접 호출하지 않는다(`ControllerRepositoryAccessArchTest`로 강제). 이로써 트랜잭션 경계와 불변식을 한 곳에서 보장한다.

## 6. 오케스트레이션과 도메인 로직을 분리한다 (Orchestration vs domain logic)
서비스는 **오케스트레이션**(트랜잭션, 순서 제어, 애그리거트 간 조정, 매핑)을 담당한다. **비즈니스 규칙**은 도메인 모델/엔티티 안에 둔다. 서비스가 규칙 덩어리가 되는 "fat service"를 피하고, 빈약한 도메인 모델(anemic model)도 피한다. 서비스는 경계에서 `mapper`로 변환해 **model**을 다루고 entity를 외부로 노출하지 않는다.

## 7. 재시도 가능한 작업은 멱등하게 만든다 (Idempotency)
재시도·중복 전달(at-least-once 메시지 소비, 배치 재실행, HTTP 재시도)이 가능한 작업은 **멱등**해야 한다. upsert(`ON CONFLICT`)·멱등성 키·중복 제거(dedup)로 같은 입력을 여러 번 적용해도 결과가 동일하도록 설계한다. 멱등 핸들러는 `REQUIRES_NEW`와 결합해 부분 실패 후 안전하게 재시도된다.

## 8. 예외를 번역한다, 영속 예외를 누출하지 않는다 (Exception translation)
하위 영속 기술의 예외(JDBC `SQLException`, JPA provider 예외)를 상위로 그대로 누출하지 않는다. `@Repository`의 `PersistenceExceptionTranslationPostProcessor`가 provider 예외를 Spring의 비검사 `DataAccessException` 계층으로 번역하고, 서비스는 이를 다시 **도메인 예외**로 번역해 호출자에게 의미 있는 계약을 제공한다.

## 9. 생성자 주입만 사용한다 (Constructor injection)
의존성은 **생성자 주입**으로만 받는다. 필드 주입(`@Autowired` 필드) 금지(`InjectionStyleArchTest`로 강제). 생성자 주입은 불변 의존성, 테스트 용이성, 누락된 빈의 조기 발견을 보장한다.

## 10. 설정은 빠르게 실패한다 (Fail-fast config)
필수 빈에 `@ConditionalOnMissingBean`을 쓰지 않는다. 오설정이면 부팅 시 즉시 실패해야 하며, 런타임에 조용히 잘못된 폴백을 쓰면 안 된다.

---

## 참고
- 구체적 규칙·코드 예시는 `reference/kb/`를 따른다(이 원칙보다 KB가 우선).
- 라우팅은 `reference/kb/INDEX.md` 참조.
