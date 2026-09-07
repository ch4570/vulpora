---
title: Spring bean·proxy·선언적 트랜잭션
source: https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/annotations.html
sources_extra:
  - https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/tx-decl-explained.html
  - https://docs.spring.io/spring-framework/reference/core/beans/dependencies/factory-collaborators.html
  - https://docs.spring.io/spring-framework/reference/core/beans/factory-scopes.html
versions: Spring Framework current reference
last_fetched: 2026-08-20
consumers: [java-reviewer]
owner: java-reviewer
source_type: official
last_verified: 2026-08-20
verified_by: vulpora-authoring
review_after: 2026-11-20
status: verified
evals: [java-reviewer.spring-transaction-evidence.v1]
revalidate_on: [spring-major-version-change, source-change, eval-failure]
---

# Spring bean·proxy·선언적 트랜잭션

## 리뷰 훅

- [ ] 필수 의존성이 생성자로 주입되고 완전 초기화되는가? Field injection이나 optional dependency를
      숨기는 setter가 테스트와 불변성을 약화하지 않는가?
- [ ] 기본 singleton bean에 요청 사이에서 공유되는 가변 instance field가 있는가? 실제 write/read
      경로가 동시에 호출될 수 있는지 확인했는가?
- [ ] `@Transactional` 메서드가 실제 Spring bean이며 외부 proxy 호출을 통해 진입하는가?
      self-invocation 또는 직접 생성으로 advice가 빠지지 않는가?
- [ ] Transaction manager, propagation, isolation, timeout, read-only, rollback 규칙이 저장소와 호출부의
      실제 기대와 일치하는가?
- [ ] 외부 API·message publish·느린 계산을 transaction 안에 묶어 lock 유지와 부분 실패를 키우는가?
- [ ] CRITICAL/HIGH premise를 bean graph, 호출부, 설정 또는 focused transaction test로 확인했는가?

## 공식 계약

- Spring은 필수 의존성에 constructor injection을 권장한다. 완전 초기화와 불변 component 구성이
  쉬워지고, 많은 constructor argument는 책임 과다 신호일 수 있다.
- Spring singleton scope는 container와 bean definition마다 하나의 공유 instance를 사용한다. 따라서
  stateful field의 안전성은 `singleton` 이름이 아니라 실제 공유·동시 접근 경로로 판단한다.
- 선언적 transaction은 AOP proxy와 `TransactionInterceptor`를 통해 적용된다. 기본 proxy mode에서
  self-invocation은 proxy를 통과하지 않으므로 호출된 메서드의 `@Transactional` advice가 적용되지 않는다.
- 기본 rollback 규칙과 명시한 `rollbackFor`/`noRollbackFor`는 예외 계약과 함께 확인한다. `readOnly`는
  optimization hint이지 모든 data access 기술에서 write를 물리적으로 차단한다는 보장이 아니다.

## 증거와 심각도

Annotation 한 줄만으로 finding을 확정하지 않는다. Bean 등록 방식, 호출 receiver, method visibility,
transaction manager와 정상 경로를 확인한다. 정상 write 경로에서 transaction이 실제 누락되어 데이터
일관성을 깨뜨리는 것이 확인되면 HIGH 이상 후보지만, 호출 경로가 미확인이면 MEDIUM 상한과 확인 명령을
남긴다. 외부 I/O-in-transaction은 lock/timeout/원자성 요구를 함께 확인한 뒤 판단한다.
