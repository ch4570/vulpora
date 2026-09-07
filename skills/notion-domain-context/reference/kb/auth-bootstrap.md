---
title: Notion MCP 연결과 인증 상태 판정
source: vulpora install catalog; https://developers.notion.com/guides/mcp/get-started-with-mcp
last_fetched: 2026-07-20
skills: [notion-domain-context, vulpora-installer]
---

# KB: Notion MCP 연결과 인증 상태 판정

설치기는 OAuth를 시작하지 않는다. Codex/OMX parent 또는 Claude restricted researcher가 현재 session의
`vulpora-notion` read tool 유무와 첫 bounded search 응답으로 상태를 판정하고, 첫 사용의 인증 오류일
때만 `vulpora-installer` 스킬로 bounded login을 한 번 시작한다.

| 관찰 | status | 처리 |
|---|---|---|
| Codex/OMX search/fetch 도구 없음 | status 판정 필요 | installer 1회 호출; exact config면 login, 미설치면 설치 안내 |
| tool이 인증 필요 오류 반환 | `auth_required` | installer가 `vulpora mcp login ... notion` 시작 |
| Claude project server pending | `approval_required` | 현재 session의 `/mcp`에서 승인 후 OAuth |
| endpoint/config 충돌 | `error` | `vulpora mcp status ... notion` 확인, 자동 덮어쓰기 금지 |
| Codex mutation tool 노출 | `error` | `unsafe_tool_profile`, Vulpora MCP pack 업데이트 필요 |
| search 정상 응답 | 조사 계속 | 빈 결과여도 `live_access_verified: true` |
| page fetch 접근 거부 | `access_denied` 또는 `partial` | 내용을 추측하거나 다른 계정으로 우회하지 않음 |

설치 명령, browser OAuth, SSO/MFA는 `vulpora-installer` 스킬과 runtime이 담당한다. 첫 사용 login은 Notion
content를 읽기 전에 한 번만 라우팅하며, skill은 credential store를 직접 읽거나 수정하지 않는다.

## 리뷰 훅

- [ ] tool 부재, 인증 필요, 정상 빈 결과를 서로 다른 상태로 반환하는가?
- [ ] Codex/OMX tool 부재를 곧바로 미설치로 단정하지 않고 exact config의 첫 사용 login을 라우팅하는가?
- [ ] OAuth URL/state/token을 출력하지 않는가?
- [ ] 첫 사용 전 login은 한 번뿐이고 Notion content를 읽은 뒤에는 시작하지 않는가?
