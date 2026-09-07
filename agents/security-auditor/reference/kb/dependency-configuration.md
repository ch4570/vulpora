---
title: Dependency·공급망·보안 설정
source: https://csrc.nist.gov/pubs/sp/800/218/final
last_fetched: 2026-08-11
consumers: [security-auditor]
owner: security-auditor
source_type: standard
last_verified: 2026-08-11
status: verified
evals: [security-auditor.safe-backend-no-fabrication.v1]
revalidate_on: [standard-version-change, dependency-change, build-change, deployment-change, eval-failure]
---

## 리뷰 훅 — artifact부터 deployment override까지

- [ ] manifest뿐 아니라 lockfile/resolution report/SBOM에서 실제 artifact version과 source를 구분한다.
- [ ] scanner/advisory의 package, version range, platform, feature, reachable API와 runtime exposure가 적용되는지 본다.
- [ ] build plugin/script, repository, checksum/signature/provenance, generated artifact와 CI credential scope를 확인한다.
- [ ] unpinned tag/range, abandoned component, duplicate/transitive version과 update/response ownership을 본다.
- [ ] debug/error detail, management endpoint, sample/default credential, CORS/CSRF, TLS와 proxy trust 설정을 확인한다.
- [ ] environment/profile override가 secure default를 뒤집는지, missing variable이 insecure fallback으로 가는지 본다.
- [ ] application, DB, broker, object storage, container/service account의 최소 privilege와 network exposure를 본다.
- [ ] backup, migration, batch, health/metrics endpoint와 test-only route가 production package에 포함되는지 확인한다.

## Dependency applicability

NIST SSDF는 security requirement·risk/design decision 추적, release component provenance와 개발 환경 보호를
secure software development practice에 포함한다. dependency review는 단순 “오래됨” 판정이 아니라 실제 resolved
artifact, advisory 범위, 취약 기능 사용과 attacker reachability를 연결한다.

```text
declared dependency
  → resolved artifact/version/provenance
  → vulnerable feature/API and configuration
  → reachable application path
  → concrete impact and available remediation
```

CVE/scanner result만 있고 lock/runtime/reachability를 모르면 `확인 필요`다. 반대로 exploit이 알려졌다는 사실은
방치 근거가 아니므로 안전한 범위에서 vendor advisory와 fixed version 확인을 후속 검증으로 요청한다. 이 read-only
agent는 network audit이나 upgrade를 실행하지 않는다.

## Configuration

configuration은 source와 같은 실행 경로다. base config만 보지 말고 profile, environment binding, container/IaC,
gateway와 deployment override를 가능한 범위에서 추적한다. absence of evidence는 disabled의 증거가 아니다. config가
배포 시스템 밖에 있어 읽지 못하면 `unknown`으로 남긴다.

insecure fallback, wildcard origin with credentials, exposed management interface, verbose production error, excessive
service identity permission은 구체적 exposure와 asset을 연결해 평가한다. framework default는 적용 version 공식 문서와
effective config 없이는 확정하지 않는다.

## 최소 검증

- offline resolved dependency/SBOM과 vendor advisory applicability 대조, affected API reachability 확인.
- production-equivalent profile의 effective configuration snapshot을 secret-redacted 상태로 검증.
- default/missing-variable/error path가 fail closed인지, admin/management endpoint가 network+auth 두 경계로 제한되는지 test.

## 근거 locator

- NIST SP 800-218 SSDF 1.1: PO (Prepare the Organization), PS (Protect the Software), PW (Produce Well-Secured Software), RV (Respond to Vulnerabilities).
- OWASP Vulnerable Dependency Management Cheat Sheet:
  https://cheatsheetseries.owasp.org/cheatsheets/Vulnerable_Dependency_Management_Cheat_Sheet.html
- OWASP Software Supply Chain Security Cheat Sheet:
  https://cheatsheetseries.owasp.org/cheatsheets/Software_Supply_Chain_Security_Cheat_Sheet.html
