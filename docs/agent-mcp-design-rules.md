# Agent/MCP 설계 규칙

상태: **Canonical v1**
기준일: **2026-07-14**
프로덕션 프로토콜 기준: **MCP 2025-11-25 stable**

이 문서는 Vulpora에서 에이전트, 하네스, MCP 서버를 설계하거나 변경할 때 적용하는
규범 문서다. 최신 공식 사양과 2025~2026년 운영·보안 연구를 설계 규칙으로 변환했다.
생성부터 설치·운영·개선까지의 gate와 현재 구현 성숙도는
[Agent Lifecycle 성숙도와 Feedback Loop](agent-lifecycle-assessment-and-feedback-loop.md)를 따른다.

규범 용어는 다음처럼 사용한다.

- **MUST / MUST NOT**: 병합 전 반드시 충족한다.
- **SHOULD / SHOULD NOT**: 따르지 않으면 PR에 이유와 대체 통제를 기록한다.
- **MAY**: 상황에 따라 선택한다.

MCP 공식 사이트는 2025-11-25를 최신 안정판으로 표시한다. 2026 roadmap에서 논의 중인
stateless session, extension 체계, Tasks 재설계는 아직 이 문서의 프로덕션 기준과 섞지
않는다. draft 실험은 별도 feature flag와 compatibility profile에서만 수행한다.

## 1. 한 문장 원칙

> 에이전트는 판단하고, 하네스는 정책을 집행하며, MCP 서버는 좁은 capability를 제공한다.
> 권한·자격증명·감사·격리는 모델의 선의가 아니라 결정적 시스템 경계가 보장한다.

이를 12개 규칙으로 고정한다.

1. **프로토콜은 신뢰 경계에 맞춰 고른다.** MCP를 모든 에이전트 통신에 쓰지 않는다.
2. **에이전트는 페르소나가 아니라 실행 계약이다.** 입력, 권한, 출력, 중단, 검증을 명시한다.
3. **한 실행에는 하나의 primary loop authority만 둔다.**
4. **도구는 agent/run 단위 allowlist로 최소 노출한다.** 모든 MCP를 항상 켜지 않는다.
5. **외부 content와 MCP metadata는 데이터이지 지시나 권한 증명이 아니다.**
6. **모델 가드와 승인 UI보다 먼저 sandbox·filesystem·network·credential 경계를 세운다.**
7. **brain, hands, session, secrets를 분리한다.**
8. **사용자, 에이전트, tenant, delegated scope의 연결을 호출 끝까지 보존한다.**
9. **입력·출력·시간·비용·병렬성·결과 크기를 모두 제한한다.**
10. **부작용은 명시하고 exact action을 승인받으며, 안전하지 않은 재시도를 금지한다.**
11. **도구 정의·버전·권한이 변하면 신규 capability로 재심사한다.**
12. **완료 선언은 outcome, trace, adversarial eval을 모두 통과한 뒤에만 한다.**

## 2. 최근 해외 설계 흐름과 이 문서의 결정

| 최근 흐름 | 1차 근거 | Vulpora의 결정 |
|---|---|---|
| 프로토콜 역할 분화 | MCP는 host-client-server 도구/맥락 연결, [A2A 1.0](https://a2a-protocol.org/v1.0.0/specification/)은 독립 에이전트 협업, [ACP v1](https://agentclientprotocol.com/protocol/v1/overview)은 agent-client/IDE 연결, [Agent Skills](https://agentskills.io/specification)는 절차 지식 패키징을 맡는다. | 경계별 프로토콜 선택표를 강제한다. |
| 안정판과 실험 기능의 분리 | [MCP 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25)가 최신 stable이고, [Tasks는 experimental](https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/tasks)이다. [2026 roadmap](https://blog.modelcontextprotocol.io/posts/2026-mcp-roadmap/)도 retry·expiry가 미완성임을 밝힌다. | stable profile을 기본으로 하고 draft/Tasks는 격리한다. |
| annotation에서 enforcement로 | MCP maintainers는 [tool annotation은 거짓일 수 있고 enforcement가 아니라고 명시](https://blog.modelcontextprotocol.io/posts/2026-03-16-tool-annotations/)한다. | hint는 UX 입력일 뿐 권한 판단 근거로 쓰지 않는다. |
| 승인 중심에서 containment 중심으로 | Anthropic은 [반복 승인으로 사용자가 무감각해지고, 결정적 환경 경계가 필요](https://www.anthropic.com/engineering/how-we-contain-claude)하다고 보고했다. | human approval은 defense-in-depth이며 sandbox를 대체하지 않는다. |
| brain-hands-session 분리 | [Managed Agents 설계](https://www.anthropic.com/engineering/managed-agents)는 harness, sandbox, append-only session을 분리하고 credential을 외부 vault에 둔다. | Vulpora 하네스도 이 네 경계를 독립 인터페이스로 둔다. |
| agent identity·delegation·provenance | [NIST agent identity concept paper](https://www.nccoe.nist.gov/sites/default/files/2026-02/accelerating-the-adoption-of-software-and-ai-agent-identity-and-authorization-concept-paper.pdf)는 human/agent 식별, 위임, 행동 귀속, data provenance를 핵심으로 둔다. | 모든 호출에 human subject와 non-human actor를 함께 기록한다. |
| 조합 공격의 증가 | 실증 연구는 [tool poisoning·puppet·rug pull·외부 resource 공격](https://arxiv.org/abs/2506.02040), [31개 MCP 공격 변형과 shared-context chain attack](https://arxiv.org/abs/2508.12538), [다중 도구 분산 poisoning](https://arxiv.org/abs/2606.27027)을 보였다. | 서버 하나가 아니라 동시 활성화된 tool set 전체를 적대적으로 평가한다. |
| outcome + trajectory eval | [Anthropic의 agent eval 지침](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)은 최종 상태와 transcript/tool call을 함께, 여러 trial로 평가한다. | deterministic outcome gate와 behavior/trace gate를 분리한다. |

학술 preprint는 위협 가설과 적대적 테스트를 만드는 근거로만 쓴다. 프로토콜 적합성은 공식
stable specification, 보안 통제는 공식 MCP 지침·NIST·OWASP를 우선한다.

## 3. 프로토콜과 자산의 경계

| 문제 | 기본 선택 | 쓰지 말아야 할 대체 |
|---|---|---|
| 저장소 범위의 상시 지침 | AGENTS.md | MCP prompt에 운영 규칙 숨기기 |
| 재사용 절차·전문 지식·스크립트 | Agent Skills | 권한을 skill 본문으로 부여하기 |
| 같은 하네스 안의 specialist 실행 | native subagent / handoff / agent-as-tool | 불필요한 network protocol |
| 독립 배포·독립 운영되는 에이전트 간 discovery·delegation·artifact 교환 | A2A | MCP tool을 원격 에이전트처럼 위장하기 |
| 에이전트와 IDE·UI·클라이언트의 session·stream·permission UX | ACP 또는 해당 runtime API | MCP와 ACP를 한 socket/역할로 합치기 |
| host와 외부 tool·resource·prompt provider 연결 | MCP | agent-to-agent orchestration 전체를 MCP server에 넣기 |
| 한 프로세스 안의 단순 함수 호출 | runtime-native function tool | 상호운용 필요가 없는 MCP server 추가 |

추가 규칙:

- Agent Skills는 **지식과 절차**를 제공할 뿐 권한을 부여하지 않는다.
- A2A Agent Card의 AgentSkill capability metadata와 Agent Skills의 SKILL.md package는
  이름만 비슷한 별도 객체다. 자동 호환을 가정하지 않는다.
- MCP sampling은 server가 client 모델 사용을 요청하는 기능이지 독립 에이전트 identity나
  delegation protocol이 아니다.
- MCP Tasks는 durable request wrapper이지 조직 간 agent collaboration contract가 아니다.
- 같은 하네스 안에서는 native primitive가 더 작고 검증 가능하면 그것을 우선한다.

프로덕션 baseline은 MCP 2025-11-25, A2A 1.0.0, ACP major v1이다. Agent Skills와
AGENTS.md는 living format이므로 사용한 validator·discovery rule의 버전을 test log에 남긴다.

## 4. 기준 아키텍처

~~~mermaid
flowchart TB
    U[User] --> C[Client / IDE / UI]
    C <-->|ACP 또는 runtime API| H

    subgraph H[Host / Harness - policy owner]
      I[AGENTS.md + Skill registry]
      O[Orchestrator / primary loop]
      P[Policy gateway\nallowlist · approval · budget · DLP]
      S[Append-only session / state]
      M[Memory with provenance]
      V[Trace · eval · audit]
      I --> O
      O --> P
      O <--> S
      O <--> M
      P --> V
    end

    O <-->|native handoff| N[Same-harness subagent]
    O <-->|A2A only across independent boundary| A[Independent agent]
    P --> MC[MCP client per server]
    MC --> MS1[Narrow MCP server A]
    MC --> MS2[Narrow MCP server B]
    MS1 --> R1[Resource / API]
    MS2 --> R2[Resource / API]
    P --> X[Sandboxed execution hands]
    K[Credential broker / vault] --> P
    K --> MS1
    K --> MS2
    K -. secrets never enter .-> X
    K -. secrets never enter .-> O
~~~

### 4.1 계층별 책임

| 계층 | 소유 책임 | 소유하지 않는 책임 |
|---|---|---|
| Instruction | repo 지침, role, skill, 우선순위 | runtime 권한 부여 |
| Reasoning | 계획, 선택, 위임, 결과 합성 | credential 보관, 강제 격리 |
| Control | tool allowlist, authz, approval, budget, egress, DLP | 업무 추론 |
| Action | MCP/tool 실행, sandboxed code, external API | 전체 대화와 cross-server 정책 |
| State | append-only event, checkpoint, scoped memory | 암묵적 권한 승계 |
| Assurance | trace, audit, eval, recovery, rollback | 모델의 자기 보고만으로 성공 판정 |

Host/harness는 사용자 동의, cross-server aggregation, 정책, 비용, 전체 session을 소유하는
유일한 enforcement point여야 한다. MCP server는 자기 도메인의 최소 capability와 그
실행 안전성만 책임진다.

## 5. Agent 계약

새 agent 또는 실질적으로 변경된 agent는 다음 항목을 문서에 가져야 한다.

| 필드 | 필수 내용 |
|---|---|
| Identity | 안정적인 id, 한 문장 목적, 소유 도메인 |
| Inputs | 필요한 입력, 신뢰 수준, 누락 시 행동 |
| Outputs | 산출물, schema/format, 근거·provenance 요구 |
| Authority | 허용 capability, resource scope, side-effect 등급 |
| Prohibitions | 금지 action, 접근 금지 데이터, 권한 확대 금지 |
| Delegation | 누구에게 무엇을 넘길 수 있는지, 권한 상한 |
| State | session/memory read-write 범위, retention, redaction |
| Stop conditions | 완료, 실패, 취소, escalation 조건 |
| Budget | tool calls, wall-clock, token/cost, parallelism 상한 |
| Verification | outcome 검사, process/safety 검사, 필요한 eval |

### 5.1 오케스트레이션 규칙

1. 한 run에는 **하나의 primary loop authority**만 둔다.
2. subagent는 objective, 입력, 출력 형식, source/tool 제한, 범위, stop condition, budget이
   있는 bounded task만 받는다.
3. subagent는 leader의 권한보다 넓은 tool, credential, resource scope를 상속하거나
   스스로 요청할 수 없다.
4. 병렬화는 독립 작업에만 쓴다. 같은 state를 mutate하는 작업은 serialize하거나
   optimistic concurrency/version check를 사용한다.
5. handoff는 전체 transcript 복사보다 versioned artifact와 최소 provenance를 우선한다.
6. 다른 agent의 결과는 trusted instruction이 아니라 untrusted candidate result로
   검증한 뒤 합성한다.
7. agent가 “완료”라고 말한 사실은 증거가 아니다. host가 outcome을 독립 검사한다.

## 6. MCP server와 primitive 계약

### 6.1 Server 경계

MCP server는 다음을 **MUST** 만족한다.

- 하나의 명확한 도메인 책임과 최소 upstream 권한을 가진다.
- 전체 대화, 다른 MCP server의 credential/session/context를 읽지 않는다.
- business orchestration과 사용자 최종 의사결정을 host로 돌려보낸다.
- server identity, version, source/publisher, transport, auth profile, 제공 primitive,
  data classification, side-effect 등급을 선언한다.
- 설치 시 실행할 정확한 command/artifact와 dependency lock을 검토 가능하게 한다.

여러 도메인과 광범위한 credential을 한 프로세스에 모은 mega-server는 기본 금지다.
공유해야 한다면 내부 service boundary와 per-tool authorization이 독립적으로 검증되어야 한다.

### 6.2 Portability profile

“MCP 지원”이라는 한 문장으로 호환성을 주장하지 않는다. server와 adapter는 지원 profile을
명시한다.

- **Portable remote tools**: Streamable HTTP, tools, strict allowlist, remote auth.
  OpenAI와 Anthropic hosted connector의 공통분모로 우선 검증한다.
- **Full MCP**: stdio, resources, prompts, sampling/elicitation 등 실제 client가 지원하는
  capability를 개별 표시한다.
- **Experimental**: Tasks와 draft revision 기능은 별도 profile과 feature flag에 둔다.

[OpenAI Agents SDK](https://openai.github.io/openai-agents-python/mcp/)는 hosted/local MCP와
tool filter·approval을 폭넓게 지원하지만, [Anthropic direct connector](https://platform.claude.com/docs/en/agents-and-tools/mcp-connector)는
remote tool 중심의 별도 지원 범위를 가진다. 따라서 한 runtime에서 연결됐다는 사실을
다른 runtime의 resources/prompts/stdio 호환 근거로 쓰지 않는다.

### 6.3 Primitive 선택

[MCP server primitives](https://modelcontextprotocol.io/specification/2025-11-25/server)는
제어 주체가 다르다.

| Primitive | 제어 주체 | 사용 기준 | 필수 안전 규칙 |
|---|---|---|---|
| Prompt | user-controlled | 사용자가 명시적으로 고르는 template/workflow | 자동 주입 금지, 내용·인자 untrusted 처리 |
| Resource | application-controlled | 읽을 context/data와 URI | URI·권한 매번 검증, pagination/size cap |
| Tool | model-controlled | 계산 또는 외부 action | input/authz/output/timeout/audit |
| Sampling | client-controlled | server가 client 모델 호출을 요청 | 사용자 거부권, prompt review, iteration/cost cap |
| Elicitation | user input | server가 추가 정보를 요청 | requester 표시, decline/cancel, schema validation |
| Root | client-provided scope hint | filesystem 작업 범위 전달 | canonical path + OS sandbox 별도 강제 |
| Task | experimental durable wrapper | 장기 실행·polling이 꼭 필요 | feature flag, auth binding, TTL/rate/concurrency |

정적이거나 읽기 중심인 context를 억지로 side-effect tool로 만들지 않는다. 반대로 시점에
따라 값이 바뀌거나 권한 검사·계산이 필요한 조회는 read-only tool이 적합할 수 있다.

### 6.4 Tool 계약

모든 tool은 다음을 **MUST** 만족한다.

- 이름은 server 안에서 유일하고 안정적이어야 한다. host는 stable server identifier를
  붙여 cross-server collision을 제거한다. serverInfo.name만으로 전역 유일성을 가정하지 않는다.
- 설명은 목적, 언제 쓰는지, 언제 쓰지 않는지, 읽고 쓰는 대상, 외부 전송, 비용,
  사전 조건, 주요 실패를 명시한다.
- input은 strict JSON Schema로 검증한다. 가능한 경우 additionalProperties를 거부하고
  enum, 길이, 범위, format, 최대 배열 크기를 둔다.
- authorization은 schema validation과 별개로 operation/resource/tenant 단위에서 재검사한다.
- downstream이 소비할 결과는 outputSchema + structuredContent를 제공하고 양쪽에서 검증한다.
- 결과에는 크기·row·page·MIME 제한을 두고, secret·PII·instruction-like content를
  model context에 넣기 전에 검사한다.
- 업무·입력 오류는 model이 수정할 수 있는 tool execution error로, protocol 위반은
  JSON-RPC protocol error로 구분한다. 내부 stack, SQL, host, credential은 redact한다.
- read-only, destructive, idempotent, open-world annotation은 사실대로 쓰되 **hint**로만 취급한다.
- timeout, cancellation, absolute deadline, rate limit, concurrency limit을 둔다.
- mutating tool은 idempotency key, preview/dry-run, undo/rollback 중 가능한 통제를 제공한다.

자동 retry는 read-only이거나 검증된 idempotent operation에만 허용한다. timeout 뒤 결과를
모르는 mutating call을 재시도해서는 안 된다.

## 7. Lifecycle·transport·authorization

### 7.1 Stable lifecycle

- 2025-11-25 profile은 initialize → response → notifications/initialized 순서를 지킨다.
- 양쪽은 protocol version과 capability를 협상하고, 협상된 capability만 사용한다.
- 호환 버전이 없으면 연결을 종료한다.
- 모든 request는 configurable timeout과 cancellation을 가져야 하며, progress가 와도
  absolute maximum deadline은 유지한다.
- reconnect, SSE resume, notification loss, duplicate/reordered delivery를 가정한다.
  정확성이 notification 하나에 의존해서는 안 된다.

### 7.2 stdio

- local stdio server는 MCP 설정 파일이 아니라 **실행되는 로컬 코드**로 위협 모델링한다.
- parent가 pinned artifact를 직접 실행하고 filesystem, process, network를 sandbox한다.
- stdout에는 MCP message 외 어떤 출력도 쓰지 않고 log는 stderr로 보낸다.
- credential은 committed config나 prompt가 아니라 OS credential store, vault, 또는
  최소 범위 환경 주입으로 제공한다.
- production에서 검증되지 않은 package를 매 실행마다 내려받는 command를 사용하지 않는다.

### 7.3 Streamable HTTP

- production은 HTTPS와 인증을 사용한다.
- server는 Origin을 검증하고, local server는 기본적으로 localhost에만 bind한다.
- authorization server discovery와 redirect URL을 SSRF 입력으로 취급한다.
- DNS resolve 결과, private/link-local/metadata IP, redirect hop을 매번 검증하고
  임의 URL fetch를 허용하지 않는다.
- session id는 인증 수단이 아니다. session/task/elicitation state는 검증된
  subject + tenant + resource authorization context에 묶는다.

### 7.4 OAuth와 credential

[MCP Authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)과
[Security Best Practices](https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices)를
다음처럼 적용한다.

- remote client는 authorization/token 요청에 RFC 8707 resource를 넣는다.
- server는 issuer, audience/resource, signature, expiry, scope를 검증한다.
- client는 PKCE S256, exact redirect URI, state 검증, secure token storage를 사용한다.
- MCP server는 inbound bearer token을 downstream API로 전달하지 않는다.
- downstream API에는 server가 별도 client로 얻은 별도 audience-bound token을 쓴다.
- scope는 최소로 시작하고 bounded step-up만 허용한다.
- token, API key, auth code, payment credential을 URI, prompt, resource, tool output,
  log에 넣지 않는다.
- credential은 model과 code sandbox가 읽을 수 없는 broker/vault 경계에 둔다.

## 8. Trust·security 불변식

### 8.1 신뢰 분류

| 입력 | 기본 신뢰 |
|---|---|
| system/developer/repo policy | trusted control, 단 source/version 검증 |
| 사용자 요청 | authorized intent 후보, 실제 권한과 별개 |
| agent/subagent 출력 | untrusted proposal |
| MCP title/description/schema/annotation/instructions | untrusted metadata |
| resource, prompt body, tool result, web/file/DB content | untrusted data |
| model-generated tool arguments | untrusted input |
| server/session/task id | opaque identifier, 권한 증명 아님 |

untrusted data 안의 “ignore”, “call this tool”, “send this secret” 같은 문장은 지시로 승격하지
않는다. prompt injection 탐지 모델은 보조 통제일 뿐이며, 실패해도 데이터 유출이나 권한
확대가 일어나지 않도록 control plane이 막아야 한다.

### 8.2 반드시 지킬 hard controls

1. per-agent, per-run, 가능하면 per-task tool allowlist를 사용한다.
2. local server와 generated code는 sandbox에서 실행하고 file/network/process를 각각 제한한다.
3. Roots나 annotation을 sandbox·authorization으로 간주하지 않는다.
4. path는 symlink를 해석한 canonical target을 경계와 비교한다.
5. egress allowlist는 domain 목록이 아니라 method, path, account, credential, data class까지
   포함한 capability grant로 취급한다.
6. tool schema/manifest의 publisher, version, digest를 기록하고 변경 시 실행 전에 재심사한다.
7. untrusted content가 MCP server 설치나 permission 확대를 자동으로 트리거하게 하지 않는다.
8. 서로 다른 tenant, user, session, task의 state를 논리·저장·cache 계층에서 격리한다.
9. credential은 agent context, sandbox, artifact, raw trace에 노출하지 않는다.
10. kill, cancel, revoke, token rotation, server disable 경로를 운영자가 즉시 실행할 수 있어야 한다.
11. sensitive source에서 external/write sink로 가는 server 간 데이터 흐름은 taint와 목적을
    추적하고, 필드·대상별 DLP/승인이 없으면 차단한다.
12. identity, policy, schema, approval, audit backend가 불명확하거나 timeout이면 mutation과
    external sink는 fail closed한다.

### 8.3 승인 등급

반복 승인은 approval fatigue를 만들므로 모든 call을 같은 팝업으로 처리하지 않는다.
대신 hard boundary 안에서 risk별 정책을 쓴다.

| 등급 | 예 | 승인 정책 |
|---|---|---|
| R0 | trusted closed-world, 비민감 read | 좁은 scope의 사전 승인 가능, 호출은 감사 |
| R1 | 민감 read 또는 open-world retrieval | server/tool/data scope를 명시한 session 승인, output inspection |
| R2 | 되돌릴 수 있는 write·외부 전송 | exact arguments·target·diff/preview를 per-call 승인, idempotency/rollback |
| R3 | 삭제, 금융, 권한 변경, credential, prod exec, 대량 외부 전송 | 기본 거부, 강한 재인증/명시 승인, batch·blind delegation 금지 |

승인은 server identity, tool, normalized arguments, target, data class, expiry에 묶는다. 이 중
하나라도 바뀌면 기존 승인을 재사용하지 않는다.

### 8.4 위협과 필수 방어

| 위협 | 필수 방어 |
|---|---|
| Tool poisoning / malicious result | metadata와 result를 untrusted 처리, output inspection, policy gateway |
| Rug pull / supply chain | publisher·version·digest pin, schema diff, 변경 시 재승인 |
| Tool shadowing / name collision | stable server namespace, cross-server tool-set 검사 |
| Confused deputy | verified subject/tenant, per-client consent, resource-bound token |
| Token passthrough | inbound/outbound token 분리, audience 검증 |
| SSRF / DNS rebinding | Origin, URL/DNS/redirect 검증, private/metadata network 차단 |
| Path traversal / symlink escape | canonicalization 후 allowlist, OS/container mount |
| Data exfiltration | data classification, egress capability, exact target approval, DLP |
| Replay / duplicate side effect | idempotency key, nonce/version, reconciliation |
| Approval fatigue | risk tier, preview, sandbox, blanket auto-approve 금지 |
| Memory/state poisoning | provenance, quarantine, scope/TTL, promotion eval |
| Multi-tool composition attack | 활성 tool set 전체의 taint·egress·collision adversarial eval |

## 9. Sampling·elicitation·Tasks

- Sampling은 client가 model, prompt, permission, cost를 최종 통제한다.
- sampling과 nested tool loop에는 iteration, token, wall-clock, cost, parallelism 상한을 둔다.
- includeContext의 deprecated 경로에 의존하지 않고 필요한 context를 명시적으로 최소화한다.
- form elicitation으로 password, API key, access token, auth code, payment credential을
  요청하지 않는다.
- 민감한 입력은 URL mode를 사용하고 full URL/domain 표시, explicit consent, no-prefetch,
  secure external browser, initiator/completer identity binding을 적용한다.
- Tasks는 별도 experimental profile에서만 활성화한다.
- Task ID는 cryptographically random이어야 하고 authorization context에 bind한다.
- TTL, terminal-state immutability, concurrency/rate limit, poll fallback, cancel, tenant-isolated
  list/get/result를 검증한다.

## 10. Observability와 eval

### 10.1 Audit event

모든 MCP call과 agent handoff는 최소한 다음을 기록한다.

- timestamp, trace/correlation id
- human subject, agent/service actor, tenant, session
- server identity/version/digest, tool name
- redacted arguments 또는 canonical arguments hash
- target/resource/data classification
- authorization과 approval decision/policy version
- outcome, error class, latency, retry/cancel 여부
- input/output artifact provenance

secret과 raw sensitive payload는 기본적으로 기록하지 않는다. raw transcript는 목적과 보존
기간이 명시된 격리 저장소가 아니면 영구 보존하지 않는다.

### 10.2 Release gate

새 agent/MCP 또는 권한·schema·transport 변경은 아래를 통과해야 한다.

**Protocol**

- version negotiation과 capability matrix
- list/read/call pagination과 strict schema
- protocol error와 tool execution error 분리
- stdio stdout purity 또는 HTTP Origin/TLS/auth
- timeout, cancel, reconnect, duplicate/replay

**Security**

- least-privilege credential과 per-resource authorization
- token audience와 no-passthrough
- malicious description/schema/result prompt injection
- tool name collision, schema drift, rug pull
- SSRF, redirect, DNS rebinding, traversal, symlink
- secret/error/log redaction
- approval binding과 missing-approval deny
- cross-tenant session/task/result 접근 차단
- output/row/page/size/rate/concurrency/cost cap
- 여러 server/tool을 함께 켠 composition test
- 민감 source에서 external sink로 이어지는 2-hop/3-hop toxic-flow test

**Behavior**

- deterministic final-state assertion
- process/safety assertion on trace and tool arguments
- multiple trials for non-deterministic behavior
- model/runtime upgrade regression
- failure injection, resume/reconciliation, rollback

P0 MUST 항목 하나라도 실패하면 merge/release하지 않는다. 예외는 owner, 만료일, 보완 통제,
재검증 조건을 기록한 time-bounded risk acceptance가 있을 때만 허용한다.

## 11. PR 설계 체크리스트

PR 본문에 아래 답을 남긴다.

1. 이 기능은 왜 agent, skill, native tool, MCP, A2A, ACP 중 이 경계여야 하는가?
2. primary loop authority와 policy enforcement point는 어디인가?
3. agent가 실제로 필요한 최소 tool/resource/credential scope는 무엇인가?
4. 입력과 출력 중 무엇이 untrusted이며 어디서 검증·redact되는가?
5. read/write, external egress, destructive, idempotent, open-world 등급은 무엇인가?
6. credential이 model/sandbox/session log에 들어가지 않는가?
7. timeout, cancel, retry, duplicate, partial failure의 의미가 정의됐는가?
8. tool/server definition 변경을 어떻게 탐지하고 재승인하는가?
9. outcome, trace, adversarial composition을 어떤 eval이 증명하는가?
10. 감사 event로 누가 무엇을 누구 권한으로 했는지 재구성할 수 있는가?

## 12. 현재 nl-sql MCP 기준선 감사

이 평가는 코드 변경 요구가 아니라 새 규칙 적용 시점의 gap inventory다.

### 이미 맞는 점

- 자연어→SQL 판단은 호출 agent가 하고 MCP는 schema와 guarded execution만 제공한다.
- stdio 단일 도메인 server이며 stdout과 stderr를 구분한다.
- parameter binding, row/cell cap, DB statement/request timeout, static guard, read-only
  transaction/role을 겹쳐 쓴다.
- MSSQL의 hard read-only 부재를 숨기지 않고 read-only login을 필수로 고지한다.

### 규칙 충족 전 보완할 점

| 우선순위 | Gap | 근거 |
|---|---|---|
| P0 | allowedSchemas가 list/search filter에는 쓰이지만 list_tables, describe_table, run_select의 실제 schema authorization boundary는 아니다. | DB role을 최소 권한으로 강제하고 모든 entry point에서 schema를 재검사해야 한다. |
| P0 | DB/driver error message를 그대로 tool output과 stderr에 반환할 수 있다. | 내부 object/host/query detail redaction과 stable error code가 필요하다. |
| P0 | package test script와 automated MCP/security regression suite가 없다. | guard, schema scope, protocol, injection, redaction 테스트가 merge gate여야 한다. |
| P1 | 결과가 text-only이고 outputSchema/structuredContent가 없다. | machine-consumed schema·query 결과에 structured output을 제공해야 한다. |
| P1 | tool annotation과 명시적 risk metadata가 없다. | read-only hint를 추가하되 runtime enforcement와 별개로 검증해야 한다. |
| P1 | MCP cancellation/absolute deadline과 rate/concurrency limit이 없다. | DB timeout 외에도 host 요청 수명과 서버 자원 budget을 강제해야 한다. |
| P1 | per-call trace/audit id와 redacted audit event가 없다. | actor/tool/target/outcome을 연결할 수 없다. |
| P1 | package version 0.1.0과 server-reported version 0.2.0이 다르다. | identity/compatibility/audit 기준을 하나로 맞춰야 한다. |
| P1 | protocol version/support matrix가 문서화되지 않았다. | MCP stable profile과 SDK compatibility를 contract test로 고정해야 한다. |

따라서 현재 nl-sql은 “경계와 read-only 방어 방향은 적합”하지만, 이 문서 기준의
**full compliant** 표시는 위 P0가 해결되고 release gate가 생긴 뒤에만 사용한다.

## 13. 출처와 갱신 정책

### Normative / official

- [MCP 2025-11-25 specification](https://modelcontextprotocol.io/specification/2025-11-25)
- [MCP architecture](https://modelcontextprotocol.io/specification/2025-11-25/architecture)
- [MCP lifecycle](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle)
- [MCP transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
- [MCP authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
- [MCP tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)
- [MCP resources](https://modelcontextprotocol.io/specification/2025-11-25/server/resources)
- [MCP prompts](https://modelcontextprotocol.io/specification/2025-11-25/server/prompts)
- [MCP roots](https://modelcontextprotocol.io/specification/2025-11-25/client/roots)
- [MCP sampling](https://modelcontextprotocol.io/specification/2025-11-25/client/sampling)
- [MCP elicitation](https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation)
- [MCP Tasks](https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/tasks)
- [MCP security best practices](https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices)
- [A2A 1.0.0 specification](https://a2a-protocol.org/v1.0.0/specification/)
- [Agent Client Protocol v1](https://agentclientprotocol.com/protocol/v1/overview)
- [Agent Skills specification](https://agentskills.io/specification)
- [AGENTS.md open format](https://agents.md/)

### Security / operations

- [NIST AI Agent Standards Initiative](https://www.nist.gov/artificial-intelligence/ai-agent-standards-initiative)
- [NIST agent identity and authorization concept paper](https://www.nccoe.nist.gov/sites/default/files/2026-02/accelerating-the-adoption-of-software-and-ai-agent-identity-and-authorization-concept-paper.pdf)
- [OWASP MCP Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/MCP_Security_Cheat_Sheet.html)
- [OpenAI Agents SDK MCP guide](https://openai.github.io/openai-agents-python/mcp/)
- [Anthropic: How we contain Claude](https://www.anthropic.com/engineering/how-we-contain-claude)
- [Anthropic: Decoupling the brain from the hands](https://www.anthropic.com/engineering/managed-agents)
- [Anthropic: Multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)
- [Anthropic: Agent evals](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)

### Emerging research, non-normative

- [Beyond the Protocol: MCP attack vectors](https://arxiv.org/abs/2506.02040)
- [Systematic Analysis of MCP Security](https://arxiv.org/abs/2508.12538)
- [ShareLock multi-tool poisoning](https://arxiv.org/abs/2606.27027)
- [AgentRFC: protocol stack and composition safety](https://arxiv.org/abs/2603.23801)

이 문서는 MCP stable revision이 바뀌거나 A2A/ACP의 major version, Agent Skills spec,
Vulpora의 runtime adapter 권한 모델이 바뀔 때 갱신한다. draft 내용은 stable release와
SDK support가 확인되기 전까지 normative rule로 승격하지 않는다.
