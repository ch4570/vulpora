---
title: Abuse case와 resource/business control
source: https://cheatsheetseries.owasp.org/cheatsheets/Abuse_Case_Cheat_Sheet.html
last_fetched: 2026-08-11
consumers: [security-auditor]
owner: security-auditor
source_type: official
last_verified: 2026-08-11
status: verified
evals: [security-auditor.safe-backend-no-fabrication.v1]
revalidate_on: [source-version-change, workflow-change, quota-change, incident, eval-failure]
---

## 리뷰 훅 — 유효한 요청으로 시스템을 악용하는가

- [ ] actor별 자산과 허용 workflow를 그리고 공격자가 얻는 가치·비용 비대칭을 적는다.
- [ ] create/search/export/upload/webhook/password-reset 등 반복 가능한 expensive action을 찾는다.
- [ ] replay/idempotency, out-of-order transition, duplicate consumption과 race가 authorization/business invariant를 우회하는지 본다.
- [ ] username/object id/token의 enumeration과 response/status/timing 차이를 확인한다.
- [ ] per-identity/tenant/IP/resource quota와 burst, concurrency, timeout, payload/response size를 함께 본다.
- [ ] client-side button/순서/limit이 server-side control로 오인되지 않는지 확인한다.
- [ ] rate limit 실패·분산 환경·queue backlog·retry storm이 fail-open 또는 비용 증폭을 만들지 본다.
- [ ] detection event, correlation, owner와 safe response가 있으며 민감정보를 기록하지 않는지 본다.

## Abuse case 작성법

OWASP Abuse Case Cheat Sheet는 현재 historical로 표시된 입문 자료이므로 유일한 현대적 threat-modeling
표준으로 취급하지 않는다. 다만 positive use case의 actor·action·asset을 뒤집어 misuse와 security requirement를
명시하는 방법은 bounded review prompt로 사용한다. 단순히 “rate
limit 필요”라고 쓰지 않고 다음 형태로 증명한다.

```text
actor + available capability
  → valid or nearly-valid repeated/ordered action
  → missing authorization/idempotency/quota/invariant
  → victim asset, cost, integrity or availability impact
```

예: authenticated actor가 대량 export를 요청할 수 있다는 사실만으로 finding은 아니다. 실제 비용, 동시성,
existing queue/backpressure/quota, tenant isolation, operational requirement를 확인한다. traffic/data가 없으면 capacity
threshold를 발명하지 않고 owner가 정할 measurement와 test를 제시한다.

## Control 선택과 trade-off

- **Authorization/invariant**: 허용되지 않은 행위·순서 자체를 차단한다.
- **Idempotency/replay defense**: retry와 공격을 구분할 stable key, scope, retention과 atomicity를 검토한다.
- **Quota/rate/concurrency**: actor·tenant·resource에 맞는 key와 burst 정책, distributed enforcement 실패를 본다.
- **Resource bounds**: request/item/depth, execution time, response, retry와 queue backlog를 제한한다.
- **Detection/response**: actor/action/outcome/correlation을 남기되 credential/PII는 최소화한다.

control은 사용성, recovery, shared NAT, batch client와 availability trade-off가 있다. 임의 숫자 대신 자산 가치,
정상 분포와 recovery objective에서 threshold를 정하도록 handoff한다.

## 심각도와 최소 검증

구체적 정상 기능 경로와 영향이 없으면 LOW-confidence hypothesis다. availability concern을 CRITICAL/BLOCK으로 올리려면
production-equivalent capacity/limit evidence와 광범위 영향, 보상 통제 부재가 모두 필요하다.

- replay/duplicate/out-of-order integration test와 atomic idempotency 검증.
- quota key별 normal/burst/over-limit/recovery test, distributed failure path의 fail behavior 확인.
- enumeration response와 security event가 민감값 없이 일관되는지 검증.

## 근거 locator

- OWASP Abuse Case Cheat Sheet (historical): abuse-case definition and threat-oriented requirements.
- OWASP Secure by Design Framework: https://owasp.org/www-project-secure-by-design-framework/
- OWASP Denial of Service Cheat Sheet:
  https://cheatsheetseries.owasp.org/cheatsheets/Denial_of_Service_Cheat_Sheet.html
- OWASP Credential Stuffing Prevention Cheat Sheet:
  https://cheatsheetseries.owasp.org/cheatsheets/Credential_Stuffing_Prevention_Cheat_Sheet.html
