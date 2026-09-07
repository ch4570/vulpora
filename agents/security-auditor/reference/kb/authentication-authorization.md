---
title: 인증·인가와 권한 경계
source: https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
last_fetched: 2026-08-11
consumers: [security-auditor]
owner: security-auditor
source_type: official
last_verified: 2026-08-11
status: verified
evals: [security-auditor.vulnerable-backend-review.v1]
revalidate_on: [source-version-change, authentication-change, authorization-change, eval-failure]
---

## 리뷰 훅 — identity부터 privileged sink까지

- [ ] anonymous, user, service, admin actor와 credential/token/session 발급·검증·폐기 경로를 구분한다.
- [ ] authentication 성공과 function/object/tenant authorization을 별도 control로 추적한다.
- [ ] deny-by-default이며 모든 request/message/job 경로가 같은 server-side enforcement를 통과하는지 본다.
- [ ] route의 object id를 현재 principal의 ownership/tenant membership과 대조하는지 확인한다.
- [ ] admin·support·service account가 user-controlled target에 대해 confused deputy가 되지 않는지 본다.
- [ ] logout/revocation/password reset/role change 뒤 기존 session·token의 유효 기간과 처리를 확인한다.
- [ ] 실패, timeout, policy service 오류와 cache miss가 allow로 전환되지 않는지 본다.
- [ ] login·reset·lookup의 enumeration, brute force, replay, rate control과 audit event를 확인한다.

## 검토 규칙

인증은 “누구인가”, 인가는 “이 identity가 이 resource에 이 action을 할 수 있는가”다. controller annotation이나
gateway rule은 endpoint 진입 control일 수 있지만, user-supplied object id에 대한 ownership을 대신하지 않는다.
OWASP Authorization Cheat Sheet는 least privilege, deny by default, every-request validation과 authorization
logic test를 핵심 방어로 둔다.

권한 finding은 다음 chain으로 작성한다.

```text
principal/session evidence
  → requested function + object/tenant identifier
  → policy/ownership lookup and decision
  → privileged read/write/delete/admin sink
```

policy가 코드 밖 gateway/IAM에 있다는 주장만 있고 해당 배포 config를 읽지 못하면 control은 `unknown`이다.
반대로 central filter/interceptor가 모든 대상 route를 실제 포괄함이 config와 test로 확인되면 controller-local
check 부재를 취약점으로 만들지 않는다.

## 위험과 반증

- **Object-level authorization**: 인증된 사용자가 다른 사용자의 id를 선택할 수 있고 ownership 확인 없이
  data access sink에 도달하는지 추적한다.
- **Function-level authorization**: role/permission이 privileged action 전에 server-side에서 검증되는지 본다.
- **Tenant isolation**: tenant id를 request에서 그대로 신뢰하지 않고 principal membership과 결합하는지 본다.
- **Session/token**: signature만이 아니라 issuer, audience, lifetime, purpose와 revocation 요구를 확인한다.
- **Mass assignment**: input DTO가 role, owner, approval state 같은 trusted field를 덮을 수 있는지 본다.

HIGH 이상은 구체적인 privileged sink와 빠진 control이 확인돼야 한다. middleware가 보이지 않는다는 사실만으로는
MEDIUM/low-confidence 상한이다. BLOCK은 cross-tenant/admin takeover 같은 CRITICAL impact가 정상 배포 경로에서
확정되고 보상 통제가 없을 때만 가능하다.

## 최소 검증

- 같은 권한의 own-object 요청은 성공하고 다른 principal/tenant object는 일관되게 거절되는 integration test.
- anonymous, expired/revoked token, role downgrade, policy timeout/failure의 fail-closed test.
- privileged action의 positive/negative matrix와 audit event의 민감값 redaction 검증.

## 근거 locator

- OWASP Authorization Cheat Sheet: Enforce Least Privileges; Deny by Default; Validate Permissions on Every Request.
- OWASP Authentication Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- NIST SP 800-63B: authenticator lifecycle, session and authentication assurance guidance.
