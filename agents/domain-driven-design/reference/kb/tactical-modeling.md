---
title: Tactical DDD — Entity, Value Object, Aggregate, Repository와 Domain Service
source: https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf
last_fetched: 2026-08-11
consumers: [domain-driven-design-reviewer]
owner: domain-driven-design-reviewer
source_type: official
sources:
  - uri: https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf
    version: 2015
    locator: Building Blocks of a Model-Driven Design, pages 15-24
last_verified: 2026-08-11
verified_by: vulpora-authoring
review_after: 2027-02-11
status: verified
evals: [domain-driven-design-reviewer.domain-model-review.v1]
revalidate_on: [source-change, eval-failure]
---

# Tactical DDD

## 리뷰 훅

- [ ] Entity의 identity와 lifecycle이 명시되고 equality가 우연한 field set에 좌우되지 않는가.
- [ ] identity가 필요 없는 descriptive concept를 immutable Value Object로 표현할 수 있는가.
- [ ] state transition과 business invariant가 data를 소유한 model 안에서 보호되는가.
- [ ] Aggregate root 외부에서 내부 state를 직접 수정하거나 여러 aggregate를 한 transaction에 묶는가.
- [ ] Repository가 aggregate root의 collection-like abstraction인지, persistence query/table API를 domain에 누출하는지.
- [ ] Application Service가 orchestration만 하고 Domain behavior를 model에 남기는가.
- [ ] Domain Service가 stateless domain operation인지, Entity 책임을 빼앗은 generic `*Service`인지.
- [ ] Factory가 complex Aggregate를 완전하고 invariant-valid한 상태로 생성하는가.

## 근거 요약

Entity는 attribute보다 identity와 continuity가 중요하고, Value Object는 어떤 대상을 묘사하며 identity가 필요 없다.
Aggregate는 data change의 consistency boundary이며 root가 내부 접근과 invariant를 통제한다. Repository는 필요한
Aggregate root에 대해 저장 기술을 감추면서 model 관점의 조회·저장을 제공한다.

Service는 중요한 domain process가 Entity나 Value Object의 자연스러운 책임이 아닐 때 사용한다. Application Service와
Domain Service를 이름만으로 구분하지 말고, 전자가 use case/transaction/I/O 순서를 조정하고 후자가 ubiquitous language의
domain operation을 표현하는지 본다.

## 변경 내성 판단

- invariant가 여러 application handler/controller에 복제되면 새 use case가 기존 rule을 우회하기 쉽다.
- public mutable field/setter는 invalid intermediate state를 만들고 모든 caller를 rule owner로 만든다.
- persistence DTO/ORM annotation이 model semantics를 왜곡하면 mapping 비용과 domain purity 사이 trade-off를 명시한다.
- 모든 table마다 Repository나 모든 noun마다 Entity를 만들지 않는다. tactical pattern은 실제 model problem에만 쓴다.

## 리뷰 인용 형식

`Evans DDD Reference — Aggregates/Repositories 기준, <path:line>에서 root를 우회해 invariant가 application service로
누출된다.`처럼 관찰과 영향을 연결한다.
