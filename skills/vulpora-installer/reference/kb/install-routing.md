---
title: Vulpora 자연어 설치 라우팅과 catalog 실행 계약
source: vulpora, install/manifest.txt, install/mcp-packs.txt, INSTALL.md
last_fetched: 2026-07-20
skills: [vulpora-installer]
---

# KB: 자연어 설치 라우팅과 catalog 실행 계약

## 의도 분류

| 요청 | 실행 의미 |
|---|---|
| “Vulpora 설치해줘” | checkout/PATH/npx launcher로 explicit 설치 실행 |
| “에이전트와 스킬 전부 설치해줘” | 대화형 기본값 또는 `all-agents all-skills` |
| “`test-authoring` 스킬만 설치해줘” | 해당 skill selector만 dry-run → setup → doctor |
| “Notion 연결해줘” | `notion` MCP pack 설치 → `auth_deferred`; 첫 사용 시 OAuth |
| “Notion에서 정책을 찾아줘” | 설치가 아니라 live research workflow |
| “installer 코드를 수정해줘” | 일반 coding workflow |

## 기본 명령

사용자가 대화형 UI를 명시했을 때는 아래 한 줄을 제시한다.

```bash
npx --yes --package='git+https://github.com/ch4570/vulpora.git' -- vulpora
```

Agent/Bash 실행은 `vulpora list`로 selector를 확인한 뒤 명시적으로 실행한다. checkout과 PATH에 CLI가
없어도 같은 npx launcher 뒤에 explicit subcommand를 붙여 직접 실행한다.

| 상황 | 명령 mode |
|---|---|
| 개별 agent/skill 설치 | `setup --dry-run` → `setup` → `doctor` |
| 전체 agent+skill 설치 | `setup ... all-agents all-skills` |
| 개별 제거 | `uninstall --dry-run` → `uninstall` |
| hosted MCP 설치 | `mcp install` → `auth_deferred` → `mcp status` |
| 첫 Notion 호출의 auth 오류 | `mcp status` → 필요 시 `mcp login` 또는 Claude `/mcp` |
| 전체 대화형 제거 | 첫 화면의 `전체 제거` |

## Source와 discovery 경로

launcher 우선순위는 checkout `./vulpora` → PATH `vulpora` → public repository npx launcher다. 셋 중 실행 가능한
경로가 있으면 설치 요청을 안내문으로 끝내지 않는다. Bash/npx/runtime CLI 부재나 permission 거부 때만
사용자에게 exact command를 handoff한다.

| runtime/scope | agent | skill |
|---|---|---|
| Codex user | `~/.codex/agents` | `~/.agents/skills` |
| Codex project | `.codex/agents` | `.agents/skills` |
| Claude Code user | `~/.claude/agents` | `~/.claude/skills` |
| Claude Code project | `.claude/agents` | `.claude/skills` |

## Notion 경계

`notion-domain-researcher` agent, `notion-domain-context` skill, `notion` MCP pack은 서로 다른 자산이다.
skill 설치만으로 OAuth나 live access가 생기지 않는다. `--onboard`는 제거됐으며, MCP 설치와 login은
`vulpora mcp ...` 경로로만 수행한다. 일반 설치는 login을 호출하지 않고 `auth_deferred`로 끝낸다.
`notion-domain-context`의 첫 사용에서 auth 오류가 확인되거나 사용자가 즉시 인증을 명시했을 때만 login을
시작한다. 브라우저 승인 전에는 live verified라고 보고하지 않는다.

Claude project `.mcp.json`은 별도 trust 승인이 필요하다. `claude mcp get vulpora-notion`이
`Pending approval`이면 이미 설치된 상태이며 `approval_required`로 보고하고 `/mcp` 승인을 안내한다.
이를 미설치로 판정하거나 MCP를 재등록하지 않는다. 승인과 OAuth 인증 후 새 session에서 tool discovery를
확인한다.

## 리뷰 훅

- 기본 대화형 설치가 agent+skill을 함께 선택하는가?
- 개별 asset 요청을 전체 catalog로 확대하지 않았는가?
- skill과 MCP/OAuth를 같은 성공 상태로 합치지 않았는가?
- 적용 전에 dry-run을 확인하고 완료 후 runtime 재시작을 안내했는가?
- project approval, OAuth, live access를 서로 다른 상태로 보고하는가?
