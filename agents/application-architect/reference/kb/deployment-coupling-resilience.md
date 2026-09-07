---
title: 배포 결합과 통합 복원력
source: Building Microservices, 2nd ed. (Sam Newman), Ch.4, Ch.8, Ch.11
last_fetched: 2026-08-11
consumers: [application-architect]
owner: application-architect
source_type: book
sources:
  - uri: Building Microservices, 2nd ed. (Sam Newman)
    version: 2nd edition
    locator: Ch.4 Microservice Communication / Ch.8 Deployment / Ch.11 Resiliency
  - uri: https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/
    version: current
    locator: Timeouts, retries, and backoff with jitter
last_verified: 2026-08-11
verified_by: Vulpora maintainers
review_after: 2026-11-11
status: verified
evals: [application-architect.multi-module-boundary-review.v1]
revalidate_on: [source-version-change, incident, eval-failure]
---

# 배포 결합과 통합 복원력

## 리뷰 훅

- [ ] artifact/process/deployment/pipeline을 구분하고 실제 독립 release 가능성을 확인했는가.
- [ ] consumer/provider contract 변경이 backward/forward compatible한지와 rollout 순서를 확인했는가.
- [ ] 동기 원격 호출에 connection/request timeout과 총 latency budget이 있는가.
- [ ] retry가 멱등성·backoff·jitter·시도 상한을 가지며 계층별 retry 증폭을 피하는가.
- [ ] partial failure, overload, circuit breaking/bulkhead/fallback이 시나리오에 맞게 정의됐는가.
- [ ] event/message의 중복·순서·재처리·schema evolution·eventual consistency를 다루는가.

## 배포 결합

별도 image나 manifest는 독립 배포의 필요조건 일부일 뿐 충분조건이 아니다. provider와 consumer를 어느 순서로
배포해도 호환되는 contract, 독립 migration, feature transition, rollback/roll-forward가 있어야 coordinated
release를 피할 수 있다. 같은 artifact로 배포되는 modular monolith는 의도적으로 결합된 배포 단위이며,
내부 module 경계 품질과 별도로 평가한다.

## 동기 통합

원격 호출은 지연·부분 실패·과부하를 포함한다. timeout이 없으면 resource가 무기한 점유될 수 있고, retry는
일시 실패를 완화하지만 하위 부하를 증폭한다. 각 계층이 독립 retry하면 시도 수가 곱해질 수 있으므로 한 계층의
명시적 retry budget, exponential backoff와 jitter, 멱등성 또는 deduplication을 확인한다.

## 비동기 통합

메시징은 시간 결합을 줄이지만 전달 중복, 순서 변경, poison message, schema evolution과 최종 일관성을 만든다.
outbox/inbox, idempotent consumer, dead-letter/replay는 모든 흐름에 자동 적용하지 않고 데이터 손실·중복의 영향과
broker guarantee에 따라 선택한다. 사용자에게 보이는 pending/compensation 상태도 계약 일부다.

## 판정 한계

정적 config만으로 실제 timeout 동작이나 독립 배포를 확정하지 않는다. test/CI/release/incident evidence가 없으면
`확인 필요`로 두고 구체적인 failure injection 또는 contract/rollout 검증을 handoff한다.
