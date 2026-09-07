---
title: 데이터 불변식과 History 모델링
source: https://martinfowler.com/eaaDev/timeNarrative.html
last_fetched: 2026-08-11
consumers: [data-modeling-reviewer]
owner: data-modeling-reviewer
source_type: research
sources:
  - uri: https://martinfowler.com/eaaDev/timeNarrative.html
    version: current
    locator: Time Narrative / Actual and Record Time
  - uri: Domain-Driven Design (Eric Evans)
    version: 1st edition
    locator: Ch.6 The Life Cycle of a Domain Object / Aggregates
last_verified: 2026-08-11
verified_by: Vulpora maintainers
review_after: 2026-11-11
status: verified
evals: [data-modeling-reviewer.order-integrity-review.v1]
revalidate_on: [source-change, eval-failure, audit-incident]
---

# 데이터 불변식과 History 모델링

## 리뷰 훅

- [ ] business invariant를 정상·경계·경쟁 쓰기 시나리오로 명시했는가.
- [ ] 각 invariant의 enforcement owner와 transaction/consistency boundary가 있는가.
- [ ] application validation만 있는 규칙이 concurrent write에서도 유지되는지 확인했는가.
- [ ] current state, audit log, domain event, temporal history 요구를 구분했는가.
- [ ] effective/actual time과 recorded/transaction time 중 필요한 축을 명시했는가.
- [ ] correction, deletion, retention, actor/reason과 history의 immutable 여부를 확인했는가.

## 불변식 추적

불변식은 "잘못된 데이터는 넣지 않는다"가 아니라 검증 가능한 문장이어야 한다.

- 한 주문의 total은 음수가 될 수 없다.
- active 기간이 겹치는 계약은 같은 owner에 둘 이상 존재할 수 없다.
- 승인된 상태는 취소 정책 없이 pending으로 되돌아갈 수 없다.

각 규칙에 `domain/application validation`, `database constraint`, `transaction/locking`, `asynchronous reconciliation`
중 enforcement 위치와 실패 semantics를 연결한다. application pre-check 후 write처럼 경쟁 window가 있으면 유일성이나
referential invariant가 깨질 수 있다. 어느 계층이 적합한지는 DB capability와 aggregate/transaction boundary에 따라
결정하되 owner 없는 중복 검증을 해결책으로 간주하지 않는다.

## History 종류

| 필요 | 가능한 모델 | 확인할 점 |
|---|---|---|
| 누가 언제 바꿨는가 | audit record | actor/reason, tamper/retention, before/after 또는 delta |
| 상태 전이 재구성 | append-only transition/event | ordering, duplicate, schema evolution, rebuild |
| 특정 시점의 유효 사실 | effective interval/version | overlap/gap, correction policy |
| DB에 기록된 시점까지 추적 | recorded time 추가 | late arrival/correction, bitemporal complexity |

current row의 `updated_at`만으로 이전 값과 전이 이유를 재구성할 수 없다. 반대로 복구·감사 요구가 없는 transient
상태에 event sourcing나 bitemporal model을 도입하는 것은 비용만 늘 수 있다. 먼저 필요한 질문의 시간 축을 정한다.
