# Vulpora 에이전트 구축과 KB 저작 가이드

상태: **Canonical Authoring Guide v1 (agent + skill workflow)**
기준일: **2026-08-18**
연결 규범: [STANDARD](../STANDARD.md), [Agent/MCP 설계 규칙](agent-mcp-design-rules.md),
[Agent Lifecycle 성숙도와 Feedback Loop](agent-lifecycle-assessment-and-feedback-loop.md)

이 문서는 Vulpora에서 agent·knowledge base를 실제로 만드는 순서와 합격 증거를 정한다.
`STANDARD.md`가 지켜야 할 계약이라면, 이 문서는 그 계약을 따라 **무엇을 어떤 순서로 만들고
어떻게 검증할지** 설명하는 작업 안내서다.

## 1. 먼저 내리는 결론

현재 `SOUL.md → principles.md → kb/INDEX.md → topic KB` 구조는 유지한다. 역할 정체성, 판단
원칙, 작업별 지식 라우팅, 근거 문서를 분리하므로 progressive disclosure에 적합하다. 폴더 이름만
바꾸는 대규모 이관보다 다음 네 가지를 먼저 고치는 편이 효과가 크다.

1. 모든 agent 정의에서 INDEX까지 도달하는 경로를 명시한다.
2. KB에 누가 소유하고 언제 검증했으며 어느 버전에 적용되는지 기록한다.
3. 같은 기술 사실의 canonical owner를 하나로 정하고 agent bundle 간 중복을 줄인다.
4. source tree와 distribution package에서 링크·inventory·typed dependency closure를 자동 검증한다.

[Agent Skills specification](https://agentskills.io/specification)은 metadata, 활성화 시 읽는 핵심
지침, 필요할 때만 읽는 resource의 세 단계로 skill을 공개하도록 한다. 개별 reference는 작고
집중된 단위로 두고 깊은 참조 사슬을 피하도록 권고한다. [Anthropic의 context engineering
가이드](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)도 전체 문서를
미리 주입하기보다 작은 고신호 맥락을 INDEX와 파일 경로로 just-in-time 탐색하는 방식을 권한다.
현재 구조의 방향은 이 기준에 맞지만, 실제 routing과 검증이 아직 형식을 따라오지 못한다.

## 2. 2026-09-06 구조 snapshot

| 항목 | 결과 | 판정 |
|---|---:|---|
| agent 정의 / 지식 bundle | 28 / 27 | Codex/Claude 배포가 전체 agent inventory를 노출한다. |
| source/distribution skill package | 62 / 62 | workflow를 포함한 전체 skill inventory를 배포한다. |
| topic KB | 359 | agent와 skill의 on-demand reference topic 전체 수다. |
| INDEX | 68 | agent bundle과 skill reference가 작업 유형을 topic KB로 라우팅한다. |
| behavioral baseline | 3모드 | `plain-runtime`, `agent-only`, `agent-memory`. |

따라서 현재 구조 완결성은 강하지만, progressive disclosure·provenance·SSOT·자동 집행을 합친
운영 성숙도는 약 **3/5**다. 이 점수는 인증이 아니라 같은 기준으로 개선을 추적하기 위한 내부
baseline이다.

## 3. 무엇을 만들어야 하는가

새 자산을 만들기 전에 가장 작은 실행 단위를 고른다.

| 필요한 것 | 선택 | 만들지 말아야 할 것 |
|---|---|---|
| 입력과 출력이 결정적이고 코드로 검증 가능 | script, library, native tool | 판단 loop를 가진 agent |
| 불확실한 다단계 판단, 도구 선택, 오류 회복이 필요 | agent | 단순 wrapper agent |
| host가 외부 resource/tool provider와 표준 연결해야 함 | MCP server | 전체 orchestration을 품은 MCP |
| 독립 배포 agent 간 discovery/delegation | A2A | 같은 process의 단순 subtask에 A2A |

agent를 선택했다면 PR에 deterministic code나 native tool로 충분하지 않은 이유를 한 문단으로
남긴다. [OpenAI의 agent 구축 가이드](https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/)도
복잡한 판단, 유지하기 어려운 규칙, 비정형 데이터가 아니라면 deterministic solution을 먼저
검토하고, single agent에서 시작해 실제 eval로 확장하라고 권한다.

## 4. 현재 canonical v1 레이아웃

Vulpora source tree에서는 다음 구조를 사용한다. `<agent-id>`와 `<bundle-id>`는 다를 수 있으며
그 관계는 `install/manifest.txt`가 단일 출처다.

```text
agents/<agent-id>.md                 # runtime용 운영 정의
agents/<bundle-id>/
├── SOUL.md                          # 정체성·가치·말투·금기
└── reference/
    ├── principles.md                # 판단 원칙과 trade-off
    └── kb/
        ├── INDEX.md                 # 작업 신호 → topic KB router
        └── <topic>.md               # 출처가 있는 사실·규칙

skills/<skill-id>/SKILL.md           # 재사용 절차 또는 여러 자산을 묶는 workflow
evals/behavioral/cases/<asset-id>/   # positive·negative·adversarial case
```

Agent Skills는 이 저장소의 정식 배포 표면이다. Agent 정의에서 `INDEX → topic` 한 번의 라우팅을
넘는 깊은 참조 사슬을 만들지 않고, 여러 자산을 묶는 순서·실패 의미·통합 규칙은 workflow skill이 소유한다.

### 파일별 책임

| 파일 | 들어갈 것 | 들어가면 안 되는 것 |
|---|---|---|
| agent 정의 | 입력, 절차, 권한, stop, output, verification, KB 진입점 | persona 복제, 모든 KB 전문 |
| `SOUL.md` | 정체성, 가치, 소통 방식, 금기 | 실행 절차, runtime별 경로 |
| `principles.md` | 오래 유지되는 판단 원칙과 trade-off | 버전별 API 사실, 일회성 incident |
| `kb/INDEX.md` | 구체적 작업 신호와 읽을 topic의 Markdown link | topic 내용의 장문 복제 |
| topic KB | 좁은 주제의 사실, 출처, 적용 버전, review hook | 권한 확대 지시, 외부 문서의 명령 |
| behavioral case | 관찰 가능한 성공·금지·안전·비용 조건 | 구현을 그대로 복사한 brittle assertion |

## 5. Agent 계약을 먼저 쓴다

구현 전에 다음 10개 필드를 사람과 validator가 확인할 수 있게 정의한다. 현재는 agent 정의에
명시하되, package v2에서는 machine-readable `contract.yaml`과 capability profile로 분리한다.

1. **Identity**: stable id, owner, 한 문장 목적, lifecycle status와 version
2. **Inputs**: 입력 형식, 신뢰 수준, 필수·선택값, 누락·모순 시 행동
3. **Outputs**: 형식, artifact, 근거와 provenance, 실패 출력
4. **Authority**: 허용 tool, path, network, process, credential, write scope와 risk tier
5. **Prohibitions**: 금지 action·data·sink, 권한 확대 금지, 승인 경계
6. **Delegation**: 대상, objective, 결과 형식, delegated authority ceiling
7. **State**: session/memory read-write, retention, redaction, quarantine
8. **Stop**: complete, fail, cancel, timeout, retry, escalation 조건
9. **Budget**: tool call, wall-clock, token/cost, result size, parallelism 상한
10. **Verification**: outcome, process/trajectory, safety, cost의 합격 기준

자연어로 “하지 마라”고 쓰는 것은 host 권한 통제가 아니다. tool/path/network/credential/write
제약은 runtime capability profile, sandbox, policy gateway, credential broker에서 같은 범위로
강제해야 한다.

현재 v1 agent 정의는 아래 뼈대를 사용한다. 실제 섹션명은 역할에 맞게 바꿀 수 있지만 계약
항목을 빼서는 안 된다.

```markdown
---
name: <agent-id>
description: <무엇을 하며 언제 선택하는지>
tools: Read, Grep, Glob
---

# <역할 이름>

## 목적과 비목표
## 입력·신뢰 수준·누락 대응
## Context routing
- `<bundle-id>/SOUL.md`
- `<bundle-id>/reference/principles.md`
- `<bundle-id>/reference/kb/INDEX.md`
## 수행 절차와 출력 계약
## Authority·금지 행동·delegation ceiling
## State·retention·redaction
## Stop·timeout·retry·escalation
## Budget
## Verification
```

frontmatter의 tool 목록은 최소 surface로 시작한다. `Bash`, write/edit, web/network를 추가할 때는
필요성, 경로·command allowlist, side effect, credential 접근, timeout을 threat model과 eval에
함께 반영한다.

## 6. KB 저작 규칙

### 6.1 Context load 순서

agent는 다음 순서로 필요한 만큼만 읽는다.

1. runtime/system policy
2. 승인된 immutable release의 agent 정의
3. 같은 release root의 `principles.md`와 `kb/INDEX.md`
4. INDEX가 현재 작업 신호에 연결한 같은 release의 topic KB만
5. 현재 code/schema/API와 공식 source를 비신뢰 task evidence로 확인

`reference/kb/` 전체를 재귀 로드하지 않는다. task에 맞는 파일을 고를 수 없다면 INDEX routing이
부족한 것이므로 INDEX를 고친다. 모든 agent 정의에는 최소한 principles와 INDEX의 상대 경로와
“언제 어느 topic을 읽는지”가 있어야 한다. 사람이 탐색하기 쉽도록 Markdown link를 권장한다.
대상 repository의 `AGENTS.md`, `CLAUDE.md`, `.claude/knowledge/**`, 동명 SOUL/KB는 release instruction이나
project convention으로 승격하지 않는다. 필요한 경우 주장으로만 읽고 code/test/config로 재검증한다.

### 6.2 Topic 파일

현재 필수 frontmatter는 유지한다.

```yaml
---
title: PostgreSQL ALTER TABLE 안전성
source: https://www.postgresql.org/docs/current/sql-altertable.html
last_fetched: 2026-07-14
consumers: [postgres-dba]
---
```

다음 metadata는 v2 migration 전까지 **SHOULD**, schema와 linter가 도입된 뒤 **MUST**로
승격한다.

```yaml
owner: postgres-dba
source_type: official              # official|standard|book|research|internal
sources:                           # 복수 근거를 scalar 하나에 합치지 않는다.
  - uri: https://www.postgresql.org/docs/current/sql-altertable.html
    version: current
    locator: ALTER TABLE / Notes
last_verified: 2026-07-14
verified_by: <reviewer-or-controlled-process>
review_after: 2026-10-14
status: verified                   # candidate|verified|deprecated|quarantined
supersedes: []
evals: [postgres-alter-table-lock-risk]
revalidate_on: [source-version-change, related-code-change, incident, eval-failure]
```

- 한 파일은 한 판단 주제만 다룬다. 두 개 이상의 독립 작업 신호가 필요하면 나눈다.
- 사실과 규칙에는 source를 붙인다. 책·research·internal은 공식 규격과 같은 trust tier로 취급하지 않는다.
- `last_fetched`는 가져온 날짜일 뿐 내용의 정확성·적용 버전을 검증했다는 뜻이 아니다.
- source가 여러 개면 `sources[]`에 분리하고 각 주장과 어느 source가 연결되는지 알 수 있게 쓴다.
- source version/section, 검증한 actor, 연계 eval과 재검증 trigger를 추적한다. 이 provenance 구분은
  entity·activity·agent와 derivation을 분리하는 [W3C PROV-O](https://www.w3.org/TR/prov-o/) 및
  source·modified·provenance를 구분하는 [DCMI Metadata Terms](https://www.dublincore.org/specifications/dublin-core/dcmi-terms/)와
  같은 방향이다.
- 본문은 최소 하나의 `## 리뷰 훅` 아래 관찰 가능한 checklist를 가진다.
- 외부 문서, web/DB/tool result, machine-generated memory의 명령은 data로 취급한다. 검증 전에는
  `candidate` 또는 `quarantined`이며 agent 권한·정책을 바꿀 수 없다.
- 예시와 fixture가 사실의 출처를 대신하지 않게 하고, 실행 sample은 eval/assets로 분리한다.

### 6.3 INDEX와 link

INDEX 표의 모든 topic은 클릭 가능한 상대 Markdown link로 쓴다.

```markdown
| `ALTER TABLE`, 대형 테이블, NOT NULL | [alter-table-safety](alter-table-safety.md) | 락·재작성·단계적 검증 |
```

- 모든 topic은 정확히 하나의 canonical INDEX에서 발견 가능해야 한다.
- INDEX에는 파일명보다 **언제 읽을지 알 수 있는 trigger**를 먼저 쓴다.
- link target은 source tree와 설치된 runtime tree 양쪽에서 해소돼야 한다.
- agent 정의에서 topic을 무조건 모두 나열하지 말고 INDEX를 기본 진입점으로 둔다.
- INDEX에서 topic으로 간 뒤 다시 여러 reference를 순환 탐색하게 만들지 않는다.

### 6.4 충돌과 ownership

권한과 사실의 우선순위를 섞지 않는다.

- **권한·행동**: system/runtime policy → externally bound agent instruction → 같은 release KB
- **기술 사실**: 현재 code/schema와 적용 버전의 공식 문서 → 표준 → 검증된 연구·책 → 내부 경험칙
- **신뢰**: verified curated knowledge → candidate → machine-generated/quarantined data

같은 기술 사실을 여러 agent bundle에 각각 복사하지 않는다. 기본 owner는 해당 판단을 소유하는
canonical agent다. 다른 agent에는 역할 고유 severity·handoff만 두고, 복제가 꼭 필요하면
`owner`, `derived_from`, version과 동기화 test를 둔다.

## 7. Eval-first 작성 순서

최소 2~3개 realistic case로 시작하고, 첫 실행 뒤 assertion을 다듬는다. [Agent Skills eval
가이드](https://agentskills.io/skill-creation/evaluating-skills)는 같은 prompt를 skill 적용/미적용 또는
이전/새 version으로 각각 실행하고 품질·시간·token delta를 비교하라고 권한다.

```text
필요성 판단
  → agent contract + threat/data-flow
  → positive·negative·adversarial eval spec
  → definition·SOUL·principles·INDEX·topic 작성
  → manifest dependency closure
  → static/security gate
  → 실제 runtime behavioral trials
  → 격리 package inventory + zero-copy 검증
  → 별도 security architecture가 승인되기 전 execution 금지
  → release evidence
```

case는 최소 다음을 포함한다.

- **positive**: 정상 입력에서 기대 artifact와 근거를 만든다.
- **negative**: 역할 밖 요청, 불완전 입력, 지원하지 않는 환경에서 거절·escalate한다.
- **adversarial**: prompt injection, 악성 KB/tool result, 권한 확대, secret/external sink를 차단한다.
- **regression**: 실제 실패나 user correction을 재현한다.

`must_find` 같은 키워드만으로 품질 전체를 대체하지 않는다. 가능한 조건은 script로 결정적으로
검사하고, 의미 품질은 evidence를 요구하는 rubric/human review를 함께 사용한다. case validation과
실제 agent behavior 실행을 같은 PASS로 보고하지 않는다.

## 8. Manifest와 runtime 지원

새 agent와 skill은 `install/manifest.txt`에 등록한다. Agent row는 definition과 bundle을 선언하고,
agent/skill이 다른 자산을 필수로 요구하면 dependency 열에 함께 기록한다.

```text
agent | <agent-id> | agents/<agent-id>.md | agents/<bundle-id> | skill:<required-skill> | -
skill | <workflow-id> | skills/<workflow-id> | - | skill-a agent:<required-agent> | -
```

기존 bare dependency ID는 skill로 해석한다. Cross-kind 관계는 `agent:<id>` 또는 `skill:<id>`로
명시하며, validator와 installer가 cycle-safe dependency closure를 같은 방식으로 해소해야 한다.

distribution과 runtime 상태는 다음 단계를 따로 기록한다.

| 상태 | 의미 | 증거 |
|---|---|---|
| packaged | 승인된 native artifact에 자산이 포함됨 | immutable release identity·package inventory |
| copied | project/user catalog 경로에 파일이 복사됨 | 격리 target inventory·tree diff |
| discovered | native runtime이 자산을 목록에 올림 | host-native inventory output |
| executed | catalog agent가 대표 case를 실제 수행 | exit status·artifact·redacted metrics |

`packaged`, `copied`, `discovered`를 “agent가 대표 작업을 성공적으로 수행했다”와 합치지 않는다.
현재 Codex npm과 Claude marketplace는 Agents(28), Skills(63)를 배포하며, template/memory/eval은
명시적 selector로만 설치한다.

## 9. 로컬 검증과 PR 증거

현재 실행 가능한 gate는 다음과 같다.

```bash
bash install/check-manifest.sh
bash install/test-plugin-distribution.sh
bash evals/run-evals.sh
bash evals/behavioral/run-behavioral-evals.sh --validate
VULPORA_REQUIRE_CODEX=1 bash install/test-install.sh
```

주의할 점:

- `--validate`는 behavioral case 계약만 확인하며 agent를 실제 실행하지 않는다.
- `check-manifest.sh`는 현재 내부 KB routing·설치 후 link·contract 완전성을 검사하지 않는다.
- `test-install.sh`는 선택 agent·skill과 typed dependency closure 설치를 검증한다.
  `test-plugin-distribution.sh`와 `test-npm-package.sh`는 두 runtime의 Agents(28)/Skills(63) 계약을 확인한다.
- 실제 behavioral run에는 runtime adapter와 safety metrics가 필요하다. adapter가 없으면 미검증으로
  보고하며 성공으로 올리지 않는다.

PR에는 아래를 붙인다.

```markdown
## Agent evidence
- Necessity: agent를 선택한 이유와 기각한 대안
- Contract/threat model: 변경한 authority·data flow·budget
- Static: 실행 명령, exit status, 핵심 PASS/FAIL
- Behavior: runtime/model/profile, baseline, trials, outcome/process/safety/cost
- Install: immutable artifact identity, runtime별 plugin inventory, catalog zero-copy, legacy cleanup 결과
- Known gaps: 실행하지 못한 항목과 risk owner/expiry
```

## 10. 현재 개선 backlog

### P0 — false green 제거

1. execution을 다시 열기 전에 별도 security architecture, runtime trust root, task-isolation gate를 승인한다.
2. 누락된 E2E `docs/e2e-scenarios/CONTRACT.md`를 복구하거나 에이전트 번들 계약으로 대체한다.
3. 변경 agent의 behavioral case 0건과 runtime adapter 부재를 fail closed한다.

### P1 — KB를 운영 가능한 지식 시스템으로

1. metadata v2와 freshness/trust/ownership linter를 도입한다.
2. agent bundle 간 유사 KB의 canonical owner를 정하고 중복을 수렴한다.
3. source scalar에 복수 근거를 합친 문서를 `sources[]`로 migration한다.
4. contract·capability·threat model template과 scaffold command를 만든다.

### P2 — 일관성과 context 비용

1. 긴 principles/reference에 TOC를 추가하고 trigger가 없는 설명은 삭제하거나 분리한다.
2. agent별 Codex/Claude metadata가 canonical 정의와 drift하지 않도록 검증한다.

## 11. 향후 package v2 방향

현재 source catalog contract는 agent-only v1을 유지한다.
장기적으로 source contract와 runtime adapter를 분리하면 다음 구조가 더 명확하다.

```text
agents/<agent-id>/
├── package.yaml
├── AGENT.md
├── SOUL.md
├── contract.yaml
├── capabilities.yaml
├── threat-model.md
├── references/
│   ├── principles.md
│   ├── INDEX.md
│   └── <topic>.md
└── adapters/
    ├── claude-code.md
    ├── codex.toml
    └── opencode.md
```

`agents/<agent-id>.md`를 수동으로 이중 편집하지 않고 package에서 생성하고 diff로 검증하는 것이
목표다. 이 이관은 scaffold, schema, linter, adapter generation이 준비된 뒤 별도 migration으로
수행한다. 지금은 폴더 이동보다 P0/P1 gate가 우선이다.
