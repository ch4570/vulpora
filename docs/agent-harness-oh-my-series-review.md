# oh-my 계열 하네스 구조 조사 및 Vulpora 적용안

초판: 2026-06-24

최종 확인: 2026-07-16

범위: 공식 oh-my-codex, oh-my-claudecode, oh-my-openagent/oh-my-opencode, oh-my-opencode-slim,
oh-my-claude, Claude Forge, Codex/Claude Code/OpenCode 공식 구조

> 이 문서는 하네스 비교 조사 기록이다. 2026-07-14 이후 Agent/MCP의 normative 경계,
> 권한, 보안, 릴리스 게이트는 [Agent/MCP 설계 규칙](agent-mcp-design-rules.md)을 따른다.
> 두 문서가 충돌하면 최신 canonical 규칙이 우선한다.
>
> **1.0.0 현재 구현 정정:** source와 distribution은 Agents(16), Skills(0)이다. 이 문서에 남은
> `skills/` 구조와 0.3.x package 설명은 조사·설계 기록이며 현재 기능이나 설치 지침이 아니다.

## 결론

Vulpora은 oh-my 계열처럼 하나의 거대한 런타임 하네스가 되면 안 된다. 이 레포의 목적은 여러 프로젝트에 이식 가능한 범용 에이전트 자산을 모으는 것이므로, 방향은 다음이 맞다.

1. Vulpora은 **canonical asset repository**로 둔다.
2. `agents/`, `memory/`, `templates/`를 원본 자산으로 유지한다.
3. Claude Code, OpenCode, Codex, Cursor 같은 런타임별 차이는 **adapter template**로 생성한다.
4. 런타임 상태 디렉터리는 이 레포에 두지 않는다.
5. 하네스는 "자동 실행 루프"가 아니라 "자산 발견, 권한 제한, 검증, 이식, 관찰 가능성"을 묶는 계약으로 설계한다.

oh-my 계열의 강점은 반복 가능한 agent workflow를 강하게 패키징했다는 점이다. 하지만 그 방식은 특정 CLI, plugin loader, tmux, MCP, local state directory에 깊게 묶인다. Vulpora이 그대로 따라가면 이식성을 잃는다.

우리는 **runtime harness**가 아니라 **harness-agnostic agent kit**를 만들어야 한다.

### pre-0.3.1: 2026-07-15 반영 결과 (superseded)

> 아래 1~7번은 당시 구현 기록이다. 0.3.1에서 실행 provenance를 다시 검토한 뒤 폐기되었으며,
> 현재 지원 수준을 나타내지 않는다.

최신 `oh-my-codex`와 `oh-my-claudecode`의 main branch에서 catalog, native agent generator, plugin manifest,
installer transaction, hook registry, team state ownership 코드를 다시 확인했다. 이번 Vulpora 변경에는 다음을
즉시 반영했다.

1. 16개 agent 모두 catalog stable ID와 같은 Codex TOML adapter를 명시적으로 보유한다.
2. installer `--verify`가 definition, adapter, bundle, skill을 source catalog와 byte-for-byte 대조한다.
3. Codex 0.144.x의 `spawn_agent.agent_type` 부재를 일반 child로 숨기지 않고, 일반 15개와 Notion을 서로 다른
   process-isolated runner로 실행한다.
4. 역할별 sandbox/web/network profile을 validator가 allowlist 방식으로 강제한다. shell network는
   `e2e-test-runner`에만 허용한다.
5. 실제 installer 결과로 project scope와 personal scope를 각각 검증하며 smoke helper가 adapter를 복사하지 않는다.
6. 실제 Codex 0.144.4에서 16/16, Claude Code 2.1.208에서 16/16 agent 설치·호출을 임시 프로젝트로 검증했다.
7. 2026-07-16에는 Codex·Claude native marketplace manifest와 `vulpora setup|doctor`를 추가했다. plugin cache의
   skill/agent discovery와 bundled installer source를 격리된 runtime home에서 검증했다. Codex plugin은 skill만
   제공하고 native TOML은 setup이 설치하며, Claude plugin은 agent와 skill을 직접 제공한다.

반면 `.omx`/`.omc` 상태 머신, tmux worker, always-on lifecycle hooks는 Vulpora에 넣지 않았다. 그것들은
runtime harness가 소유해야 하며, portable catalog의 canonical source와 섞으면 이중 authority가 생긴다.

### 0.3.1 현재 경계

1. project와 exact HOME을 포함한 모든 scope에서 Codex, Claude, OpenCode가 zero-copy다. agent, skill,
   script, adapter, runtime 설정, receipt를 복사하지 않으며 user catalog asset은 0개다.
2. native marketplace package에는 설치 상태 안내와 Notion 상태 안내, 두 status-only skill prompt entry만
   보인다. Agents, Scripts, Hooks, MCP와 설치 가능한 agent catalog는 각각 0개다.
3. generic runner는 `--discovery-probe`를 포함한 모든 호출을 `project_execution_disabled`로 거부한다.
4. Notion surface는 OAuth, MCP, search/fetch, Codex/Claude CLI를 호출하지 않고 고정 `no_evidence`를 반환한다.
5. 따라서 현재 검증 가능한 상태는 package inventory/fail-closed 동작까지다. 이 변경으로 discovery,
   agent task 실행,
   Claude native agent 호출, live Notion access를 지원한다고 주장하지 않는다.

## 조사한 하네스들의 공통 구조

### 1. oh-my-codex

공식 oh-my-codex는 Codex CLI 위에 AGENTS authority, skill routing, native agent TOML, plugin hook, team runtime,
doctor/setup을 얹는 orchestration layer다. 최신 source에서 특히 중요한 구조는 다음과 같다.

- `AGENTS.md`가 top-level authority이고 `prompts/*.md` role prompt는 그 아래의 좁은 execution surface다.
- root `skills/`가 canonical이고 plugin의 skill tree는 generated/verified mirror다. catalog manifest가 installable,
  alias, merged, deprecated 상태와 canonical target을 구분한다.
- `src/agents/definitions.ts`와 prompt가 원본이고 `src/agents/native-config.ts`가 `.codex/agents/*.toml`을 생성한다.
  native child에는 leaf guard를 추가해 재귀 delegation을 막는다.
- plugin은 skills/hooks/MCP metadata를 묶지만 native agent TOML은 setup-owned로 유지한다. plugin/setup 두 경로가
  같은 파일을 제각각 소유하지 않도록 ownership을 분리한다.
- team state는 mailbox/tmux 관찰값이 아니라 dispatch/integration별 authoritative owner를 따로 둔다.
  전달됐다는 신호를 integration 완료로 오인하지 않는다.
- setup/doctor에는 scope, overwrite, stale generated asset, shared ownership, packed install 회귀가 있다.

Vulpora에 가장 중요한 교훈은 **원본과 설치 mirror의 단일 authority**, **generated file ownership marker**,
**leaf agent**, **관찰값과 완료 상태의 분리**다. 이번 변경은 앞의 세 가지 중 catalog/source 검증과 leaf 실행을
반영했다. ownership marker 기반 stale cleanup과 install ledger는 다음 개선으로 남긴다.

### 2. oh-my-claudecode

oh-my-claudecode는 Claude Code용 multi-agent orchestration 계층이다. Claude Code plugin이 in-session agent,
skill, command, hook, MCP를 wiring하는 주 경로이고, npm CLI는 setup/ask/tmux team 같은 terminal runtime surface다.
두 설치 경로를 같은 것으로 취급하지 않는다. 핵심 실행 모델은 다음이다.

- `/team`: in-session native team workflow
- `omc team`: tmux CLI worker panes
- `/autopilot`, `/ralph`, `/ultrawork`, `/deep-interview`: in-session skills
- Team pipeline: `team-plan -> team-prd -> team-exec -> team-verify -> team-fix`
- project skill: `.omc/skills/`를 canonical로 두되 `.claude/skills/`, `.agents/skills/` 호환 경로도 읽음
- runtime state: `.omc/` 아래 sessions, plans, logs, handoffs, research notes 등
- 외부 provider: Codex, Gemini, Antigravity, Grok, Cursor 등을 worker로 호출

최신 source에서 추가로 확인한 중요한 구현은 다음이다.

- `.claude-plugin/plugin.json`이 skill, command, MCP 진입점을 선언하고 hook은 별도 lifecycle registry로 둔다.
- hook은 `UserPromptSubmit`, `SessionStart`, `PreToolUse`, `PermissionRequest`, `PostToolUse`, `SubagentStart/Stop`,
  `PreCompact`, `Stop`, `SessionEnd`처럼 관찰·집행 지점을 명시적으로 나눈다.
- `CLAUDE.md` 변경은 root containment와 symlink를 검사하고, exclusive backup을 읽어 검증한 뒤 temp+rename으로
  atomic write한다. 중간 실패 시 역순 rollback과 temp cleanup 결과까지 구조화해 반환한다.
- team lock은 PID만 믿지 않고 process start identity와 nonce를 함께 기록하며, 기존 owner의 사망이 확실할 때만
  stale lock을 회수한다.
- state root는 하나의 canonical resolver가 정하고, hook shim은 이를 재구현하지 않고 위임한다.

중요한 교훈은 "하나의 primary loop authority만 둔다"는 원칙이다. goal loop, Ralph, Team, UltraQA 같은 루프가 동시에 주도권을 잡으면 상태와 완료 기준이 꼬인다.

### 3. oh-my-openagent / oh-my-opencode

oh-my-openagent는 기존 oh-my-opencode 계열이 multi-harness agent OS로 확장되는 흐름이다. README 기준으로 Ultimate Edition(OpenCode)과 Light Edition(Codex CLI)을 분리한다.

- Ultimate: OpenCode plugin 중심, agents, hooks, MCP, team tools, hashline edits, tmux, LSP, AST-grep 포함
- Light: Codex CLI에 맞춘 portable components만 제공
- multi-harness refactor: OpenCode, Codex, Pi, Claude Code 등 adapter를 분리하려는 방향
- 핵심 기능: Sisyphus orchestrator, Hephaestus deep worker, Prometheus planner, Team Mode, ultrawork, ulw-loop, hash-anchored edit, rules injection
- 런타임 상태: `.omo/`, `.opencode/`, target-specific config에 의존

이 계열에서 가장 중요한 기술적 교훈은 "모델보다 하네스가 실패율을 좌우한다"는 관점이다. 특히 hash-anchored edit는 agent가 본 line에 content hash를 붙이고, edit 시점에 hash가 다르면 적용을 거부한다. 이는 stale-line corruption을 줄이는 하네스 레벨 장치다.

### 4. oh-my-opencode-slim

oh-my-opencode-slim은 token cost를 줄이고 background orchestration을 강화한 OpenCode plugin이다.

- Orchestrator가 plan/delegation/reconciliation/verification에 집중
- specialist agents는 background task로 실행
- optional Companion UI로 agent activity 관찰
- Deepwork: persistent plan file + Oracle review gate
- Reflect: 반복되는 friction을 skill/agent/command/config/prompt rule 후보로 제안
- Worktrees: `.slim/worktrees/<slug>/` 아래 isolated coding lanes
- config는 JSON Schema가 붙은 JSON 파일을 사용

여기서 얻을 교훈은 "자가 학습"을 바로 memory write로 보지 않고, 반복 friction을 관찰한 뒤 가장 작은 reusable asset으로 제안한다는 점이다.

### 5. Claude Forge

Claude Forge는 "oh-my-zsh for Claude Code"에 가까운 full setup 배포판이다.

- agents, commands, skills, hooks, rules, MCP servers, statusLine을 한 번에 wiring
- Claude Code plugin loader와 `install.sh` symlink install의 차이를 명확히 문서화
- plugin loader는 commands/skills 중심이고, agents/hooks/rules/MCP/statusLine까지 완전히 wiring하려면 symlink install이 필요하다고 설명
- workflow 예시: `/plan -> /tdd -> /code-review -> /handoff-verify -> /commit-push-pr -> /sync`
- hooks는 secret filtering, remote command guard, DB protection, security auto-trigger, rate limiting 등 안전 계층 역할

교훈은 "artifact를 갖고 있는 것"과 "runtime에 실제로 wiring되는 것"을 분리해서 문서화해야 한다는 점이다.

### 6. Claude Code 공식 구조

Claude Code 공식 문서 기준으로 주요 표준 surface는 다음이다.

- settings scope: managed, user, project, local
- project settings: `.claude/settings.json`
- local settings: `.claude/settings.local.json`
- subagents: Markdown + YAML frontmatter
- skills: `SKILL.md` 기반, 필요할 때만 body를 load하는 progressive disclosure
- hooks: lifecycle event에 연결되는 command/http/prompt/agent hook
- subagent는 description, tool restriction, model, memory scope로 specialized behavior를 만든다

Vulpora이 Claude Code adapter를 만든다면 `.claude/` live directory를 이 레포 루트에 두는 게 아니라, `templates/harness/claude-code/` 아래에 생성 템플릿으로 둬야 한다.

### 7. OpenCode 공식 구조

OpenCode 공식 문서 기준으로 하네스 구성은 더 명확하게 config-first다.

- config: JSON/JSONC
- project config: `opencode.json`
- project asset directories: `.opencode/agents/`, `.opencode/commands/`, `.opencode/plugins/`, `.opencode/skills/`
- agent는 JSON config 또는 Markdown + YAML frontmatter로 정의
- primary agent와 subagent를 구분
- permission은 `ask`, `allow`, `deny`
- MCP는 context budget을 많이 쓰므로 조심해서 enable
- plugin은 JS/TS module이며 events, tool execution, session, LSP, permission 등에 hook 가능
- skills는 `.opencode/skills/<name>/SKILL.md`뿐 아니라 `.claude/skills/`, `.agents/skills/` 호환 경로도 읽는다

OpenCode adapter는 이 레포의 `skills/*/SKILL.md`를 `.opencode/skills/*/SKILL.md`로 매핑하고, `agents/*.md`는 `.opencode/agents/*.md` 또는 `opencode.jsonc` agent block으로 변환하면 된다.

### 8. AGENTS.md와 Agent Skills

AGENTS.md는 coding agent를 위한 README 역할의 Markdown 파일이다. 공식 사이트는 build/test commands, code style, testing instructions, security considerations를 담는 것을 권장하고, monorepo에서는 nested AGENTS.md를 둘 수 있다고 설명한다.

Agent Skills는 더 명확한 cross-tool packaging standard다.

- skill은 폴더다.
- `SKILL.md`가 필수다.
- `scripts/`, `references/`, `assets/`는 optional이다.
- startup 때는 name/description만 노출한다.
- task가 맞을 때 full `SKILL.md`를 load한다.
- 필요할 때 supporting files를 추가로 읽는다.

Vulpora의 `skills/<name>/SKILL.md + reference/` 구조는 이 표준과 잘 맞는다.

## 공식 OMX·OMC와 Vulpora의 구조 비교

| 계층 | oh-my-codex | oh-my-claudecode | Vulpora 결정 |
|---|---|---|---|
| 최상위 authority | `AGENTS.md` | managed `CLAUDE.md` block | project/HOME authority를 변경하지 않으며 모든 scope가 zero-copy |
| catalog SSOT | status·canonical target을 가진 manifest | plugin manifest + metadata sync | source catalog는 배포 inventory일 뿐 설치 가능한 user/runtime catalog는 0개 |
| agent 원본→adapter | definition+prompt에서 TOML 생성 | Markdown native agent를 plugin이 제공 | runtime agent/adapter를 설치하지 않으며 runner 호출은 전부 비활성화 |
| skill packaging | root canonical, plugin mirror 생성·검증 | plugin skill registry, 세 호환 discovery root | native package에는 status-only skill prompt entry 2개만 보임 |
| lifecycle hook | Codex plugin hook + setup legacy wrapper | lifecycle event별 hook registry | Hooks/Scripts/MCP 0; onboarding과 외부 CLI 실행 없음 |
| durable state | `.omx/` team/goal/plan/log state | `.omc/` session/mode/team state | runtime state를 소유하지 않음; memory/eval은 portable contract만 제공 |
| concurrency | dispatch/integration authority 분리 | process identity+nonce lock | installer는 아직 concurrent mutation lock이 없어 개선 필요 |
| 설치 안전 | generated ownership marker, stale cleanup, doctor | containment, symlink deny, backup, atomic write, rollback | all-scope zero-copy; target/HOME asset과 receipt를 만들지 않음 |
| 완료 판정 | verifier와 team state evidence | verify/fix loop와 deliverable hook | status inventory와 fail-closed 결과만 증거로 사용 |

여기서 “호환”은 한 단어로 표시하지 않는다. 최소한 다음 네 상태를 분리한다.

1. `packaged`: status-only prompt inventory가 package metadata에 포함됨
2. `installed`: project/HOME asset 0개; runtime/user catalog를 만들지 않음
3. `discovered`: 현재 Vulpora agent/catalog에는 지원되지 않음
4. `executed`: 현재 Vulpora agent에는 지원되지 않음

Notion의 `live-verified`도 현재 지원되지 않는다. 고정 `no_evidence` 또는 status prompt inventory를 OAuth, search,
fetch, live access의 증거로 올려 쓰지 않는다.

## 하네스의 본질

조사 기준으로 agent harness는 prompt 모음이 아니다. 다음 10개 계층의 조합이다.

1. **Context contract**: AGENTS.md, CLAUDE.md, rules, repo instructions
2. **Agent registry**: planner, executor, reviewer, verifier 같은 역할 정의
3. **Skill registry**: reusable workflow와 progressive disclosure
4. **Command surface**: `/plan`, `/review`, `/ship`, `ultrawork` 같은 invocation
5. **Routing policy**: task type -> agent/model/tool/permission
6. **Tool layer**: MCP, LSP, AST-grep, browser, shell, git
7. **Edit harness**: patch, hash-anchored edits, stale-line rejection
8. **State and memory**: session summaries, plans, handoffs, learned skills
9. **Verification loop**: tests, lint, typecheck, review gates, replay eval
10. **Observability and recovery**: HUD, logs, progress files, cancel/resume/doctor

Vulpora이 가져와야 할 것은 2, 3, 5, 8, 9번이다. 4, 6, 7, 10번은 런타임마다 달라서 adapter가 맡아야 한다.

## Vulpora 적용 원칙

> **pre-0.3.1 superseded proposal:** 아래 project export 원칙과 예시는 비교 조사 당시 초안이다.
> 현재 project/HOME을 포함한 모든 scope는 모든 runtime에서 zero-copy이며 agent task를 실행하지 않는다.

### 원칙 1. canonical source와 runtime export를 분리한다

Vulpora의 원본은 다음이다.

```text
agents/
skills/
memory/
templates/
docs/
STANDARD.md
```

Target repo에 설치될 때만 다음으로 export한다.

```text
.agents/
.claude/
.codex/
.opencode/
AGENTS.md
```

Vulpora 루트에 target runtime state를 직접 두지 않는다.

### 원칙 2. runtime state는 템플릿으로만 다룬다

oh-my 계열은 `.omc/`, `.omo/`, `.slim/`, `.opencode/`, `.claude/` 같은 상태 디렉터리를 사용한다. 이 레포에서는 그런 디렉터리를 live state로 두지 않는다.

대신 다음처럼 템플릿으로만 둔다.

```text
templates/harness/
├── generic/
│   └── AGENTS.md.fragment
├── claude-code/
│   ├── README.md
│   ├── settings.project.json
│   └── install-map.md
├── opencode/
│   ├── README.md
│   ├── opencode.project.jsonc
│   └── install-map.md
└── codex/
    ├── README.md
    ├── AGENTS.md.fragment
    └── install-map.md
```

### 원칙 3. skill은 Agent Skills 표준을 기준으로 둔다

현재 `skills/<name>/SKILL.md` 구조는 유지한다. 단, 모든 skill은 최소한 다음을 가져야 한다.

- YAML frontmatter: `name`, `description`
- 사용 조건
- 금지 조건
- 입력/출력
- 절차
- 검증
- supporting references 경로

OpenCode와 Claude Code 모두 `SKILL.md`를 읽을 수 있으므로 이 부분은 가장 강한 이식성 축이다.

### 원칙 4. agent는 neutral role definition + adapter metadata로 둔다

현재 `agents/*.md`와 `agents/<name>/SOUL.md` 구조는 유지한다.

다만 runtime별 옵션은 agent 본문에 섞지 않는다.

나쁜 예:

```yaml
model: claude-opus-...
permission:
  bash: allow
```

좋은 예:

```text
Role: code-reviewer
Default capability: read-only review
Required tools: read, search, diff
Forbidden tools: write, shell mutation
Verification: findings must cite file/line
Adapter hints:
- claude-code: subagent, read-only tools
- opencode: subagent, edit deny, bash deny
- codex: native subagent or prompt role
```

### 원칙 5. workflow command는 neutral recipe로 먼저 정의한다

`/ship`, `/branch`, `/review`, `/memory-audit` 같은 command는 각 runtime의 slash command 포맷으로 바로 박지 않는다. 먼저 neutral workflow recipe로 정의하고 adapter가 변환한다.

```text
workflow id -> trigger -> required context -> steps -> tools -> verification -> output
```

### 원칙 6. 하네스 검증이 없으면 하네스가 아니다

oh-my 계열에서 반복되는 `doctor`, `setup`, `verify`, review gate는 필수다. Vulpora에도 최소 검증이 있어야 한다.

필수 검증:

- skill frontmatter lint
- skill name regex
- dangling reference check
- agent role contract check
- no target-runtime live state check
- no project-private token check
- install-map consistency check
- adapter export smoke test

## 권장 디렉터리 변화

> **pre-0.3.1 superseded proposal:** 아래 디렉터리 생성안은 현재 설치기가 만들지 않는다.

지금 당장 큰 구조 변경은 필요 없다. 다음 단계에서만 추가하면 된다.

```text
vulpora/
├── harness/
│   ├── README.md
│   ├── contracts/
│   │   ├── agent.contract.schema.json
│   │   ├── skill.contract.schema.json
│   │   ├── workflow.contract.schema.json
│   │   └── adapter.contract.schema.json
│   ├── adapters/
│   │   ├── claude-code.md
│   │   ├── opencode.md
│   │   ├── codex.md
│   │   └── generic-agents-md.md
│   └── checks/
│       └── README.md
├── templates/
│   └── harness/
│       ├── claude-code/
│       ├── opencode/
│       ├── codex/
│       └── generic/
```

`harness/`는 실행 상태가 아니라 계약과 adapter 설명이다. live state를 쓰지 않는다.

## Adapter별 매핑안

> **pre-0.3.1 superseded proposal:** 아래 `.claude/`, `.codex/`, `.opencode/`, `AGENTS.md` project 매핑은
> 현재 지원 경로가 아니다. 0.3.1 설치는 프로젝트에 파일을 복사하지 않는다.

### Generic / AGENTS.md

목표: 어떤 coding agent에도 최소한의 repo context를 제공한다.

매핑:

- `README.md`: 사람이 보는 설명
- `STANDARD.md`: agent asset 작성 표준
- `AGENTS.md.fragment`: setup, test, verification, portability rule
- nested AGENTS.md는 대상 repo가 monorepo일 때만 생성

주의:

- AGENTS.md는 짧아야 한다.
- 긍정 지침보다 금지/검증/경계 조건을 우선한다.
- 너무 많은 일반론을 넣으면 비용과 실패율이 올라간다.

### Claude Code

목표: `.claude/` project config와 skills/subagents/hooks로 export한다.

매핑:

- `skills/<name>/SKILL.md` -> `.claude/skills/<name>/SKILL.md`
- read-only reviewer agent -> `.claude/agents/<name>.md`
- project settings -> `.claude/settings.json` template
- hooks -> `.claude/settings.json` hooks block 또는 별도 script reference

주의:

- plugin loader가 모든 resource를 자동 wiring하지 않을 수 있다.
- project-shared와 local-only 설정을 분리해야 한다.
- destructive hook은 managed/user approval 없이 넣지 않는다.

### OpenCode

목표: `opencode.jsonc` + `.opencode/agents/` + `.opencode/skills/`로 export한다.

매핑:

- agent -> `.opencode/agents/<name>.md` 또는 `opencode.jsonc.agent`
- skill -> `.opencode/skills/<name>/SKILL.md`
- permission -> `ask/allow/deny`
- MCP -> `mcp` block, default disabled 또는 per-agent scoped
- commands -> `.opencode/commands/`

주의:

- MCP는 context budget을 잡아먹기 때문에 skill-scoped 또는 opt-in으로 둔다.
- global config와 project config merge precedence를 문서화해야 한다.
- `.agents/skills/`도 호환 경로로 읽히므로 중복 설치를 피해야 한다.

### Codex

목표: Vulpora의 원본 자산을 Codex native subagent/skill/AGENTS.md 규칙으로 export한다.

매핑:

- `AGENTS.md.fragment` -> 대상 repo `AGENTS.md`
- skill -> 프로젝트/사용자 공통 discovery 경로인 `.agents/skills/<name>/SKILL.md`
- agent role -> `.codex/agents/<name>.toml` 또는 prompt surface
- workflow -> reusable prompt/skill

주의:

- Codex에서는 런타임 상태 디렉터리를 repo에 두지 않는다.
- 실행 권한은 sandbox/approval 정책에 맡긴다.
- memory/knowledge graph는 별도 portable contract로 유지한다.

## 구현 순서

> **pre-0.3.1 superseded proposal:** 아래 export 구현 순서는 현재 roadmap 승인이 아니다.
> 실행 기능을 다시 제안하려면 OS-backed trust boundary부터 재설계해야 한다.

### Phase 1. 하네스 계약 문서화

- `harness/README.md` 추가
- `harness/adapters/*.md` 추가
- "Vulpora은 runtime이 아니라 adapter-exportable asset kit"라고 명시
- live runtime state 금지 규칙 추가

### Phase 2. 자산 inventory matrix

현재 자산을 표로 만든다.

```text
asset id | type | source path | claude-code | opencode | codex | required verification
```

이 표가 있어야 설치/변환 범위가 명확해진다.

### Phase 3. skill lint

검증 항목:

- `SKILL.md` 존재
- frontmatter 존재
- `name`, `description` 존재
- name regex 통과
- directory name과 name 일치
- reference link 유효
- forbidden runtime state path 미포함

### Phase 4. adapter templates

처음에는 실제 installer를 만들지 말고 template만 둔다.

- `templates/harness/claude-code/`
- `templates/harness/opencode/`
- `templates/harness/codex/`
- `templates/harness/generic/`

### Phase 5. export script

나중에 필요할 때만 `scripts/export-harness`를 만든다.

초기에는 dry-run이 기본이어야 한다.

```text
export-harness --target claude-code --dry-run
export-harness --target opencode --dry-run
export-harness --target codex --dry-run
```

실제 write는 target repo에서만 한다. Vulpora 루트에는 runtime directory를 만들지 않는다.

### Phase 6. smoke eval

각 target별 smoke 기준:

- skill 목록이 발견된다.
- read-only agent가 write 권한 없이 동작한다.
- reviewer가 file/line 근거를 낸다.
- memory gate policy를 어기지 않는다.
- target runtime state가 git에 섞이지 않는다.

## 무엇을 가져오고 무엇을 버릴지

> **pre-0.3.1 historical evaluation:** 이 목록은 비교 조사에서 얻은 후보를 기록한다.
> 현재 기능 목록이 아니며 native agent, hook, MCP, project export를 활성화하지 않는다.

가져올 것:

- progressive disclosure skill 구조
- role-specialized agent registry
- catalog status와 canonical target을 가진 SSOT
- canonical source와 runtime mirror의 비변경 verification
- plan -> execute -> verify -> fix pipeline
- read-only explore/review agent
- permission-first routing
- leaf subagent와 nested delegation ceiling
- background/subagent separation
- review/eval gate
- doctor/check command
- adapter별 install-map
- generated ownership marker와 stale asset의 보수적 정리
- atomic write·backup·rollback·concurrent mutation lock
- runtime state를 git에서 분리하는 원칙

버릴 것:

- 특정 provider 모델명에 강결합
- `.omc`, `.omo`, `.slim` 같은 runtime state를 원본 repo에 두는 방식
- YOLO/skip-permission을 기본 전제로 하는 loop
- 모든 MCP를 항상 켜는 방식
- marketing-oriented agent naming을 표준 contract에 섞는 방식
- 한 runtime의 plugin loader 한계를 전체 구조의 기준으로 삼는 방식

조건부 채택:

- hash-anchored edit: 실제 edit tool을 만들 때 채택. 지금은 policy와 eval 요구사항으로만 기록
- tmux worker: local automation tool로는 유용하지만 Vulpora canonical surface에는 넣지 않음
- companion/HUD: observability template로만 고려
- worktree lanes: 고위험 병렬 실행 adapter에서만 고려

## 최종 권고

> **pre-0.3.1 superseded recommendation:** 아래 권고는 당시 export 중심 설계안이다.
> 0.3.1 현재 계약은 status-only prompt inventory 2개, all-scope zero-copy, no discovery/execution,
> Notion `no_evidence`다.

Vulpora의 하네스 전략은 다음 문장으로 고정하면 된다.

> Vulpora은 여러 coding agent 런타임으로 export 가능한 agent/skill/memory/workflow contract 저장소다. 런타임별 실행, 상태, 권한, hook wiring은 adapter template로 분리한다.

따라서 다음 작업이 가장 먼저다.

1. 현재 manifest에 `status`, `canonical`, `runtime compatibility`를 명시할 schema migration을 설계한다.
2. installer에 ownership ledger, atomic stage+rename, rollback, concurrent mutation lock을 추가한다.
3. `harness/`를 runtime이 아닌 contract/adapters/checks 문서 디렉터리로 추가한다.
4. `templates/harness/`에 Claude Code/OpenCode/Codex/Generic export template를 둔다.
5. `skills/*/SKILL.md`를 Agent Skills 호환 기준으로 lint한다.
6. `agents/*`를 neutral role definition으로 유지하고 runtime별 model/permission은 adapter에서 강제한다.
7. memory/self-learning은 기존 `memory/` contract와 연결하되, 자동 runtime state로 쓰지 않는다.

이렇게 가야 oh-my 계열의 장점은 흡수하면서도 이 레포의 핵심 목표인 "다른 레포에 이식하기 쉬운 범용 에이전트 자산"을 지킬 수 있다.

## 참고 자료

- [oh-my-codex](https://github.com/Yeachan-Heo/oh-my-codex)
- [OMX Plugin Bundle SSOT](https://github.com/Yeachan-Heo/oh-my-codex/blob/main/docs/plugin-bundle-ssot.md)
- [OMX native agent generator](https://github.com/Yeachan-Heo/oh-my-codex/blob/main/src/agents/native-config.ts)
- [OMX team runtime state contract](https://github.com/Yeachan-Heo/oh-my-codex/blob/main/docs/contracts/team-runtime-state-contract.md)
- oh-my-claudecode: https://github.com/Yeachan-Heo/oh-my-claudecode
- [OMC architecture](https://github.com/Yeachan-Heo/oh-my-claudecode/blob/main/docs/ARCHITECTURE.md)
- [OMC plugin manifest](https://github.com/Yeachan-Heo/oh-my-claudecode/blob/main/.claude-plugin/plugin.json)
- [OMC CLAUDE.md transaction](https://github.com/Yeachan-Heo/oh-my-claudecode/blob/main/src/installer/claude-md-transaction.ts)
- [OMC process identity lock](https://github.com/Yeachan-Heo/oh-my-claudecode/blob/main/src/team/process-identity-lock.ts)
- oh-my-openagent: https://github.com/code-yeongyu/oh-my-openagent
- oh-my-opencode fork: https://github.com/HaiNinh1/oh-my-opencode
- oh-my-opencode-slim: https://github.com/alvinunreal/oh-my-opencode-slim
- oh-my-claude: https://github.com/2lab-ai/oh-my-claude
- Claude Forge: https://github.com/sangrokjung/claude-forge
- Claude Code settings: https://code.claude.com/docs/en/settings
- Claude Code subagents: https://code.claude.com/docs/en/sub-agents
- Claude Code hooks: https://code.claude.com/docs/en/hooks
- Claude Code skills: https://code.claude.com/docs/en/skills
- OpenCode agents: https://opencode.ai/docs/agents/
- OpenCode config: https://opencode.ai/docs/config/
- OpenCode plugins: https://opencode.ai/docs/plugins/
- OpenCode MCP servers: https://opencode.ai/docs/mcp-servers/
- OpenCode skills: https://opencode.ai/docs/skills/
- AGENTS.md: https://agents.md/
- Agent Skills: https://agentskills.io/
