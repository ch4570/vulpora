---
title: SSRF·역직렬화·file/path 경계
source: https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html
last_fetched: 2026-08-11
consumers: [security-auditor]
owner: security-auditor
source_type: official
last_verified: 2026-08-11
status: verified
evals: [security-auditor.vulnerable-backend-review.v1]
revalidate_on: [source-version-change, outbound-network-change, serializer-change, file-processing-change, eval-failure]
---

## 리뷰 훅 — 외부 값이 destination·type·path를 선택하는가

- [ ] URL/host/scheme/port/path, redirect와 DNS resolution 각 단계의 attacker control을 추적한다.
- [ ] 허용 destination이 고정 가능한지, network egress가 private/link-local/metadata target을 차단하는지 본다.
- [ ] redirect 재검증, DNS rebinding/재해석, proxy 환경과 timeout/response-size limit을 확인한다.
- [ ] native object deserialization, polymorphic type metadata, class/type allowlist와 gadget-capable library를 찾는다.
- [ ] schema-based data format에서도 trusted field clobbering과 depth/item/size limit을 확인한다.
- [ ] upload의 extension/type/name/size/authorization, webroot 분리와 execute permission을 본다.
- [ ] decode 후 canonical path가 고정 root 안에 남는지, absolute path, `..`, symlink와 race를 확인한다.
- [ ] archive extraction에서 각 entry의 canonical destination, link, decompressed-size/item-count를 제한하는지 본다.
- [ ] download/delete도 opaque server id와 object-level authorization을 적용하는지 본다.

## SSRF

SSRF는 HTTP에 한정되지 않는다. user-controlled URL이 server의 network capability로 HTTP, file, gopher 등
다른 scheme이나 internal service에 접근하게 할 수 있다. business가 정해진 peer만 요구하면 scheme/host/port를
고정 allowlist하고 network layer egress로 보강한다. arbitrary external URL이 필수라면 parse 후 destination IP,
redirect의 매 hop, DNS 변화, private/link-local/loopback/metadata 범위를 다루며 response와 time budget을 제한한다.

URL 문자열 prefix/regex 하나만으로는 canonicalization, userinfo, alternate IP notation, redirect, DNS 재해석을
포괄하지 못한다. 반대로 URL이 code/config의 고정 상수이고 user input은 request body data에만 들어가면 SSRF가 아니다.

## 역직렬화

untrusted native object graph 또는 입력이 runtime type을 선택하는 polymorphic deserialization은 gadget execution,
trusted field overwrite, resource exhaustion의 경계다. 가능한 경우 단순 schema-based data와 explicit DTO를 사용하고,
필드/type allowlist, size/depth/count limit, post-deserialization invariant validation을 적용한다. “JSON”이라는 format
이름만으로 안전하다고 하지 않는다. type metadata와 unsafe library configuration을 함께 본다.

## File/path

원본 filename과 MIME header는 비신뢰 입력이다. application-generated storage id, business-required type allowlist,
content/size validation, webroot 밖 저장과 download handler authorization을 조합한다. path operation은 decode/normalize
뒤 canonical destination이 승인된 root 아래인지 검증해야 한다. archive entry, symlink, overwrite와 decompression bomb도
별도 경로다.

## 심각도와 최소 검증

- HIGH 이상은 attacker control이 실제 outbound client/deserializer/filesystem sink에 도달하고 control 부재가 확인돼야 한다.
- BLOCK은 metadata/internal privileged access, RCE 또는 광범위 file compromise가 정상 배포 전제로 확정된
  `[CRITICAL][확정]`에만 허용한다.
- redirect/DNS/private range와 timeout/size를 검증하는 fake-network integration test, disallowed type/oversize payload
  rejection test, traversal/symlink/archive escape가 root 밖에 쓰지 못하는 temp-filesystem test를 제시한다.

## 근거 locator

- OWASP SSRF Prevention Cheat Sheet: cases, allowlist and network-layer controls.
- OWASP Deserialization Cheat Sheet:
  https://cheatsheetseries.owasp.org/cheatsheets/Deserialization_Cheat_Sheet.html
- OWASP File Upload Cheat Sheet:
  https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
- OWASP Path Traversal: https://owasp.org/www-community/attacks/Path_Traversal
