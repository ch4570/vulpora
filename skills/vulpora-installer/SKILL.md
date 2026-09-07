---
name: vulpora-installer
description: >-
  Install, update, verify, or remove Vulpora agents, skills, and MCP packs for Codex or Claude Code.
  Use when the user asks to set up Vulpora, install a catalog asset, remove an installed asset, or
  connect the Notion/OpenAI Docs MCP pack. Execute requested changes through a checkout, installed CLI,
  or the public repository npx launcher; reserve command handoff for unavailable tools or explicitly interactive
  requests. Do not use this skill for Notion research itself.
---

# Vulpora Installer

Vulpora의 agent·skill catalog와 MCP pack을 현재 runtime/scope에 설치·삭제·점검한다. 사용자의 설치·연결
요청 자체를 실행 권한으로 간주하고, Bash가 있으면 dry-run부터 검증까지 직접 수행한다. 일반 설치에서는
OAuth를 시작하지 않고 `auth_deferred`로 끝낸다.

먼저 [핵심 원칙](reference/principles.md)을 읽고 [KB INDEX](reference/kb/INDEX.md)에서 현재 요청에 필요한
topic만 고른다. 명령 선택과 Notion MCP 경계는 [설치 라우팅](reference/kb/install-routing.md)을 따른다.

## Trigger 계약

다음 의도에는 이 스킬을 호출한다.

- “Vulpora 설치해줘”, “Codex/Claude Code에 에이전트와 스킬을 깔아줘”
- “`kotlin-spring-review` 스킬만 설치/삭제해줘”
- “Notion MCP 연결해줘”, “Vulpora 설치 상태 확인해줘”
- 이 스킬을 명시한 설치·업데이트·삭제·검증 요청 (Codex `$vulpora-installer`, Claude Code `/vulpora-installer`)

다음 의도에는 호출하지 않는다.

- “Notion에서 회사 정책 근거를 찾아줘” 같은 지식 검색
- 공개 자료 조사나 현재 repository code/docs만으로 답할 수 있는 질문
- 설치기 source 자체의 구현·리팩터링·리뷰 요청

## 실행 launcher를 결정한다

다음 순서로 하나의 executable launcher를 선택한다.

1. 현재 checkout에 `./vulpora`이 있으면 사용한다.
2. PATH에 `vulpora`이 있으면 사용한다.
3. 둘 다 없고 `npx`와 Bash를 사용할 수 있으면 다음 public repository npx launcher를 사용한다.

```bash
npx --yes --package='git+https://github.com/ch4570/vulpora.git' -- vulpora
```

Agent나 non-TTY shell에서는 이 launcher 뒤에 selector가 완성된 explicit subcommand를 붙인다. Bash와
`npx`가 사용 가능하면 command를 사용자에게 돌려보내지 않는다(Do not hand the command back to the user).
사용자가 대화형 화면 자체를 명시적으로 요청했을 때만 no-argument launcher와 Claude Code의 `!` shell
mode를 안내한다.

## 상태를 먼저 판정한다

runtime과 scope는 명시값을 우선한다. 생략됐다면 현재 runtime, 기존 receipt/config를 우선하고, 새 private
Notion 연결은 `user` scope를 기본으로 한다. 기존 project `.mcp.json`이 있거나 사용자가 project를
지정한 경우에만 project scope를 사용한다. 요청한 selector를 임의로 `all`로 넓히지 않는다.

Claude Notion은 mutation 전에 대상 directory에서 다음 실제 상태를 확인한다.

```bash
claude mcp get vulpora-notion
```

- exact official endpoint가 `Pending approval`이면 MCP 파일은 이미 configured다. 재설치하지 않고
  `approval_required`로 보고하며, 현재 Claude Code의 `/mcp`에서 project server 승인을 요청한다.
- server가 없을 때만 launcher의 `mcp install --dry-run`과 `mcp install`을 실행한다.
- 다른 endpoint가 같은 이름을 사용하면 conflict로 보존한다.

## explicit subcommand를 실행한다

선택한 launcher를 아래 `vulpora` 자리에 사용한다. npx fallback도 동일한 explicit subcommand를
지원하며 no-argument TUI가 필요하지 않다.

```bash
vulpora list
vulpora setup --runtime codex --scope project --dry-run kotlin-spring-review
vulpora setup --runtime codex --scope project kotlin-spring-review
vulpora doctor --runtime codex --scope project kotlin-spring-review
vulpora uninstall --runtime codex --scope project kotlin-spring-review
```

`--runtime`은 `codex`, `claude-code`, `all` 중 현재 판정한 값을 그대로 쓴다. Claude Code에서는 같은
selector를 `--runtime claude-code`로 실행한다.

```bash
vulpora setup --runtime claude-code --scope project --dry-run kotlin-spring-review
vulpora setup --runtime claude-code --scope project kotlin-spring-review
vulpora doctor --runtime claude-code --scope project kotlin-spring-review
```

전체 agent·skill catalog가 명시적으로 필요하면 `all-agents all-skills`를 함께 사용한다. Codex skill
discovery 경로는 user scope `~/.agents/skills`, project scope `<project>/.agents/skills`다. Claude Code는
각 scope의 `.claude/skills`를 사용한다.

스킬 설치 후 새 runtime session에서 프로젝트 작업을 시작하기 전에 Codex는 `$vulpora-init`, Claude
Code는 `/vulpora-init`을 먼저 실행하도록 안내한다. 이 초기화는 repository stack evidence를 감지해
root `AGENTS.md`의 Vulpora routing marker만 갱신한다. 설치기가 대상 repository의 수동 지침을 직접
추측하거나 덮어쓰지 않는다.

## MCP 경계

MCP는 skill selector가 아니라 별도 pack이다. 대화형 메뉴 또는 다음 명령을 사용한다.

```bash
vulpora mcp install --runtime claude-code --scope project notion
vulpora mcp login --runtime claude-code --scope project notion
vulpora mcp status --runtime claude-code --scope project notion
vulpora mcp remove --runtime claude-code --scope project notion
```

`--onboard`는 제거된 옵션이므로 사용하지 않는다. Notion OAuth·SSO·MFA와 token 저장은 runtime에
위임한다. 설치·업데이트 요청은 MCP config를 검증한 뒤 `auth_deferred`로 종료하며 `mcp login`을 실행하지
않는다. first Notion invocation에서 research skill이 `auth_required` 또는 Claude `approval_required`를
확인했을 때만 이 skill로 돌아와 login 또는 `/mcp` 승인을 시작한다. 사용자가 “지금 인증해줘”라고 명시한
경우도 login을 시작할 수 있다. OAuth approval은 사용자가 브라우저에서 수행하며, command 완료와 후속
status 확인 전에는 인증 성공을 주장하지 않는다. 설치 성공, project approval, runtime discovery, 인증
성공, live 검색 성공을 각각 독립 상태로 판정한다.

Bash, 선택한 launcher, runtime CLI가 실제로 없거나 permission이 거부된 경우에만 exact command를 사용자에게
handoff한다. 이때도 이미 configured/pending인 상태를 미설치로 낮추지 않는다.

## 결과 보고

- runtime, scope, selector와 실제 discovery 경로
- dry-run/적용/doctor 결과
- 스킬 설치가 포함되면 새 session에서 `vulpora-init`을 먼저 실행해야 한다는 next step
- MCP가 있으면 configured, approval_required, auth_deferred/auth_required와 첫 사용에 남은 OAuth 단계
- runtime 재시작 필요 여부

인증 URL, OAuth state, token, 계정 identity는 로그나 응답에 복사하지 않는다.
