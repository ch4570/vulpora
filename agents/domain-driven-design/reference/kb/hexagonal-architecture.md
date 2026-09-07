---
title: Hexagonal Architecture — Ports & Adapters
source: https://alistair.cockburn.us/hexagonal-architecture
last_fetched: 2026-08-11
consumers: [domain-driven-design-reviewer]
owner: domain-driven-design-reviewer
source_type: official
sources:
  - uri: https://alistair.cockburn.us/hexagonal-architecture
    version: original 2005 article
    locator: Intent; The Pattern; Structure; Application Notes
last_verified: 2026-08-11
verified_by: vulpora-authoring
review_after: 2027-02-11
status: verified
evals: [domain-driven-design-reviewer.domain-model-review.v1]
revalidate_on: [source-change, eval-failure]
---

# Hexagonal Architecture

## 리뷰 훅

- [ ] application이 UI, HTTP, batch, automated test 같은 서로 다른 driver로 같은 use case port를 통해 실행되는가.
- [ ] DB, remote API, broker, filesystem 같은 driven side capability가 application-owned port 뒤에 있는가.
- [ ] adapter가 protocol/type 변환을 경계에서 끝내고 framework DTO/entity를 core에 흘리지 않는가.
- [ ] port가 기술 이름(`JpaRepository`, `KafkaSender`)이 아니라 목적 있는 conversation을 표현하는가.
- [ ] application/domain core를 real DB/network 없이 deterministic하게 실행할 adapter(fake/in-memory)가 가능한가.
- [ ] 모든 class에 interface를 붙여 port 수와 mocking ceremony만 늘리지는 않았는가.

## 근거 요약

Cockburn의 원문은 application이 UI나 database 없이도 동작해 automated regression test로 실행되고, 외부 runtime
device와 격리되게 하는 것을 intent로 둔다. Port는 외부와 application 사이의 목적 있는 conversation이고,
adapter는 특정 기술 신호를 그 API로 변환한다.

Hexagon의 핵심은 육각형이나 폴더 명이 아니라 **inside/outside asymmetry**다. Driving adapter는 application을
호출하고, driven adapter는 application이 요구하는 외부 capability를 구현한다. 같은 port에 production adapter와
test adapter가 꽂힐 수 있어야 격리가 실재한다.

## Layered Architecture와 함께 볼 때

- Layered는 책임의 수직 분리를 설명하고 Hexagonal은 core와 외부 actor/device의 경계를 강조한다.
- Application/Domain layers를 inner hexagon에 두고, web/persistence/messaging을 adapters로 둘 수 있다.
- `port` package가 있어도 core가 framework annotation/type을 직접 요구하면 실질적 격리는 약하다.
- 작은 CRUD의 안정된 DB 접근까지 무조건 port로 감싸는 것은 비용이 이익보다 클 수 있다.

## 리뷰 인용 형식

`Cockburn Hexagonal Architecture — Intent/Structure 기준, <path:line>에서 core가 <external detail>을 직접 생성해
isolated test adapter를 끼울 seam이 없다.`처럼 실제 dependency를 적는다.
