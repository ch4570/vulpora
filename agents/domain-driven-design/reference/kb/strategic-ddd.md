---
title: Strategic DDD — Ubiquitous Language와 Bounded Context
source: https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf
last_fetched: 2026-08-11
consumers: [domain-driven-design-reviewer]
owner: domain-driven-design-reviewer
source_type: official
sources:
  - uri: https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf
    version: 2015
    locator: Definitions; Putting the Model to Work; Context Mapping for Strategic Design
last_verified: 2026-08-11
verified_by: vulpora-authoring
review_after: 2027-02-11
status: verified
evals: [domain-driven-design-reviewer.domain-model-review.v1]
revalidate_on: [source-change, eval-failure]
---

# Strategic DDD

## 리뷰 훅

- [ ] 코드·API·테스트·팀 문서가 같은 business concept를 같은 이름과 의미로 쓰는가.
- [ ] 같은 단어가 서로 다른 rule/lifecycle을 가지면 서로 다른 Bounded Context 후보인지 확인했는가.
- [ ] 디렉터리·서비스 수만 보고 context를 선언하지 않고 model applicability와 team/ownership evidence를 확인했는가.
- [ ] context 간 domain object, ORM entity, database table, transaction을 암묵적으로 공유하는가.
- [ ] upstream model이 downstream domain에 그대로 침투하는가, translation/ACL 또는 명시적 conformist 결정이 있는가.
- [ ] core domain과 supporting/generic capability의 투자 수준이 구분되는가.

## 근거 요약

Evans의 DDD 요약은 complex software에서 core domain에 집중하고, domain practitioner와 software practitioner가
모델을 함께 탐색하며, 명시된 Bounded Context 안에서 Ubiquitous Language를 사용하라고 정리한다.
Bounded Context는 특정 model이 정의되고 적용되는 경계다. 따라서 같은 이름의 class나 하나의 database가 있다는
사실만으로 하나의 model이라 단정할 수 없다.

Context Map은 context 사이의 실제 관계와 translation 정책을 드러낸다. Shared Kernel은 작은 공유 범위와 긴밀한
coordination을 전제로 하며, ACL은 외부 모델이 내부 모델을 오염시키지 않도록 번역한다. 어떤 패턴도 무조건 우월하지
않으므로 ownership, change cadence, integration cost를 함께 본다. ACL의 적용 gate·구조·안티패턴·테스트는
INDEX의 `anticorruption-layer.md`가 canonical owner다.

## 오탐 방지

- package-by-feature는 context의 증거 중 하나일 뿐 충분조건이 아니다.
- 같은 DB를 쓴다는 사실만으로 즉시 여러 context라고 단정하지 않는다. 먼저 독립된 모델과 ownership이 실제로 있는지 본다.
- Ubiquitous Language를 naming convention으로 축소하지 않는다. rule과 conversation에서 같은 의미가 유지되어야 한다.

## 리뷰 인용 형식

`Evans DDD Reference — Bounded Context/Context Map 기준, <관찰 사실> 때문에 <모델 경계 영향>이 발생한다.`처럼
source locator와 `path:line`을 함께 적는다.
