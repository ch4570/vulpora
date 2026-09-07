# Vulpora 설치 및 삭제

[English README](README.md) · [한국어 README](README.ko.md) · [아키텍처](docs/architecture.ko.md) · [전체 스킬](docs/skills.ko.md)

Vulpora 1.0.0은 Claude Code와 Codex에 에이전트 28개, 스킬 62개, 14개 capability pack과
hosted MCP 연결을 선택 설치합니다. 전체 설치의 정상 inventory는 `Agents (28)`, `Skills (62)`입니다.
OpenCode는 저수준 installer의 project-scope agent/skill renderer만 experimental로 제공합니다. 상위 CLI와
native execution smoke test가 완성되기 전까지 안정 지원에 포함하지 않습니다.

**npm registry 게시는 보류했습니다.** 공개 GitHub 저장소의 명령, 릴리스 tarball, 로컬 checkout으로 설치할 수 있습니다.

패키지·명령은 `vulpora`, 초기화 스킬은 `vulpora-init`입니다. `VULPORA_*` 환경변수,
`.vulpora` 기록 경로, `vulpora.config.json`, `vulpora@vulpora` Claude plugin을 사용합니다.

## 60초 대화형 설치

macOS/Linux, Bash 3.2+, Git, Node.js 18.18+와 npm, 사용할 런타임(`claude` 또는 `codex`)이
필요합니다. 현재 GitHub 기본 브랜치의 설치기를 실행합니다.

아래 한 줄만 실행합니다. `setup`, `--runtime`, `--scope`, `all-agents`, `all-skills` 같은 인자는 붙이지 않습니다.

설치가 끝나면 runtime을 재시작하고 작업할 repository에서 Codex는 `$vulpora-init`, Claude Code는
`/vulpora-init`을 가장 먼저 실행합니다. 이 스킬은 기술 스택을 감지해 root `AGENTS.md`의 기존 Vulpora
routing marker만 갱신하며 기존 수동 지침은 보존합니다. build dependency나 DB/search stack이 바뀌면 다시
실행합니다.

```bash
npx --yes --package='git+https://github.com/ch4570/vulpora.git' -- vulpora
```

실행 즉시 대화형 화면이 열리고 설치·삭제·점검, 사용자·프로젝트 범위, 에이전트·스킬·MCP를
메뉴에서 선택합니다. 기본 선택은 `에이전트 + 스킬`이며, 둘 다 전체 설치하거나 필요한 항목만
고를 수 있습니다.

대상 런타임은 묻지 않습니다. 설치기가 PATH에서 Claude Code(`claude`)와 Codex(`codex`) CLI를
찾아 **감지된 런타임 전부**에 설치합니다. 하나만 있으면 그 런타임만, 둘 다 있으면 둘 다
처리하고, 하나도 없으면 아무것도 바꾸지 않고 안내와 함께 중단합니다. 특정 런타임만 대상으로
하려면 `VULPORA_RUNTIME=claude-code`(또는 `codex`, `all`)를 지정해 실행합니다.

`vulpora` 명령을 계속 사용하려면 접근 가능한 GitHub repository에서 전역으로 설치할 수 있습니다.
패키지 설치 후 명령을 실행하면 같은 대화형 설치기가 열립니다.

```bash
npm install --global 'git+https://github.com/ch4570/vulpora.git'
vulpora
```

<details>
<summary>버전 고정 npm 명령 — registry 배포 이후 사용 가능</summary>

```bash
npx --yes vulpora@1.0.0

# 계속 사용할 전역 CLI
npm install --global vulpora@1.0.0
vulpora
```

현재 배포 전에는 GitHub 명령 또는 아래 오프라인 tarball 방법을 사용합니다.

</details>

TTY 설치기는 삭제를 찾기 쉽도록 작업을 첫 화면에 표시하고 다음 순서로 질문합니다.

1. 설치/업데이트, 선택 제거, 전체 제거, 또는 상태 점검
2. 모든 프로젝트의 `user` scope 또는 현재 저장소의 `project` scope
3. 선택 작업의 경우 에이전트+스킬, 에이전트만, 에이전트+MCP, 스킬만, MCP만, 또는 전체 catalog
4. 방향키와 `Space`로 설치·제거할 에이전트·스킬·MCP 복수 선택
5. 요약 dry-run 미리보기 후 적용 확인 (`D`로 세부 내역)
6. OAuth pack은 `auth_deferred`로 표시하고 설치를 완료

런타임은 1단계 이전에 자동 감지되며 감지 결과를 화면에 표시합니다.

스킬 선택 화면은 커서가 있는 항목의 한글 용도 설명과 의존 자산을 따로 보여줍니다. Workflow 스킬이나
다른 자산을 선택하면 manifest의 `skill:<id>`·`agent:<id>` dependency closure가 함께 설치됩니다. 에이전트나 MCP를
함께 선택했다면 스킬을 하나도 고르지 않고 `Enter`로 0개를 확정할 수 있습니다. `스킬만`을 선택한 경우는
아무 작업도 하지 않는 설치를 막기 위해 여전히 1개 이상을 고릅니다.

`Vulpora 전체 제거`는 3~4단계를 건너뛰고 감지된 런타임과 선택한 범위의 receipt 전체를 미리보기에
올립니다. 따라서 현재 catalog에서 사라진 예전 Vulpora 에이전트·스킬도 누락되지 않습니다. 실제 삭제는
마지막 적용 확인 뒤에만 시작합니다.

TTY 선택기는 다음 키를 사용합니다.

| 키 | 동작 |
|---|---|
| `↑` `↓` 또는 `J` `K` | 항목 이동 |
| `Space` | 복수 선택/해제 |
| `A` | 전체 선택/해제 |
| `Enter` | 현재 선택 확정 |
| `D` | 적용 전 세부 dry-run 출력 |
| `Q` | 변경 없이 취소 |

선택 화면은 alternate screen에서 synchronized frame 단위로 갱신합니다. 키를 누를 때 화면 전체를
지우지 않고 각 행의 남은 영역만 정리하며, 종료·오류·신호 수신 시 원래 화면과 cursor를 복구합니다.
한글과 아이콘 폭이 다른 터미널에서도 정렬이 흔들리지 않도록 선택 표시는 `>`, 체크박스는
`[x]`/`[ ]`를 사용합니다.
미리보기 생성, 설치·삭제 적용, 상태 점검처럼 시간이 걸릴 수 있는 구간은 ASCII progress bar, 현재 단계,
경과 시간과 최근 작업 로그 5줄을 계속 갱신합니다. 완료되면 별도 입력 없이 자동으로 다음 화면으로
이동합니다.
색상 없이 사용하려면 `NO_COLOR=1`, 번호 입력 화면으로 전환하려면 `VULPORA_UI=plain`을 지정합니다.

터미널이 아닌 CI·pipe 환경은 ANSI 제어 문자를 출력하지 않고 기존 plain 입력 모드로
자동 전환됩니다. 자동화에서 명시하려면 `VULPORA_UI=plain`을 사용합니다.

비전역 `npx`와 전역 npm 설치 모두 lifecycle에서 에이전트·스킬을 자동 설치하지 않습니다. 메뉴에서
적용을 확정하거나 `vulpora setup`을 명시적으로 실행한 뒤에만 사용자·프로젝트 경로가 바뀝니다.

## Capability pack으로 시작하기

전체 catalog 대신 필요한 root만 선택하고 manifest dependency closure를 설치할 수 있습니다.

```bash
vulpora list
vulpora setup --runtime codex --scope project pack:core
vulpora setup --runtime codex --scope project pack:postgres pack:jvm-quality
vulpora doctor --runtime codex --scope project pack:core pack:postgres pack:jvm-quality
```

`core`, `orchestration`, `jvm-spring`, `jvm-spring-postgres-opinionated`, `postgres`, `mssql`,
`opensearch`, `jvm-quality`, `qa-e2e`, `visual`, `product`, `product-discovery-ko`, `knowledge`, `notion`을
제공합니다. PostgreSQL 기반 JPA/layered Spring house pattern과 한국어 제품 discovery는 이름에
특화 범위를 드러내고 범용 코어와 분리했습니다.
`uninstall pack:<id>`는 설치 때 계산한 것과 같은 dependency closure를 제거하지만, 다른 완전한
built-in pack이 설치돼 있으면 그 pack에 필요한 공유 자산은 보수적으로 보존합니다.

프로젝트별 언어와 VCS 정책은 root `vulpora.config.json`에 둘 수 있습니다. 설정이 없으면 현재
branch/worktree를 유지하고 repository의 관례를 따릅니다.

```bash
cp /path/to/vulpora/vulpora.config.example.json ./vulpora.config.json
```

Codex adapter는 기본 설치 시 `model`과 `model_reasoning_effort`를 생략합니다. 작업별 명시적
모델 라우팅을 adapter의 고정값이 덮어쓰지 않게 하기 위한 기본값입니다. 명시적 route 없이
에이전트를 직접 호출하면 해당 호스트의 기본 모델·추론 설정을 따릅니다.

고정값이 필요한 경우 아래 환경변수를 각각 선택적으로 지정합니다. Model은 runtime이 실제로
노출하는 정확한 ID를 사용하며, effort는 `minimal`, `low`, `medium`, `high`, `xhigh`, `max`, `ultra`
중 해당 모델이 지원하는 값이어야 합니다. 설치기는 형식을 검사하며 실제 가용성을 인증하지 않습니다.

```bash
VULPORA_CODEX_MODEL='provider/model-id' VULPORA_CODEX_REASONING_EFFORT=medium \
  vulpora setup --runtime codex --scope project pack:orchestration
```

`doctor`는 설치된 top-level model/effort의 존재 또는 부재를 그대로 검증하며, 실행하는 shell의
환경변수로 대체하지 않습니다. 이전에 고정값으로 설치했다면 두 환경변수를 비우고 같은 `setup`을
다시 실행해 고정값을 제거할 수 있습니다. 사용자가 수정한 자산은 기존 receipt 보호 규칙을 따릅니다.
Source adapter template의 model placeholder는 호환성 metadata이며 기본 설치값이 아닙니다.
Custom adapter의 고정값은 호스트 dispatch 인자보다 우선할 수 있으므로 route와의 충돌 검사가 필요합니다.

## 로컬 checkout 및 오프라인 설치

### GitHub 개발 채널

현재 npm registry 배포 전의 기본 실행 경로입니다. 기본 브랜치를 따라가므로 특정 릴리스로
고정되지 않으며, 저장소가 공개되기 전에는 repository 접근 권한이 필요합니다. npm 배포 후에도
릴리스에 아직 포함되지 않은 변경을 시험할 때 사용할 수 있습니다.

```bash
npx --yes --package='git+https://github.com/ch4570/vulpora.git' -- vulpora
```

### 로컬 checkout에서 직접 실행

처음 받는 경우 접근 가능한 계정에서 clone합니다.

```bash
git clone https://github.com/ch4570/vulpora.git
cd vulpora
./vulpora
```

이미 저장소를 clone했다면 npm package 설치 없이 checkout의 설치기를 직접 실행합니다. 기존 checkout은
네트워크에 접속할 수 있을 때 최신 `main`으로 갱신합니다.

```bash
cd /path/to/vulpora
git pull --ff-only origin main
./vulpora interactive
```

이 경로는 npm registry나 Claude marketplace를 사용하지 않습니다. 다음 업데이트도 같은 checkout에서
`git pull --ff-only` 후 설치기를 다시 실행하면 됩니다.

### 외부 네트워크에 접속할 수 없는 PC

네트워크에 연결된 PC의 최신 checkout에서 의존성 없는 로컬 npm tarball을 생성합니다. 파일명을 고정하면 대상 PC에서
버전별 파일명을 다시 입력할 필요가 없습니다.

```bash
cd /path/to/vulpora
git pull --ff-only origin main
PACKAGE_TGZ="$(npm pack --silent | tail -n 1)"
mv "$PACKAGE_TGZ" vulpora-offline.tgz
```

`vulpora-offline.tgz`를 USB나 허용된 파일 전송 방식으로 대상 PC에 복사한 뒤 실행합니다.

```bash
npx --yes --package=./vulpora-offline.tgz -- vulpora
```

대상 PC에서 GitHub 또는 npm registry 접근은 필요하지 않습니다. 다만 Node.js/npm과 설치 대상 runtime
(`claude` 또는 `codex`)은 설치돼 있어야 합니다. Notion OAuth 및 실제 MCP 호출은 오프라인 설치와 별개로
Notion endpoint에 접근할 수 있는 네트워크가 필요합니다.

대화형 Claude Code 설치는 `.claude/agents`에 직접 배치하므로 사용자가 marketplace를 등록하거나
plugin 이름을 관리할 필요가 없습니다.

## 설치 범위와 경로

| 런타임 | scope | 에이전트 | 스킬 | MCP config |
|---|---|---|---|---|
| Codex | `user` | `~/.codex/agents` | `~/.agents/skills` | `~/.codex/config.toml` |
| Codex | `project` | `<project>/.codex/agents` | `<project>/.agents/skills` | `<project>/.codex/config.toml` |
| Claude Code | `user` | `~/.claude/agents` | `~/.claude/skills` | Claude user MCP config |
| Claude Code | `project` | `<project>/.claude/agents` | `<project>/.claude/skills` | `<project>/.mcp.json` |
| OpenCode (experimental) | `project` | `<project>/.opencode/agents` | `<project>/.opencode/skills` | 별도 관리 |

OpenCode는 상위 `vulpora` CLI의 runtime selector에 아직 포함되지 않습니다. 검증할 project에서만
저수준 installer를 명시적으로 실행하고, 설치 직후 같은 selector로 rendered catalog를 확인합니다.

```bash
PROJECT_ROOT="$(pwd -P)"
bash /path/to/vulpora/install/install.sh -t "$PROJECT_ROOT" --runtime opencode --apply pack:postgres
bash /path/to/vulpora/install/install.sh -t "$PROJECT_ROOT" --runtime opencode --verify pack:postgres
```

설치된 `start-task`의 기본 계약은 `vulpora.start-task-profile/v1`이며, 고위험 audit profile만
`vulpora.start-task/v1` 계약을 사용한다. Codex에서는
`$start-task`를 입력하거나 `/skills`에서 선택하고, Claude Code에서는 `/start-task`를 입력한다.
Codex에는 `/start-task` dispatcher가 없으므로 그 표기는 사용하지 않는다.
작업 내용은 호출과 함께 문자열로 전달한다: Codex `$start-task "<원하는 작업>"`, Claude Code
`/start-task "<원하는 작업>"`. 빈 문자열과 4096 UTF-8 byte 초과 입력은 child 실행 전에 거부한다.
아래 spec·DAG·ledger 절차는 `audit` profile에 적용됩니다. `lightweight`와 `standard`는 해당 run
파일을 만들지 않고 실제 diff와 관련 검증 결과를 사용합니다. 자세한 선택 기준은
[start-task 실행 가이드](docs/start-task-orchestration.md)에 있습니다.

Audit 구현 요청에 commit된 spec과 DAG는 `.vulpora/tasks/<run-id>/`에 SHA-256과 함께 한 번만 동결된다.
독립 실행 작업 수는 runtime slot·dependency readiness·write-scope 독립성·상위 policy로 매 dispatch마다
계산한다. 명확화는 저장소 관찰과 가역적 기본값으로 먼저 해소하고, 구현 전에는 현재 명확도·모호성,
가장 중요한 미결정 영역과 진행 가능 여부를 보여준 뒤 한 턴에 질문 하나를 묻는다. 사용자가 더 답할지,
남은 가정과 위험을 기록하고 구현할지 직접 결정하며 고정 질문 횟수 상한은 없다. 비우회 안전·권한
결정은 진행 요청으로도 넘지 않는다. Freeze 뒤의 phase/task/command는
같은 run 디렉터리의 `execution-ledger.jsonl` 해시 체인에 먼저 append되고, 그 결과가 `작업 로그:`로
표시된다. Clarity validator 입력도 `clarity-projection.json` digest로 spec·report·command event에 묶인다.
로컬 ledger는 변조 탐지용이며 외부 runtime/WORM anchor가 없으면 절대 불변으로 간주하지 않는다.

Claude Code 조직에서 subscription OAuth 사용을 막은 경우에는 `ANTHROPIC_API_KEY`를 설정해야 한다.
키가 있으면 `start-task` 격리 실행은 차단된 OAuth보다 API 키를 우선하며, 둘 다 사용할 수 없으면
`claude_oauth_org_not_allowed` 또는 `claude_auth_unavailable`을 환경 비가용 상태로 보고한다.

설치나 업데이트 후에는 실행 중인 Claude Code 또는 Codex를 종료하고 새 세션을 시작합니다.

Claude Code의 project scope MCP는 `.mcp.json` 기록과 별개로 현재 session의 `/mcp`에서 server trust 승인이
필요합니다. 설치 중에는 승인이나 OAuth를 시작하지 않습니다. 첫 `/notion-domain-context` 호출에서
`approval_required` 또는 `auth_required`를 감지하면 그때 `/mcp` 승인과 브라우저 OAuth를 시작합니다.

## MCP 설치팩

| pack ID | transport / endpoint | auth | 용도 |
|---|---|---|---|
| `notion` | HTTP `https://mcp.notion.com/mcp` | OAuth | Notion workspace 검색·페이지 작업 |
| `openai-docs` | HTTP `https://developers.openai.com/mcp` | 없음 | OpenAI 공식 개발자 문서 검색 |

Notion은 [Notion의 공식 hosted MCP](https://developers.notion.com/guides/mcp/get-started-with-mcp)를
사용합니다. 설치기는 공식 endpoint를 등록하고 Codex/OMX에서는 server-level `enabled_tools`를 read alias
4개로 제한합니다. OAuth 승인·SSO·MFA와 토큰 저장은 각 런타임에 위임합니다. 설치 결과의
`auth_deferred`는 정상이며, 첫 Notion 호출 또는 명시적인 즉시 인증 요청에서만 다음 login 경로가 실행됩니다.

```bash
vulpora mcp login --runtime codex --scope user notion
vulpora mcp login --runtime claude-code --scope project notion
```

MCP 설정 이름은 `vulpora-notion`, `vulpora-openai-docs`처럼 namespace를 붙입니다. 같은 이름이
다른 endpoint를 가리키면 사용자 설정을 덮어쓰거나 삭제하지 않고 충돌을 보고합니다.

Codex의 기존 1.2.1 URL-only `vulpora-notion` 설정은 같은 endpoint이고 `enabled_tools`가 없을 때만 제자리에서
read-only policy를 추가합니다. 이미 다른 tool policy가 있으면 사용자 설정으로 간주해 보존하고 충돌을
보고합니다. `vulpora mcp status ... notion`의 `configured_read_only`가 적용 완료 상태입니다.

새 runtime session에서 `notion-domain-context`는 Codex/OMX의 제한된 parent MCP를 직접 사용하고, Claude
Code에서만 exact `notion-domain-researcher`를 호출합니다. Codex/OMX 도구가 없으면 먼저 installer status를
한 번 확인해 exact config는 first-use OAuth로 넘기고, 미설치일 때만 설치 안내와 `restart_required`를
반환합니다. 정상 검색이 완료된 뒤 결과가 없을 때만 `no_evidence`를 반환합니다.

`mcp/nl-sql`은 DB 접속 정보와 로컬 빌드가 필요한 고급 소스 패키지입니다. 비밀값을 추측해
자동 설정할 수 없으므로 hosted MCP 대화형 설치팩에는 포함하지 않으며,
[`mcp/nl-sql/README.md`](mcp/nl-sql/README.md)를 따릅니다.

## 비대화형 CLI

### 에이전트·스킬 설치·점검·선택 제거

```bash
vulpora list

vulpora setup --runtime codex --scope project --dry-run postgres-dba java-reviewer
vulpora setup --runtime codex --scope project postgres-dba java-reviewer
vulpora setup --runtime codex --scope project kotlin-spring-review test-authoring
vulpora doctor --runtime codex --scope project postgres-dba kotlin-spring-review

# 주요 통합 workflow와 typed dependency를 현재 프로젝트에 함께 설치
vulpora setup --runtime codex --scope project \
  start-task java-spring-review-workflow postgres-review-workflow opensearch-review-workflow kotlin-spring-review-workflow
vulpora doctor --runtime codex --scope project \
  start-task java-spring-review-workflow postgres-review-workflow opensearch-review-workflow kotlin-spring-review-workflow

# Claude Code는 runtime selector만 변경
vulpora setup --runtime claude-code --scope project \
  start-task java-spring-review-workflow postgres-review-workflow opensearch-review-workflow kotlin-spring-review-workflow

vulpora uninstall --runtime codex --scope project --dry-run java-reviewer
vulpora uninstall --runtime codex --scope project java-reviewer
vulpora uninstall --runtime codex --scope project test-authoring
```

Claude Code는 `--runtime claude-code`를 사용하며 같은 selector 계약을 따릅니다. `all-agents`는
에이전트 28개, `all-skills`는 스킬 62개를 root selector로 삼고 각 자산의 typed dependency closure를
함께 해소합니다. 따라서 `all-agents`에 필수 스킬이, `all-skills`에 workflow 필수 에이전트가 포함될 수 있습니다.
선택 제거는 receipt가 소유하고 설치 후
바뀌지 않은 경로만 삭제합니다. 사용자가 수정한 파일과 선택하지 않은 에이전트·스킬은 보존합니다.

### MCP 설치·점검·인증·제거

```bash
vulpora mcp list

vulpora mcp install --runtime claude-code --scope project --dry-run notion
vulpora mcp install --runtime claude-code --scope project notion
vulpora mcp status --runtime claude-code --scope project notion
vulpora mcp login --runtime claude-code --scope project notion
vulpora mcp remove --runtime claude-code --scope project --dry-run notion
vulpora mcp remove --runtime claude-code --scope project notion
```

`--scope project` 시 현재 Git root가 기본 target이며 `--target /path/to/project`로 명시할 수
있습니다. [Claude Code MCP scope](https://code.claude.com/docs/en/mcp)와 Codex의 project/user config
방식을 각 CLI에 그대로 위임합니다.

## 전역 npm 설치와 기존 Claude plugin

전역 npm 설치는 CLI만 배치하며 user scope를 자동 변경하지 않습니다. checkout에서 tarball을 만든 뒤
전역 설치하고, 원하는 runtime·scope·pack을 명시적으로 setup합니다.

```bash
git clone https://github.com/ch4570/vulpora.git
cd vulpora
PACKAGE_TGZ="$(npm pack --silent | tail -n 1)"
npm install --global "./${PACKAGE_TGZ}"
vulpora setup --runtime codex --scope user pack:core
vulpora doctor --runtime codex --scope user pack:core
```

대화형 메뉴에서 고르려면:

```bash
vulpora interactive
```

npm package 제거도 runtime 자산을 암묵적으로 지우지 않습니다. 먼저 `vulpora uninstall`로 receipt-owned
자산을 제거하고, 그 다음 `npm uninstall --global vulpora`로 CLI package를 제거합니다.

기존 Claude marketplace 사용자도 plugin 설치를 계속 사용할 수 있습니다. 새 선택 설치 흐름에서는
필요하지 않습니다.

```bash
claude plugin marketplace add https://github.com/ch4570/vulpora.git --scope user
claude plugin install vulpora@vulpora --scope user
```

## Vulpora 삭제

가장 간단한 방법은 위 설치기를 다시 실행하고 첫 화면에서 다음 중 하나를 고르는 것입니다.

- `선택 제거`: 에이전트·스킬·MCP 종류와 개별 항목을 골라 제거
- `Vulpora 전체 제거`: 지정한 런타임·범위의 receipt-owned 에이전트·스킬과 namespaced MCP를 함께 제거

receipt가 소유한 설치 후 미수정 파일만 삭제합니다. 직접 수정했거나 안전하게 판정할 수 없는
에이전트·스킬 파일은 경고와 함께 보존하고, MCP를 포함한 나머지 안전한 제거는 계속 진행합니다.
전체 제거가 완료되면 `.vulpora`을 지우지만 `.claude`, `.codex`, `.agents`나 그 아래의 공용
`agents`/`skills` 폴더는 통째로 삭제하지 않습니다. receipt에 없는 기존 파일과 폴더는 그대로 남습니다.
단, 수정된 receipt-owned 항목을 보존한 부분 제거에서는 추후 안전한 재시도를 위해 `.vulpora`이 남을 수 있습니다.

비대화형으로 에이전트와 스킬을 모두 지우려면 다음을 실행합니다.

```bash
vulpora uninstall --runtime codex --scope user --dry-run
vulpora uninstall --runtime codex --scope user
vulpora mcp remove --runtime codex --scope user notion openai-docs
```

`npx` 방식은 임시 실행이므로 전역 CLI package가 남지 않습니다.
전역 설치한 경우에는 자산을 먼저 제거한 뒤 package 자체를 지웁니다.

```bash
npm uninstall -g vulpora
```

MCP는 에이전트 receipt와 별개이므로 비대화형 CLI에서는 `vulpora mcp remove ...`를 별도로
실행합니다. npm package 삭제만으로 기존 MCP 연결을 임의 제거하지 않습니다.

## 문제 해결

- `npm E404`: 현재 `vulpora@1.0.0` registry 배포는 대기 중이므로 위 GitHub 명령이나 로컬 checkout을
  사용합니다. 배포 이후에는 `npm config get registry`와
  `npm view vulpora@1.0.0 --registry=https://registry.npmjs.org`로 registry·버전을 확인합니다.
- Git repository 접근 실패: `git ls-remote https://github.com/ch4570/vulpora.git`로 네트워크와
  repository 접근 권한을 확인합니다. 공개 전에는 GitHub 인증이 필요할 수 있으며, 접근 가능한
  환경에서 만든 tarball을 전달받아 오프라인 방식으로 설치할 수도 있습니다.
- checkout에서 비전역으로 실행: `PACKAGE_TGZ="$(npm pack --silent | tail -n 1)"` 후
  `npx --yes --package="./${PACKAGE_TGZ}" -- vulpora`을 사용합니다.
- 런타임 CLI 미감지: 먼저 `codex` 또는 `claude`를 설치하고 PATH에서 실행 가능한지 확인합니다.
  자동 감지는 PATH 위의 CLI 존재 여부만 봅니다. `~/.claude`·`~/.codex` 디렉터리가 남아 있어도
  CLI가 없으면 감지하지 않습니다 — 쓸 수 없는 런타임에 자산을 흩뿌리지 않기 위한 의도된 동작입니다.
- 설치 후 에이전트가 안 보임: 런타임을 완전히 종료하고 새 세션을 시작합니다.
- Notion 미인증: 첫 `/notion-domain-context` 호출이 `vulpora mcp login ... notion`을 시작하며 브라우저에서 승인합니다.
- MCP 충돌: `vulpora mcp status ...`로 기존 `vulpora-<pack>` endpoint를 확인하고, 사용자가
  의도한 설정인지 판단한 후 런타임 CLI로 정리합니다.
- 삭제 후 파일이 남음: receipt 설치 후 수정된 파일은 의도적으로 보존됩니다.

## 배포 담당자 검증

```bash
bash install/check-manifest.sh
bash install/test-install.sh
bash install/test-vulpora-cli.sh
bash install/test-uninstall.sh
bash install/test-mcp-manager.sh
bash install/test-codex-agent-compat.sh
bash evals/run-evals.sh
bash evals/behavioral/run-behavioral-evals.sh --validate
bash install/test-plugin-distribution.sh
bash install/test-npm-package.sh
```

## 버전 규칙

`VERSION`은 `MAJOR.MINOR.PATCH.MICRO` 네 자리로 관리합니다. 호환을 깨는 저장소 계약은 MAJOR,
새 agent·runtime capability나 독립적인 운영 표준은 MINOR, 하위 호환 동작 수정은 PATCH,
문구·metadata·작은 문서 보정은 MICRO를 올립니다. npm과 Claude plugin manifest는 표준 SemVer
`MAJOR.MINOR.PATCH`를 사용합니다.
