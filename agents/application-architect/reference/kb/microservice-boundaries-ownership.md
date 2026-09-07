---
title: 마이크로서비스 경계와 데이터 소유권
source: Building Microservices, 2nd ed. (Sam Newman), Ch.2, Ch.3, Ch.4, Ch.6
last_fetched: 2026-08-11
consumers: [application-architect]
owner: application-architect
source_type: book
sources:
  - uri: Building Microservices, 2nd ed. (Sam Newman)
    version: 2nd edition
    locator: Ch.2 How to Model Microservices / Ch.3 Splitting the Monolith / Ch.4 Communication / Ch.6 Data
  - uri: https://martinfowler.com/articles/microservices.html
    version: 2014-03-25
    locator: Organized around Business Capabilities / Decentralized Data Management
last_verified: 2026-08-11
verified_by: Vulpora maintainers
review_after: 2026-11-11
status: verified
evals: [application-architect.multi-module-boundary-review.v1]
revalidate_on: [new-edition, eval-failure, incident]
---

# 마이크로서비스 경계와 데이터 소유권

## 리뷰 훅

- [ ] service가 business capability/bounded context에 맞고 기술 layer로 분할되지 않았는가.
- [ ] 각 쓰기 데이터와 invariant의 단일 소유 service가 식별되는가.
- [ ] 다른 service가 소유 DB/schema/table을 직접 읽거나 쓰지 않는가.
- [ ] 공유 domain library가 내부 모델을 lockstep으로 전파하지 않는가.
- [ ] 한 business 변경이 여러 service의 동시 배포를 반복적으로 요구하지 않는가.
- [ ] 독립 scaling/deployment/failure isolation의 구체적 필요가 분산 비용을 정당화하는가.

## 경계와 소유권

서비스는 business capability를 구현하고 내부 구현과 데이터를 감춘다. bounded context는 같은 용어와
모델이 일관되는 범위를 찾는 모델링 도구이며, service와 항상 1:1일 필요는 없지만 경계 후보의 강한 근거다.
서비스 경계를 넘는 것은 내부 entity가 아니라 명시적 API/event contract여야 한다.

데이터 소유권은 서버 주소보다 강한 경계 검증 수단이다. 둘 이상의 service가 같은 table을 갱신하면 schema
변경과 invariant 책임이 공유되고 독립 배포가 깨진다. read 중복이나 materialized view는 허용 가능하지만
원본 write owner, freshness, rebuild와 failure semantics를 명시해야 한다.

## 분산 모놀리스 신호

- 공유 DB/table 다중 writer
- 긴 필수 동기 호출 사슬과 전체 성공만 허용하는 transaction
- 모든 service가 공유 entity/package version에 함께 맞춰 배포
- 작은 contract 변경도 coordinated release 필요
- 장애가 독립 격리되지 않고 전체 요청을 실패시킴

하나의 신호만으로 CRITICAL을 단정하지 않는다. 정상 경로와 release/incident evidence로 실제 결합을 확인한다.

## 비례성

독립 배포·조직 자율성·격리 scaling이 약하면 modular monolith가 더 안전할 수 있다. MSA 권고에는 network,
observability, deployment automation, security surface, eventual consistency 비용을 반드시 함께 기록한다.
