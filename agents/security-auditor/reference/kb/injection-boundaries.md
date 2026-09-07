---
title: Injection과 interpreter boundary
source: https://cheatsheetseries.owasp.org/cheatsheets/Injection_Prevention_Cheat_Sheet.html
last_fetched: 2026-08-11
consumers: [security-auditor]
owner: security-auditor
source_type: official
last_verified: 2026-08-11
status: verified
evals: [security-auditor.vulnerable-backend-review.v1]
revalidate_on: [source-version-change, interpreter-change, query-builder-change, eval-failure]
---

## 리뷰 훅 — data가 syntax가 되는 지점

- [ ] HTTP/message/file/stored input부터 SQL/NoSQL/OS/template/LDAP/header expression sink까지 추적한다.
- [ ] string concatenation/interpolation 전에 validation이 있어도 parameterization 가능한 sink인지 먼저 확인한다.
- [ ] query value뿐 아니라 table/column/order/operator 같은 identifier 선택을 allowlist하는지 본다.
- [ ] shell invocation은 structured process API와 고정 executable/argument boundary를 사용하는지 확인한다.
- [ ] template·HTML·header는 output context에 맞는 encoding과 unsafe escape hatch 사용을 본다.
- [ ] database/service account의 least privilege가 injection impact를 제한하는지 확인한다.
- [ ] stored input이 이후 다른 interpreter에서 실행되는 second-order injection을 포함한다.
- [ ] 오류 응답·log에 query, credential, stack trace와 공격자 제어 개행이 노출되는지 본다.

## 검토 규칙

Injection은 “나쁜 문자”가 아니라 **untrusted data가 interpreter syntax 또는 capability를 선택하는 것**이다.
기본 방어는 parameterized interface와 안전한 structured API다. identifier처럼 parameter binding이 되지 않는
요소는 고정 mapping/allowlist로 capability를 제한한다. escaping은 interpreter와 context가 정확히 일치할 때만
보조 control이며 일반 문자열 치환이나 denylist는 독립 방어로 인정하지 않는다.

```text
untrusted source
  → decode/normalize/validation
  → structured builder or unsafe string construction
  → interpreter sink
  → executing identity and reachable asset
```

## 위험과 반증

- 문자열 결합이 있어도 결합 대상이 compile-time constant이고 untrusted 값은 bind parameter라면 injection이 아니다.
- ORM/query DSL도 raw expression/native query escape hatch에 untrusted data가 들어가면 안전하지 않다.
- validation은 business constraint와 allowlist에 유용하지만 parameterization을 대체하지 않는다.
- sink가 test-only/dead code이거나 caller가 attacker-controlled source에서 도달하지 않으면 reachability를 낮춘다.

HIGH 이상은 attacker-controlled value가 unsafe interpreter sink까지 도달하고 중간 control이 없음을 보여야 한다.
CRITICAL/BLOCK은 정상 배포 경로의 RCE, 인증 우회 또는 광범위 민감정보 영향과 실행 권한까지 확정돼야 한다.

## 최소 검증

- malicious 문자열 자체보다 정상·경계·metacharacter 입력이 **data로 처리됨**을 확인하는 repository/integration test.
- 동적 identifier는 허용 목록 밖 값을 reject하고 허용 값만 고정 mapping으로 변환하는 test.
- 실행 identity가 필요한 최소 table/command/capability만 갖는 configuration verification.

## 근거 locator

- OWASP Injection Prevention Cheat Sheet: parameterized interfaces and contextual defenses.
- OWASP SQL Injection Prevention Cheat Sheet:
  https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html
- OWASP OS Command Injection Defense Cheat Sheet:
  https://cheatsheetseries.owasp.org/cheatsheets/OS_Command_Injection_Defense_Cheat_Sheet.html
