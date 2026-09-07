---
title: Provenance가 완결된 Evidence Packet
source: https://www.w3.org/TR/prov-overview/
last_fetched: 2026-07-14
consumers: [notion-domain-researcher]
---

# KB: Provenance가 완결된 Evidence Packet

## 리뷰 훅

- [ ] 모든 fact가 존재하는 `source_refs`를 하나 이상 가리키는가.
- [ ] source에 page ID/URL/title/section/retrieved_at이 있는가.
- [ ] owner/status/last edited를 모르면 `unknown`으로 명시했는가.
- [ ] confidence가 evidence quality와 conflict를 반영하는가.
- [ ] 원문 전체와 identity/credential/불필요한 PII를 제외했는가.
- [ ] `safety.live_access_verified`가 첫 search의 실제 정상 응답과 일치하는가.
- [ ] 제외하거나 마스킹한 항목을 `safety.redactions`에 기록했는가.

## 최소 schema

`facts`는 decision-ready claim, `sources`는 claim을 재확인할 provenance record, `conflicts`는 양립하지 않는
evidence, `unknowns`는 검색으로 해소하지 못한 질문, `safety`는 live access·격리·redaction 결과다.

기본 전송 형식은 canonical agent에 정의된 YAML mapping이다. `source_refs`는 비어 있지 않고 중복이 없어야
하며 실제 `sources[].id`를 가리켜야 한다. 현재 별도 runner나 schema post-validator는 없으므로 researcher가
반환 전에 dangling reference, search/fetch budget, 필수 provenance를 직접 점검한다. behavioral fixture는 이
계약의 회귀를 검증하지만 live model output을 사후 강제한다고 주장하지 않는다.

Source record는 entity(page), activity(retrieval), agent(owner/author when visible)의 관계를 재구성할 수 있을
정도로 page locator와 retrieval time을 남긴다. source가 완전하지 않으면 fact가 아니라 unknown/evidence-only다.

## Confidence

- `high`: approved/current, 직접 관련 section, 완전한 provenance, material conflict 없음.
- `medium`: authority/freshness 일부 unknown 또는 간접 근거.
- `low`: draft/stale/conflict가 있어 참고만 가능. 기본적으로 `facts`보다 conflict/unknown에 둔다.
