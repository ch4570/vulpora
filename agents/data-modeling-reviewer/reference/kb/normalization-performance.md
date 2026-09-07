---
title: 정규화와 성능 Trade-off
source: An Introduction to Database Systems, 8th ed. (C. J. Date), Part III
last_fetched: 2026-08-11
consumers: [data-modeling-reviewer]
owner: data-modeling-reviewer
source_type: book
sources:
  - uri: An Introduction to Database Systems (C. J. Date)
    version: 8th edition
    locator: Part III Database Design / Further Normalization
  - uri: Database System Concepts (Silberschatz, Korth, Sudarshan)
    version: 7th edition
    locator: Ch.7 Relational Database Design
last_verified: 2026-08-11
verified_by: Vulpora maintainers
review_after: 2026-11-11
status: verified
evals: [data-modeling-reviewer.order-integrity-review.v1, data-modeling-reviewer.avoid-modeling-overkill.v1]
revalidate_on: [new-edition, eval-failure, performance-regression]
---

# 정규화와 성능 Trade-off

## 리뷰 훅

- [ ] repeated group, multi-valued field와 부분/이행 종속이 update/insert/delete anomaly를 만드는가.
- [ ] 같은 business fact가 여러 곳에 저장된다면 authoritative source가 하나인가.
- [ ] denormalization이 구체적 query/SLO/volume/cardinality 또는 측정으로 정당화되는가.
- [ ] 중복 값의 갱신 원자성, stale 허용, rebuild/reconciliation과 failure owner가 있는가.
- [ ] write amplification/storage/복잡성 비용과 read 이득을 함께 기록했는가.
- [ ] DB별 index/materialized view/generated value 판단을 제품 전문가에게 handoff했는가.

## anomaly 중심 검토

정규화는 한 fact를 한 장소에 표현해 dependency가 key의 의미와 맞도록 하고 anomaly를 줄이는 수단이다.
리뷰에서는 정규형 label 암기보다 실제 failure를 확인한다.

- **update anomaly**: 같은 주소/상태를 여러 row에서 갱신해야 해 값이 갈라짐
- **insert anomaly**: 다른 unrelated fact 없이는 독립 fact를 저장할 수 없음
- **delete anomaly**: 한 fact 삭제가 유일한 다른 fact까지 제거함

분해에도 join, transaction, query complexity 비용이 있다. dependency와 lossless reconstruction을 고려하지 않은
기계적 table 쪼개기는 좋은 모델이 아니다.

## 비정규화 결정 기록

중복/derived storage를 제안하거나 승인할 때 최소한 다음을 요구한다.

1. 느린 대표 query와 SLO, 규모/cardinality/selectivity, 측정 증거
2. authoritative source와 계산 정의
3. sync/async 갱신, 허용 stale window와 실패 semantics
4. backfill/rebuild/reconciliation 및 schema evolution
5. correctness 검증과 rollback/제거 경로

이 정보가 없으면 "성능을 위해"라는 주장은 가설이다. physical index/partition/materialized view의 적합성은
대상 DB 버전과 실행 계획을 보는 후속 리뷰로 넘긴다.
