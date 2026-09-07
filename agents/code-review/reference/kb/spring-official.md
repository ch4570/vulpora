---
title: Spring 공식 (DI·빈 생명주기·트랜잭션·JPA·웹/검증)
source: https://docs.spring.io/spring-framework/reference/core/beans.html
sources_extra:
  - https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative.html
  - https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/annotations.html
  - https://docs.spring.io/spring-framework/reference/core/beans/dependencies/factory-collaborators.html
  - https://docs.spring.io/spring-boot/reference/web/servlet.html
versions: Spring Framework 6.2 / Spring Boot 3.x
last_fetched: 2026-06-22
consumers: [kotlin-spring-reviewer]
---

# KB: Spring 공식

## 리뷰 훅
- [ ] **생성자 주입**(+`val`)을 쓰는가 — 필드 `@Autowired`/가변 세터 주입은 지양.
- [ ] 싱글톤 빈에 **가변 인스턴스 상태**가 있는가(요청 간 공유 → 레이스).
- [ ] `@Transactional`을 **같은 클래스 내부에서 self-invocation** 하는가(프록시 미경유 → 무효).
- [ ] 조회 전용 메서드에 `readOnly = true`인가. 트랜잭션 내 외부 API 호출/장시간 작업이 있는가.
- [ ] 예외 롤백 규칙을 아는가(기본: unchecked만 롤백; checked는 `rollbackFor` 필요).
- [ ] 컨트롤러에서 엔티티를 직접 노출/바인딩하는가 → DTO 경계.

## 근거 (공식 요지)
- **DI**: 생성자 주입은 필수 의존을 불변(`val`)·완전 초기화로 보장하고 순환참조를 조기에 드러냄. (beans/dependencies)
- **빈 스코프**: 기본 `singleton` — 상태를 두면 모든 요청이 공유. 가변 상태는 메서드 지역/요청 스코프로. (beans)
- **선언적 트랜잭션**: 프록시 기반이라 **동일 빈 내부 호출은 어드바이스가 적용되지 않는다**(self-invocation). 별 빈 분리 또는 프로그래밍적 트랜잭션으로 해결. (transaction/declarative)
- **롤백 규칙**: 기본은 런타임 예외에만 롤백. 체크 예외 롤백은 `rollbackFor` 명시. (transaction annotations)
- **propagation/readOnly**: `REQUIRED`(기본) 외 의미를 이해하고, 조회는 `readOnly`로 플러시/더티체킹 비용 절감.

## 인용 시
"Spring `Declarative transaction` 기준 self-invocation은 프록시 미경유로 `@Transactional` 무효" 식으로.

## 문서 미확인 (재확인 필요)
- Spring Boot 정확한 버전별 기본값(릴리스 노트로 확인), Kotlin `@Transactional` + `suspend` 상호작용 세부.
