---
title: Notion agent, skill, hosted MCP 설치 경계
source: vulpora, install/manifest.txt, install/mcp-packs.txt
last_fetched: 2026-07-20
skills: [notion-domain-context, notion-domain-researcher, vulpora-installer]
---

# KB: 설치와 실행 경계

Vulpora은 세 자산을 독립적으로 관리한다.

| 자산 | 역할 |
|---|---|
| `notion-domain-researcher` agent | Claude exact-agent 경로와 optional Codex specialist |
| `notion-domain-context` skill | runtime별 안전 경로를 선택하고 packet을 검증하는 workflow |
| `notion` MCP pack | 공식 endpoint/OAuth 등록과 Codex server-level read allowlist |

agent나 skill 파일만 설치하면 MCP tool이 생기지 않는다. Notion MCP 설치는 config까지만 만들고
`auth_deferred`로 끝난다. 첫 Notion 호출이 approval/auth 상태를 확인해 login을 시작하며, 완료 후 실행 중인
Codex 또는 Claude Code를 완전히 종료하고 새 session을 시작해야 한다.

사람이 설치할 때는 Vulpora 대화형 메뉴에서 `전체 카탈로그` 또는 `MCP만`을 선택한다. 자동화에서는
`vulpora mcp install/status ... notion`을 사용한다. research skill은 첫 사용의 tool 부재 또는 auth
오류에서 installer를 한 번 호출해 `mcp login` 또는 Claude `/mcp`로 넘기지만 credential을 직접 처리하지
않는다. Codex/OMX는 설치기가 제한한 parent MCP를 직접 사용하고, Claude Code는 설치된 named researcher를
통해서만 조사한다.

## 리뷰 훅

- [ ] agent, skill, MCP를 서로 다른 설치 상태로 판정하는가?
- [ ] MCP 설치는 auth_deferred이고 첫 사용 인증 후 runtime 재시작을 안내하는가?
- [ ] research 요청과 설치/OAuth 요청을 올바른 skill로 라우팅하는가?
