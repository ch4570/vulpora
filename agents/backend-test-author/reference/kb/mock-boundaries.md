---
title: 테스트 더블과 제한적 Mock 경계
source: https://martinfowler.com/articles/mocksArentStubs.html
last_fetched: 2026-08-11
consumers: [backend-test-author]
---

# 제한적인 Mock 사용

Test double은 역할과 검증 방식이 다르다. Mock은 behavior verification에 유용하지만 협력자의 우연한
호출 순서까지 고정하면 구조 변경에 취약해진다. 이 agent의 정책은 **실제 객체 우선, mock은 제어할 수
없는 외부 서비스 경계만**이다.

## 선택 순서

1. 값 객체·domain service·application collaborator는 실제 구현을 조합한다.
2. 상태 저장이 필요한 가벼운 port는 contract를 온전히 구현하는 in-memory fake를 고려한다.
3. 시간·난수는 `Clock`, seeded random처럼 결정적인 구현을 주입한다. 이를 mock interaction으로 검증하지 않는다.
4. 제3자 결제, 메일, SMS, SaaS처럼 실제 호출이 위험하거나 제어 불가능한 경계만 mock/stub server로 대체한다.
5. DB, OpenSearch/Elasticsearch, Redis는 mock/fake/embedded 유사품으로 대체하지 않는다.

## Mock ledger

각 mock은 보고서에 다음을 남긴다.

| 대체 경계 | 불가피한 이유 | 고정한 요청/응답 contract | 실제 검증이 남은 범위 |
|---|---|---|---|

호출 횟수는 idempotency나 at-most-once 같은 계약일 때만 단언한다. 단지 현재 구현이 한 번 호출한다는 이유로
검증하지 않는다.

## 리뷰 훅

- [ ] mock 대상이 정말 조직 밖의 제어 불가능한 서비스인가.
- [ ] 내부 class, repository, DB client, OpenSearch client, Redis client를 mock하지 않았는가.
- [ ] 실제 객체나 결정적 fake로 더 간단하고 견고하게 검증할 수 없는가.
- [ ] mock interaction이 public contract가 아닌 구현 순서를 고정하지 않는가.
- [ ] 모든 mock이 ledger에 있고 남은 실제 contract 검증이 드러나는가.
