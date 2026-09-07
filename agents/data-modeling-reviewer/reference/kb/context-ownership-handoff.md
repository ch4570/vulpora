---
title: Bounded Context 데이터 소유권과 DB 리뷰 Handoff
source: Domain-Driven Design (Eric Evans), Ch.14 Maintaining Model Integrity
last_fetched: 2026-08-11
consumers: [data-modeling-reviewer]
owner: data-modeling-reviewer
source_type: book
sources:
  - uri: Domain-Driven Design (Eric Evans)
    version: 1st edition
    locator: Ch.14 Maintaining Model Integrity / Bounded Context / Context Map
  - uri: Building Microservices (Sam Newman)
    version: 2nd edition
    locator: Ch.6 Workflow / Ch.7 Build / Data ownership sections
last_verified: 2026-08-11
verified_by: Vulpora maintainers
review_after: 2026-11-11
status: verified
evals: [data-modeling-reviewer.order-integrity-review.v1]
revalidate_on: [new-edition, eval-failure, ownership-incident]
---

# Bounded Context 데이터 소유권과 DB 리뷰 Handoff

## 리뷰 훅

- [ ] 같은 이름이 context별로 다른 identity/invariant/lifecycle을 가지는지 확인했는가.
- [ ] 각 business fact/table/document의 authoritative write owner가 하나인가.
- [ ] 다른 context가 owner의 내부 table/entity/enum을 직접 갱신하거나 결합하지 않는가.
- [ ] cross-context 참조가 local FK/object graph인지 external ID/snapshot/contract인지 의도와 함께 기록됐는가.
- [ ] 복제된 read model의 source, freshness, rebuild, deletion/retention 책임이 있는가.
- [ ] DB별 후속 reviewer에게 query/volume/consistency/constraint/history/migration 정보를 넘겼는가.

## Context와 data owner

bounded context는 특정 모델과 언어가 일관되는 범위다. `Customer`가 판매 context의 구매 주체와 지원 context의
상담 대상을 각각 의미할 수 있으며, 두 모델을 한 universal table/object로 합치는 것이 항상 정합성을 높이지는 않는다.
각 context는 자기 규칙을 소유하고 다른 context와 명시적 ID/API/event/translation contract로 통합한다.

authoritative writer는 business fact의 유효성을 결정하는 owner다. 다른 context의 read model은 필요에 따라 데이터를
복제할 수 있지만 원본 소유권, freshness/SLA, 삭제 전파, replay/rebuild를 가져야 한다. 공유 DB 자체보다 **동일 fact에
대한 다중 writer와 암묵적 coupling**이 핵심 위험이다.

## PostgreSQL 등 제품별 리뷰 Handoff

제품 중립 modeling review는 다음 packet을 만든다.

| 항목 | 전달 내용 |
|---|---|
| workload | 주요 write/read/query 시나리오와 SLO |
| scale | row/document volume, 증가율, cardinality/selectivity 추정과 근거 |
| integrity | PK/candidate key, FK/cardinality, uniqueness/check, concurrency boundary |
| history | audit/effective/record time, retention, correction/delete 정책 |
| ownership | context와 authoritative writer, cross-context contract |
| consistency | transaction 범위, stale 허용, retry/idempotency |
| evolution | backfill, compatibility, migration/rollback unknown |

후속 PostgreSQL reviewer는 이 packet과 실제 version/schema/query plan으로 type, constraint syntax, index, partition,
locking/migration을 판정한다. modeling reviewer는 실행 계획 없이 index를 확정하거나 DB에 접속하지 않는다.
