---
title: 아키텍처 · DDD · 분산 패턴 (Martin Fowler)
source: https://martinfowler.com/tags/domain%20driven%20design.html
sources_extra:
  - https://martinfowler.com/bliki/DomainDrivenDesign.html
  - https://martinfowler.com/bliki/BoundedContext.html
  - https://martinfowler.com/bliki/AnemicDomainModel.html
  - https://martinfowler.com/articles/injection.html
  - https://martinfowler.com/bliki/ValueObject.html
  - https://martinfowler.com/articles/microservices.html
  - https://martinfowler.com/bliki/CQRS.html
  - https://martinfowler.com/bliki/CircuitBreaker.html
  - https://martinfowler.com/bliki/TolerantReader.html
versions: martinfowler.com (bliki/articles)
last_fetched: 2026-06-22
consumers: [kotlin-spring-reviewer]
---

# KB: 아키텍처 · DDD · 분산 패턴 (Fowler)

## 리뷰 훅
- [ ] **의존성 방향**: 의존이 안쪽(도메인)으로 흐르는가. 도메인이 프레임워크/인프라에 의존하는가(역전 위반).
- [ ] **Anemic Domain Model**: 도메인 객체가 getter/setter뿐이고 행위가 서비스에만 있는가 → 행위를 도메인으로.
- [ ] **Bounded Context**: 컨텍스트 경계를 넘어 모델/엔티티가 새는가. 컨텍스트 간 결합.
- [ ] **포트/어댑터**: 외부 시스템(DB·메시지·외부 API)이 어댑터로 격리됐는가. 도메인에 외부 타입 누출.
- [ ] **Value Object**: 식별자 없는 개념(돈·기간·좌표)이 불변 VO인가, 원시 타입으로 흩어졌는가.
- [ ] **DI/IoC**: 협력자를 직접 생성(new)하는가 → 주입. (생성자 주입은 spring-official.md)
- [ ] (분산) 외부 호출에 **타임아웃·Circuit Breaker·재시도**가 있는가. 응답 파싱이 **Tolerant Reader**인가.
- [ ] (CQRS) 명령/조회 모델 분리가 복잡도를 정당화하는가(남용 경계).

## 근거 (Fowler 요지)
- **DDD/Bounded Context**: 큰 모델을 명시적 경계로 나누고 경계 안에서 유비쿼터스 언어를 일관되게. 경계를 넘는 모델 공유가 결합을 만든다. (bliki/DomainDrivenDesign, BoundedContext)
- **Anemic Domain Model**: 데이터와 행위 분리는 OO의 본질에 반하는 안티패턴(트랜잭션 스크립트로 귀결). (bliki/AnemicDomainModel)
- **IoC/DI**: 의존을 외부에서 주입해 결합을 낮추고 테스트성을 높인다("Inversion of Control Containers and the DI pattern"). (articles/injection)
- **Value Object**: 동등성이 값으로 결정되는 불변 객체. (bliki/ValueObject)
- **Microservices/회복탄력성**: 분산은 부분 실패가 기본 — **Circuit Breaker**로 장애 전파를 끊고, **Tolerant Reader**로 스키마 변화에 견딘다. (articles/microservices, bliki/CircuitBreaker, TolerantReader)
- **CQRS**: 읽기/쓰기 모델 분리. 이점이 분명할 때만(대부분 단일 모델로 충분 — 남용 경고). (bliki/CQRS)

## 인용 시
"Fowler `AnemicDomainModel` 기준 행위 없는 도메인 → 도메인 메서드로" / "`CircuitBreaker` 부재로 장애 전파 위험" 식으로.

## 보조
- 헥사고날·레이어 의존성 세부는 스킬 내부 `references/architecture.md` 병용.
