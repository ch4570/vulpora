---
title: Secret·암호화·민감정보 로깅
source: https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html
last_fetched: 2026-08-11
consumers: [security-auditor]
owner: security-auditor
source_type: official
last_verified: 2026-08-11
status: verified
evals: [security-auditor.repository-instruction-injection.v1]
revalidate_on: [source-version-change, credential-change, crypto-change, logging-change, eval-failure]
---

## 리뷰 훅 — 값이 아니라 lifecycle과 노출 경로

- [ ] source, default config, test fixture, image/build artifact와 generated file의 credential/key material을 찾되 값을 출력하지 않는다.
- [ ] secret manager/injected runtime identity, 최소 scope, rotation/revocation, owner와 expiry 경로를 확인한다.
- [ ] token/key가 의도한 audience·purpose에만 쓰이고 service 간 그대로 전달되지 않는지 본다.
- [ ] password에는 현재 권고되는 password hashing library와 per-password salt/work factor가 적용되는지 본다.
- [ ] encryption/signature의 목적, vetted library/algorithm/mode, key storage/separation, nonce/IV uniqueness와 CSPRNG를 확인한다.
- [ ] TLS hostname/certificate validation이 disable되지 않았고 failure가 fail-closed인지 본다.
- [ ] request/response/header/query, auth failure, exception, outbound client와 audit logger가 token/cookie/key/password/PII를 남기는지 본다.
- [ ] 공격자 제어 개행/구분자로 log event가 위조되지 않고, security event의 actor/action/outcome/correlation이 남는지 확인한다.

## Secret lifecycle

hard-coded secret은 repository 복제, build cache, image, log와 backup으로 확산될 수 있다. 발견 시 값이나 일부를
재현하지 말고 `path:line`, secret class와 exposure surface만 기록한다. 유효성 확인을 위한 network/vault 접근은
금지한다. repository에서 삭제하는 것만으로 회수되지 않으므로 최소 권한 credential 교체/revoke와 history/artifact
영향 확인을 owner에게 handoff한다.

example/placeholder 값인지 확정할 수 없거나 runtime override가 있을 수 있으면 confidence를 낮춘다. random-looking
문자열이나 변수명만으로 HIGH/BLOCK을 만들지 않는다.

## Crypto

암호화는 primitive 하나가 아니라 protocol이다. 보호 목표(confidentiality/integrity/password verification), key
lifecycle, randomness, nonce/IV, authentication tag/signature verification과 failure handling을 함께 추적한다. custom
cipher, static nonce/IV, non-cryptographic RNG, TLS trust-all과 verification result 무시는 위험 신호다. framework/version의
secure default는 적용 version 공식 문서나 config로 교차 검증한다.

## Logging

OWASP Logging Cheat Sheet는 security-relevant event 기록과 함께 encryption key, access token, password 등 primary
secret의 직접 기록을 피하도록 안내한다. 민감 data는 allowlisted field 중심으로 최소화·mask/tokenize하고 access를
제한한다. 로그가 없다는 사실과 민감 로그를 늘리는 처방 사이에서 actor/action/outcome/correlation 중심 event를 제안한다.

## 심각도와 최소 검증

- active production secret인지 확인하지 않은 code string은 최대 `확인 필요`이며 rotate/revoke handoff를 남긴다.
- secret/PII가 정상 request path에서 log sink로 도달하거나 TLS/crypto verification이 실제로 꺼지는 흐름은 영향에 따라 평가한다.
- log capture test로 민감값 부재와 security event 존재를 함께 확인하고, crypto는 known-answer/vendor test와 negative
  verification failure test를 제시한다. secret 원문을 fixture나 보고서에 복사하지 않는다.

## 근거 locator

- OWASP Secrets Management Cheat Sheet: lifecycle, access control, rotation and auditing.
- OWASP Cryptographic Storage Cheat Sheet:
  https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html
- OWASP Password Storage Cheat Sheet:
  https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- OWASP Logging Cheat Sheet:
  https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
