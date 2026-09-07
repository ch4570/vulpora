---
title: DDD Layered Architecture와 3-layer 변형
source: https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf
last_fetched: 2026-08-11
consumers: [domain-driven-design-reviewer]
owner: domain-driven-design-reviewer
source_type: official
sources:
  - uri: https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf
    version: 2015
    locator: Layered Architecture, pages 15-17
last_verified: 2026-08-11
verified_by: vulpora-authoring
review_after: 2027-02-11
status: verified
evals: [domain-driven-design-reviewer.domain-model-review.v1]
revalidate_on: [source-change, eval-failure]
---

# DDD Layered Architecture

## 리뷰 훅

- [ ] UI/delivery가 input validation과 representation에 집중하고 business rule을 소유하지 않는가.
- [ ] Application layer가 use case, authorization/transaction boundary와 coordination을 담당하되 invariant를 구현하지 않는가.
- [ ] Domain layer가 model과 business rule을 표현하며 UI, application orchestration, infrastructure에 의존하지 않는가.
- [ ] Infrastructure가 persistence, messaging, remote client와 technical service를 제공하며 model을 지배하지 않는가.
- [ ] controller가 repository를 직접 호출하거나 domain이 ORM/web/message 타입을 public contract로 노출하는 layer bypass가 있는가.
- [ ] package 이름과 실제 import/call direction이 일치하는가.

## Evans식 conceptual layers

Evans의 Layered Architecture는 UI, Application, Domain, Infrastructure의 책임을 분리한다. 중요한 규칙은 숫자나
물리 디렉터리가 아니라 domain model과 business logic을 다른 application concern에서 격리하는 것이다. Domain은
business state와 rule을, Application은 얇은 use-case coordination을 맡는다. Infrastructure는 바깥 세부다.

## “DDD 기반 3-layer” 판정법

Evans는 3-layer DDD를 정의하지 않았다. 따라서 “3-layer”라는 이름만으로 적합성을 판정하지 않고, 먼저 팀이 어떤
책임을 합치거나 바깥으로 뺐는지 mapping을 확인한다. 흔한 표현은 다음처럼 서로 다르다.

- **Presentation / Application / Domain**: Infrastructure를 각 layer의 technical support 또는 별도 runtime detail로 취급.
- **Application / Domain / Infrastructure**: UI/delivery를 application 앞의 adapter로 취급.
- **Presentation / Business / Data**: 전통적 3-tier. Business가 procedural service이고 Domain model이 없을 수 있어
  DDD layered architecture와 동의어가 아니다.

Evans 기준으로 공통 확인할 것은 layer 수가 아니라 다음 책임 분리다.

- business rule은 Domain에 있다.
- Application은 use case를 조정하고 Domain model을 직접 표현하는 rule을 빼앗지 않는다.
- delivery/persistence DTO는 경계에서 domain type으로 번역된다.
- Domain model은 UI·application orchestration·infrastructure concern에서 격리된다.

Application-owned outbound port, Infrastructure adapter 구현, composition root에서의 조립은 **Hexagonal/DIP profile**의
구체 방식이다. 해당 profile을 채택한 코드에만 그 규칙을 적용하며, layered-only 구조에는 자동으로 강요하지 않는다.

전형적인 `Controller → Service → Repository` 3-tier 구조는 Service에 모든 rule이 몰리고 Domain이 record에 그친다면
DDD layered architecture가 아니다. 반대로 작은 service에서 framework annotation 일부를 허용하는 실용적 선택도
항상 HIGH 위반은 아니다. 변경 비용과 testability를 코드로 확인한다.

## 리뷰 인용 형식

`Evans DDD Reference — Layered Architecture 기준, <path:line>의 application service가 <invariant>를 직접 소유해
Domain layer가 우회된다.`처럼 책임 위반을 구체화한다.
