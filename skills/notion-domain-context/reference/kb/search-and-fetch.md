---
title: Notion bounded search와 fetch 계약
source: https://developers.notion.com/guides/mcp/mcp-supported-tools
last_fetched: 2026-07-20
skills: [notion-domain-context, notion-domain-researcher]
---

# KB: Search → fetch → Evidence Packet

## 절차

1. 질문을 한 문장과 검색어 3~8개로 좁힌다.
2. Codex/OMX parent 또는 Claude restricted researcher가 `vulpora-notion` search를 최대 3회 호출한다.
3. 후보의 목적, status, freshness를 보고 최대 8개만 fetch/read한다.
4. source metadata와 section locator를 기록한다.
5. source가 연결된 claim만 Evidence Packet에 넣는다.

Search snippet만으로 claim을 확정하지 않는다. fetch하지 못한 후보는 unknown이나 access denied로 남긴다.
정상 search가 빈 결과를 반환했을 때만 `no_evidence`를 사용한다.

Codex/OMX에서는 selected-scope MCP config의 server-level `enabled_tools`가 parent에서 mutation 도구를
제외한다. Claude에서는 agent의 exact `tools` 목록이 같은 경계를 만든다. Codex/OpenAI client가 tool prefix를
생략하는 경우를 위해 `search`, `fetch` 별칭도 read-only allowlist에 포함한다.

## Authority

- runtime behavior: 현재 code/test/schema > Notion 문서
- policy/domain intent: approved/current Notion > unknown > draft/deprecated
- 충돌을 해결할 수 없으면 숨기지 말고 `conflicts`에 남긴다.

## 최소 source record

- page ID와 URL
- title과 section locator
- status와 owner(표시되는 경우)
- last edited time(표시되는 경우)
- retrieval time

## 리뷰 훅

- [ ] search 결과를 fetch 없이 fact로 승격하지 않았는가?
- [ ] 모든 claim의 source reference가 실제 source record를 가리키는가?
- [ ] stale/draft/deprecated 문서를 확정 정책처럼 쓰지 않았는가?
- [ ] raw page 전체 대신 질문에 필요한 최소 요약만 반환하는가?
