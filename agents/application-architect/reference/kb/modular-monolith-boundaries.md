---
title: 모듈러 모놀리스의 경계와 공개 API
source: https://docs.spring.io/spring-modulith/reference/fundamentals.html
last_fetched: 2026-08-11
consumers: [application-architect]
owner: application-architect
source_type: official
sources:
  - uri: https://docs.spring.io/spring-modulith/reference/fundamentals.html
    version: current
    locator: Application Modules / Named Interfaces / Verifying Application Module Structure
  - uri: https://martinfowler.com/bliki/MonolithFirst.html
    version: 2015-06-03
    locator: Monolith First
last_verified: 2026-08-11
verified_by: Vulpora maintainers
review_after: 2026-11-11
status: verified
evals: [application-architect.multi-module-boundary-review.v1, application-architect.avoid-distributed-overengineering.v1]
revalidate_on: [source-version-change, eval-failure, architecture-regression]
---

# 모듈러 모놀리스의 경계와 공개 API

## 리뷰 훅

- [ ] module이 기술 layer가 아니라 응집된 business capability/언어를 소유하는가.
- [ ] 외부에 노출할 API와 내부 package/type이 구분되는가.
- [ ] 다른 module이 ORM entity, repository 구현, migration 또는 internal type을 직접 참조하지 않는가.
- [ ] module 간 호출이 공개 API 또는 명시적 event를 통하는가.
- [ ] 동일 process/transaction의 이점을 의도적으로 쓰는지, 우발적 결합인지 구분했는가.
- [ ] module boundary를 자동 검증하는 architecture test 또는 visibility rule이 있는가.

## 경계 판단

모듈러 모놀리스는 하나의 배포 단위를 유지하면서 내부를 응집된 application module로 나눈다. Spring
Modulith는 application module의 exposed API와 named interface, module structure verification을 명시적으로
다루지만 그 구현 도구 자체가 필수 조건은 아니다. 핵심은 **내부 타입을 숨기고 허용된 dependency만
경계를 넘게 하는 것**이다.

좋은 신호는 다음과 같다.

- capability 중심 module과 module-owned use case/API
- package-private/internal visibility 또는 export allowlist
- module API를 통한 호출과 경계별 architecture test
- 소유자 한 명인 data/invariant, 경계 밖에는 ID/snapshot/event contract만 노출

나쁜 신호는 `*-controller`, `*-service`, `*-repository` 같은 기술 계층별 module, 전역 `common-domain`,
다른 module entity에 대한 직접 객체 그래프 탐색, 양방향 dependency다.

## MSA와의 관계

한 process라는 사실은 결함이 아니다. local call과 transaction은 운영 단순성이라는 이점이 있다. 독립 배포,
격리 scaling, 조직 자율성이 실제로 필요하고 논리 경계가 안정됐을 때 모듈을 service로 추출할 수 있다.
경계가 불명확한 상태에서 먼저 분산하면 network와 eventual consistency가 모델링 문제를 숨기지 못한다.
