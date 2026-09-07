---
title: 테스트 용이성과 리팩터링 내성
source: https://martinfowler.com/articles/mocksArentStubs.html
last_fetched: 2026-08-11
consumers: [domain-driven-design-reviewer]
owner: domain-driven-design-reviewer
source_type: official
sources:
  - uri: https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf
    version: 2015
    locator: Refactoring Toward Deeper Insight; Supple Design
  - uri: https://alistair.cockburn.us/hexagonal-architecture
    version: original 2005 article
    locator: Intent; Structure
  - uri: https://martinfowler.com/articles/refactoring-external-service.html
    version: 2015-02-17
    locator: Putting the code under test; Separating the remote call
  - uri: https://martinfowler.com/articles/mocksArentStubs.html
    version: 2007-01-02
    locator: Coupling Tests to Implementations
last_verified: 2026-08-11
verified_by: vulpora-authoring
review_after: 2027-02-11
status: verified
evals: [domain-driven-design-reviewer.domain-model-review.v1]
revalidate_on: [source-change, eval-failure]
---

# 테스트 용이성과 리팩터링 내성

## 리뷰 훅

- [ ] domain rule test가 framework container, real DB, network, clock에 의존하지 않고 빠르고 결정적인가.
- [ ] time, randomness, ID generation, external I/O가 parameter 또는 좁은 port로 제어되는가.
- [ ] 테스트가 public behavior와 invariant를 검증하는가, private method·call order·internal class에 결합하는가.
- [ ] mock 수가 많아 하나의 use case 변경이 광범위한 test rewrite를 요구하는가.
- [ ] adapter contract는 integration/contract test로, domain policy는 unit test로 알맞은 경계에서 검증하는가.
- [ ] 구조 변경 전 characterization/regression test가 현재 behavior를 잠그는가.
- [ ] 변경 이유가 다른 책임이 분리되고, 함께 변하는 domain concept는 응집되어 있는가.

## 근거 요약

Evans의 Supple Design은 client가 최소한의 느슨하게 결합된 concept로 domain scenario를 표현하고, 변경하는 개발자가
결과를 예측하기 쉬운 구조를 지향한다. Intention-Revealing Interface와 side-effect-free operation은 model을
이해하고 안전하게 바꾸는 비용을 낮춘다.

Cockburn의 Hexagonal Architecture는 application을 UI/DB 없이 실행하고 같은 port에 test adapter를 연결하는 것을
핵심 이익으로 설명한다. Fowler의 external-service refactoring은 nondeterministic 외부 접근을 seam 뒤로 옮기고
작은 behavior-preserving step과 테스트로 구조를 바꾸는 접근을 보여준다.

Fowler는 mock 기반 interaction test가 method의 collaborator 호출 방식에 결합되어 implementation change 때 더 쉽게
깨질 수 있음을 지적한다. 따라서 mock을 금지하지는 않지만, business outcome과 invariant가 state/return/event로
검증 가능하면 그 observable behavior를 우선한다.

## 리팩터링 내성 체크

- **좋은 신호**: domain test가 adapter 교체와 package 이동 후에도 그대로 통과한다.
- **나쁜 신호**: private method rename, collaborator 분할, call order 변경만으로 많은 test가 실패한다.
- **좋은 신호**: 새 business rule이 하나의 Aggregate/policy와 그 behavior test에 모인다.
- **나쁜 신호**: 같은 rule 변경이 controller, application service, persistence hook, multiple mocks에 번진다.

개선 순서는 `behavior test 확보 → external seam 추출 → domain behavior 이동 → dependency direction 정리`다.
한 번에 하나씩 적용하고 각 단계에서 같은 observable behavior를 검증한다.

## 리뷰 인용 형식

`Fowler Mocks Aren't Stubs — Coupling Tests to Implementations 기준, <test path:line>이 저장 순서까지 고정해
domain behavior를 유지한 내부 리팩터링에도 깨진다.`처럼 test와 production evidence를 함께 적는다.
