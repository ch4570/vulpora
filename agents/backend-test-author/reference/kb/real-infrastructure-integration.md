---
title: 실제 인프라 통합 테스트의 격리와 수명주기
source: https://java.testcontainers.org/
last_fetched: 2026-08-11
consumers: [backend-test-author]
---

# 실제 인프라 통합 테스트

Testcontainers는 테스트에서 실제 service를 disposable container로 실행해 production과 같은 protocol을
검증하는 방식을 제공한다. 기존 프로젝트가 지원하면 이를 우선하고, 그렇지 않으면 test 전용임이 명확한
격리된 local stack만 사용한다.

## 구성 요소별 검증 대상

| 구성 요소 | 실제로 검증할 것 |
|---|---|
| PostgreSQL 등 DB | dialect, DDL/constraint, transaction, isolation, query와 ORM mapping |
| OpenSearch/Elasticsearch | mapping/analyzer, Query DSL, serialization, refresh와 search visibility |
| Redis | serializer, key/TTL, atomic command, transaction/script 동작 |

단순 in-memory DB, map fake, client mock은 이 protocol 의미를 증명하지 못한다.

## 안전 계약

- image tag와 engine compatibility를 고정하고, readiness probe와 유한 startup/test timeout을 둔다.
- endpoint가 localhost/ephemeral container이고 test 전용임을 config로 확인한다. 불명확하면 fail closed한다.
- run 고유 schema/index/key prefix를 사용하고 합성 데이터만 넣는다.
- 자신이 만든 row/index/key/container만 정리한다. adopted process, shared volume, 전체 database flush는 금지한다.
- OpenSearch/Elasticsearch는 write 후 refresh를 명시적으로 제어하거나 유한 polling으로 가시성을 기다린다.
- Redis TTL은 과도한 실제 sleep 대신 유한 범위와 polling 또는 controllable clock이 제공되는 상위 abstraction을 사용한다.
- container/runtime이 없으면 해당 scenario는 `BLOCKED` 또는 `NOT_RUN`이다. mock 테스트로 격하하지 않는다.

## 리뷰 훅

- [ ] DB/OpenSearch/Redis가 실제 engine과 protocol을 사용하는가.
- [ ] image/version, endpoint, namespace와 readiness 조건이 재현 가능한가.
- [ ] 운영·공유 endpoint가 아님을 검증했는가.
- [ ] cleanup target이 이 run이 만든 resource로 제한되는가.
- [ ] 비동기 visibility에 무한 sleep/polling이 없는가.
- [ ] 환경 부재를 mock으로 숨기지 않고 올바른 상태로 보고했는가.
