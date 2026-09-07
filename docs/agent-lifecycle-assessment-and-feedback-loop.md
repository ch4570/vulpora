# Vulpora 성숙도 평가와 Agent Lifecycle Feedback Loop

상태: **Operational Standard v1 + Point-in-time Assessment**
기준일: **2026-07-16**
연결 규범: [Agent/MCP 설계 규칙](agent-mcp-design-rules.md), [STANDARD](../STANDARD.md),
[에이전트 구축과 KB 저작 가이드](agent-authoring-and-kb-guide.md)

이 문서는 두 가지를 함께 고정한다.

1. 최신 agent 설계·보안 방법론에 비추어 Vulpora이 **실제로 어디까지 구현되어 있는지** 평가한다.
2. agent 생성, 설계, 설치, 평가, 운영 피드백, 개선을 하나의 닫힌 lifecycle로 정의한다.

이 평가는 저장소 수준의 설계·구현 정렬 상태다. ISO/IEC 42001, SOC 2, 법규 적합성 같은
조직 단위 인증을 의미하지 않으며, Vulpora은 현재 **Agent/MCP security compliant** 또는
**production control plane complete**라고 표기해서는 안 된다.

> **2026-09-07 integration correction:** 현재 catalog는 Agent **28**, Skill **62**, behavioral case **163**, explicit required artifact **217**이다. 아래 25-agent/154-case 및 이전 수치는 당시의 평가 snapshot으로 보존한다. 최신 설치·release source·Linux/macOS CI 구성과 검증 범위는 [이슈 처리 기록](issue-resolution.md)과 [공개 체크리스트](public-release-checklist.md)를 따른다. CI 구성이나 정적 검증 통과는 실제 child 모델 실행·운영 격리·공개 승인 증거가 아니다.

> **2026-09-04 UTC (2026-09-05 KST) inventory correction:** 현재 `install/manifest.txt`는 Agent **25**, Skill **62**를 선언하고 behavioral catalog에는 **154** cases가 있다. manifest agent coverage는 **25/25**이며 `check-catalog-coverage.sh --strict`는 uncovered agent/unrecognized asset을 fail-closed로 막는다. GitHub Actions offline eval workflow는 structural eval, behavioral contracts, dry validation, strict coverage를 실행한다. behavioral `--validate`와 catalog coverage는 정적 증거이며, 이 수치는 live runtime execution 증거가 아니다. 아래의 16-agent/15-case 수치는 **historical snapshot**으로만 읽는다.

> **1.0.0 현재 구현 정정:** source와 두 runtime distribution은 Agents(16), Skills(0)이다.
> 이전 receipt가 소유한 미수정 Codex 스킬은 npm 업데이트에서 제거한다. 아래 0.3.x와
> `pre-0.3.1` 표시는 과거 snapshot이며 현재 기능 증거가 아니다.

## 1. 결론

Vulpora의 현재 위치는 다음과 같다.

> **좋은 전문 에이전트 자산 + 재현 가능한 최소 status package**이지만,
> **정책이 자동 집행되고 운영 증거가 개선으로 되돌아오는 AgentOps 폐루프**는 아직 아니다.

**pre-0.3.1 historical baseline:** 2026-07-15 종합 성숙도는 **M2 — Repeatable, 1.9/5**였다.
0.3.1의 fail-closed 축소 후 점수는 재산정하지 않았다. 이 숫자는 인증 점수나 현재 실행 기능 평가가 아니라
아래 저장소 전용 rubric의 과거 비교 기준이다.

| 영역 | 점수 | 실제 상태 |
|---|---:|---|
| 사용 사례·생성 결정 | 1.5/5 | agent가 필요한지 deterministic workflow가 나은지 판정하는 gate가 없다. |
| Agent 설계 계약 | 2.0/5 | 신규 Notion researcher 1개는 10개 필드를 채웠지만 기존 15개는 아직 migration 전이다. |
| 정적 품질·보안 | 2.0/5 | 평가 방법과 과거 스캔은 있으나 수동이며 현재 inventory 전체를 자동 차단하지 않는다. |
| 패키징·설치 | 3.8/5 | pre-0.3.1 점수. 현재는 all-scope zero-copy와 status-only prompt inventory로 축소됐다. |
| 행동 평가 | 2.5/5 | behavioral catalog coverage는 25/25이지만 기본 실행은 dry validation이며 live runtime·promotion trend evidence는 강제되지 않는다. |
| 운영 관측·피드백 | 1.0/5 | runtime trace/incident/user feedback을 표준 수집해 개선 후보로 만드는 경로가 없다. |
| 자동 집행 | 0.5/5 | offline CI는 structural eval, behavioral contract, 154-case dry validation, 25/25 strict coverage를 집행한다. live runtime eval·promotion evidence·release/install/security gate는 아직 선택 사항이거나 미연결이다. |

성숙도 단계는 다음 의미로 사용한다.

| 단계 | 의미 |
|---|---|
| M0 Ad hoc | 사람의 기억과 개별 실행에 의존한다. |
| M1 Defined | 문서와 형식은 있지만 실행 증거가 일관되지 않다. |
| M2 Repeatable | 로컬 절차와 테스트를 반복할 수 있으나 필수 gate는 아니다. |
| M3 Enforced | CI/runtime가 계약·권한·평가·설치 무결성을 자동 집행한다. |
| M4 Measured | 운영 SLI, regression trend, incident가 versioned improvement로 연결된다. |
| M5 Adaptive | 독립 검증을 통과한 개선만 안전하게 승격되고 효과·회귀를 지속 측정한다. |

## 2. 최신 방법론이 요구하는 것

### 2.1 Prompt engineering보다 lifecycle engineering

[OpenAI의 agent 구축 가이드](https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/)는
agent를 model, tools, instructions의 조합으로 보고, 먼저 agent가 필요한 문제인지 판단한 뒤
eval baseline과 layered guardrail을 추가하도록 권고한다. [Anthropic의 context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)은
긴 실행에서 prompt 한 장보다 system instruction, tool, MCP, external data, history를 매 turn
선별하는 전체 context lifecycle을 핵심 문제로 본다.

Vulpora은 이를 다음 규칙으로 적용한다.

1. 불확실한 다단계 판단이 필요하지 않으면 agent 대신 deterministic code, tool, skill을 쓴다.
2. agent 정의만 작성하지 않고 context source, tool surface, state, budget, stop condition을 함께 설계한다.
3. output 품질뿐 아니라 trajectory, tool argument, side effect, cost, safety를 검증한다.
4. 운영에서 발견된 실패는 prompt에 한 줄 추가하는 것으로 끝내지 않고 regression case로 먼저 고정한다.

### 2.2 Least privilege보다 더 좁은 least agency

[OWASP Top 10 for Agentic Applications 2026](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/)은
goal hijack, tool misuse, identity/privilege abuse, supply chain, unexpected code execution, memory
poisoning, insecure inter-agent communication, cascading failure, human trust exploitation, rogue agent를
핵심 위험으로 분류한다. 불필요한 autonomy 자체를 줄이는 **least agency**와 행동 관측성을 강조한다.

따라서 Vulpora에서 자연어 금지문은 보안 경계가 아니다. host/runtime가 command, path,
network, credential, data sink, deadline을 강제하고, agent는 그보다 넓은 권한을 얻을 수 없어야 한다.

### 2.3 Identity, delegation, trace가 1급 객체

[NIST AI Agent Standards Initiative](https://www.nist.gov/artificial-intelligence/ai-agent-standards-initiative)는
상호운용성뿐 아니라 agent authentication, identity, secure human-agent/multi-agent interaction,
security evaluation을 별도 축으로 둔다. 모든 실행은 최소한 human subject, agent/service actor,
delegated scope, active goal, policy version, tool action, outcome으로 재구성할 수 있어야 한다.

### 2.4 Eval은 출시 전 시험이 아니라 운영 루프

[Anthropic의 agent eval 지침](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)은
자동 eval, production monitoring, 주기적 human review를 함께 사용하고 비결정적 행동을 여러 trial로
측정하도록 권고한다. [NIST AI 800-2 draft](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.800-2.ipd.pdf)는
평가 목적·benchmark 선택, 실행, 분석·보고를 분리해 재현 가능한 증거로 남기는 방향을 제시한다.

Vulpora의 PASS는 앞으로 다음 세 층을 모두 의미해야 한다.

- **Artifact**: 구조, schema, reference, manifest, dependency가 유효하다.
- **Behavior**: 실제 runtime에서 outcome, process, safety, cost threshold를 통과한다.
- **Operation**: 설치된 권한 profile과 trace/incident/rollback 경로가 검증된다.

## 3. 우리가 실제로 하고 있는 것

### 3.1 Inventory

| 자산 | 현재 수 | 검증 범위 |
|---|---:|---|
| Agent definition | 16 | manifest 전부 등록, 신규 10-field 계약 완전 충족 1 |
| SOUL/reference bundle | 15 | directory 존재 검증, 내부 reference 정합성은 미검증 |
| Skill | 34 | manifest + frontmatter 구조 검사 |
| MCP server | 1 (`nl-sql`) | build/typecheck 가능, package 자체 test/security suite 없음 |
| Behavioral case | 154 | manifest agent 25/25 대상, 기본은 case schema dry validation |
| Memory/eval structural case | 12 | 설치/검색 trigger replay를 포함한 fixture 정합성 검사, 실제 runtime poisoning 방어 실행은 아님 |

### 3.2 현재 흐름

실선은 저장소에 구현된 경로, 점선은 사람의 선택에 의존하거나 끊어진 경로다.

~~~mermaid
flowchart LR
    S[요청 또는 아이디어] -. 수동 판단 .-> A[Agent/Skill 파일 직접 작성]
    A --> M[manifest 수동 등록]
    M --> C[check-manifest<br/>구조·의존성 검사]
    C --> I[test-install<br/>격리 설치 smoke]
    I --> R[project/HOME all-scope zero-copy<br/>user catalog asset 0]
    R --> V[verify<br/>status-only package 계약]

    A -. 선택 실행 .-> E[agent-eval / SkillSpector]
    A --> B[behavioral validate/run<br/>25/25 agent catalog coverage]
    B -. 기본은 실행 미수행 .-> H[사람이 결과 판독]
    V --> X[runner 호출 전부<br/>project_execution_disabled]
    X --> O[agent/catalog discovery·실행 금지<br/>Notion fixed no_evidence]

    O -. 표준 telemetry 없음 .-> F[사용자 피드백·실패]
    F -. 자동 intake 없음 .-> P[개선 proposal]
    P -. stale/missing 경로 .-> A

    classDef strong fill:#d7f5df,stroke:#198754,color:#102a18;
    classDef partial fill:#fff3cd,stroke:#b58100,color:#3d2d00;
    classDef gap fill:#f8d7da,stroke:#b02a37,color:#3d0b10;
    class C,I,R strong;
    class A,M,E,B,V,H partial;
    class O,F,P gap;
~~~

### 3.3 잘하고 있는 부분

- `install/manifest.txt`가 agent → bundle → skill dependency closure의 SSOT다.
- 설치기는 기본 dry-run이고 `--apply`, `--verify`를 분리한다. project와 exact HOME scope apply는
  모든 runtime에서 zero-copy이며 live onboarding을 수행하지 않는다.
- **pre-0.3.1 superseded:** 2026-07-16 이전의 16/16 Codex/Claude agent 호출, inline MCP, OAuth/search,
  process-isolated runner PASS 수치는 과거 실행 기록이다. 현재 지원 수준이나 회귀 기준이 아니다.
- 현재 회귀의 핵심은 native package의 status-only skill prompt entry가 2개이고
  Agents·Scripts·Hooks·MCP/catalog가 0인지, project/HOME에 파일이나 receipt가 복사되지 않는지,
  모든 runner 호출이 `project_execution_disabled`인지, Notion이 도구 호출 없이 고정 `no_evidence`를
  반환하는지다. prompt inventory는 discovery, agent execution 또는 live Notion access 증거가 아니다.
- agent가 SOUL, principles, KB, operational definition으로 나뉘고 file:line·공식 근거를 요구한다.
- behavioral harness는 raw transcript를 임시 보관하고 요약 metric·artifact hash만 남기며,
  safety metric 미측정을 기본 FAIL로 처리할 수 있다.
- memory 문서는 provenance, quarantine, retrieval gate, promotion, supersession을 이미 구분한다.
- `nl-sql` 의존성은 lockfile 기반 임시 `npm ci` 후 typecheck/build에 성공했고
  `npm audit --omit=dev` 결과 알려진 취약점은 0건이었다.

### 3.4 설계 계약 실제 충족률

엄격 판정은 [Agent/MCP 설계 규칙](agent-mcp-design-rules.md)의 10개 필드를 모두 명시해야
완전 충족으로 계산한다.

| 계약 필드 | 완전 충족 | 실제 상태 |
|---|---:|---|
| Identity | 16/16 | stable name·목적·도메인이 명확하다. |
| Inputs | 15/16 | 신규 researcher는 trust와 누락 대응을 채웠고 `test-runner`가 여전히 미흡하다. |
| Outputs | 16/16 | 형식과 근거 요구가 명확하다. |
| Authority | 1/16 | 신규 researcher만 resource scope와 runtime profile을 함께 명시한다. |
| Prohibitions | 1/16 | 신규 researcher만 금지 데이터·권한 확대·외부 sink를 완결한다. |
| Delegation | 1/16 | 신규 researcher는 delegation ceiling을 명시하고 나머지는 migration 전이다. |
| State | 1/16 | 신규 researcher는 session/memory/retention/redaction 계약을 명시한다. |
| Stop conditions | 1/16 | 신규 researcher만 완료·실패·취소·escalation 상태를 모두 정의한다. |
| Budget | 1/16 | 신규 researcher만 tool call, wall-clock, retry, parallelism 상한을 둔다. |
| Verification | 문서 16/16, catalog case 25/25 agent | catalog coverage는 complete지만 기본은 dry validation이며 live runtime evidence는 adapter가 있어야 한다. |

### 3.5 현재 끊어진 연결

1. **생성 → 계약**: canonical agent scaffold와 contract linter가 없다.
2. **계약 → 권한**: 현재는 권한 profile을 신뢰해 task를 실행하지 않는다. native agent/catalog를 package하지
   않고 generic runner는 discovery probe까지 포함해 모든 호출을 거부한다. 기존 15개 agent의 10-field 문서
   migration은 남아 있다.
3. **변경 → eval**: explicit `--only`와 `run-changed.sh`는 선택 자산 case 0건을 실패로 처리하고, manifest agent catalog coverage는 25/25다. positive/adversarial catalog case와 runtime evidence의 지속 품질은 별도 검토 대상이다.
4. **eval → merge**: GitHub Actions offline workflow는 structural eval, behavioral contracts, dry validation, strict coverage를 실행한다. live adapter trial, install matrix, security scan을 포함한 모든 release gate를 아직 대체하지는 않는다.
5. **설치 → 무결성**: project와 exact HOME scope는 target-local/user copy나 receipt를 만들지 않는다.
   다만 source revision ledger와 배포 artifact digest/signature는 아직 없다.
6. **Codex 설치 → agent 실행**: adapter catalog는 유지하지만 task 실행은 의도적으로 끊겨 있다.
   generic runner는 discovery probe를 포함한 모든 호출을 `project_execution_disabled`로 거부한다.
   실행을 다시 연결하려면 same-user file marker가 아닌
   OS-backed provenance와 별도 실행 회귀가 필요하다.
7. **운영 → 개선**: versioned improvement record는 source failure/incident, hypothesis, asset, before/after eval evidence, approval, rollback을 연결하고 promoted record를 fail-closed로 검증한다. behavioral matrix strict gate는 paired trial, identity, process/safety regression을 확인한다. 표준 runtime trace/incident intake와 CI trend 수집은 아직 없다.
8. **개선 → 안전한 승격**: improvement record contract는 autonomous prompt mutation이 아니며, `learn`, `retro`, `knowledge-audit`, `harness-propose`가 현재 없는
   `.claude/**`, `CLAUDE.md`, `harness/index.html`을 전제로 해 source repo에서 폐루프가 실행되지 않는다.
9. **상시 정책 → clone/CI 재현**: 이 세션에는 AGENTS 지침이 주입되어 있지만 저장소에 versioned
   `AGENTS.md`가 없어 다른 clone과 CI가 동일한 standing policy를 재현하지 못한다.

### 3.6 Authoring·KB 구조 감사

구축 절차와 KB 세부 규칙은 [에이전트 구축과 KB 저작 가이드](agent-authoring-and-kb-guide.md)를
canonical 안내서로 삼는다. **pre-0.3.1 historical snapshot:** 2026-07-15 전수감사 결과,
당시 `SOUL → principles → INDEX → topic`
계층은 유지할 가치가 있지만 자동화된 knowledge governance는 미완성이다.

| 지표 | 결과 | 의미 |
|---|---:|---|
| bundle/skill 구조 완결 | 15/15, 34/34 domain skills | runtime routing 전용 skill은 별도 회귀 suite를 사용한다. |
| topic metadata | 93/93 | title/source/last_fetched/consumers는 일관된다. |
| INDEX topic coverage / broken link | 254/254 / 0 | topic은 발견 가능하고 존재하는 Markdown link는 유효하다. |
| clickable topic routing | 254/254 | 기존 21개 보정과 신규 7개 topic 모두 link로 연결된다. |
| `SKILL.md → INDEX` 연결 | 34/34 domain skills | runtime routing 전용 skill에는 KB가 필요하지 않다. |
| verified/owner/trust metadata | 0/254 | fetch 시점과 검증·소유·신뢰 상태를 구분하지 못한다. |
| agent↔skill 유사 KB | 14쌍 | Notion 설치/실행은 skill guide로 수렴했지만 기존 package에는 drift 위험이 남아 있다. |

이 기준선의 우선순위는 폴더 rename이 아니라 installed-context validator, KB metadata v2,
canonical ownership, 누락 routing 보완이다. source tree 정합과 설치 성공만으로 knowledge가 실제
context에 선택되어 사용됐다고 주장하지 않는다.

## 4. Security·compliance alignment

> 이 절의 finding과 수치는 **pre-0.3.1 point-in-time review snapshot**이다. 현재 미해결 finding 목록이나
> 0.3.1 실행 지원 증거가 아니다. 현재 경계는 all-scope zero-copy, no agent/catalog discovery or execution,
> zero-tool Notion이다.

### 4.1 판정 경계

2026-07-14 동시 세션에서 529개 tracked file을 대상으로 수행한 수동 code/security review는
**CRITICAL 0 / HIGH 7 / MEDIUM 7 / LOW 2**로 분류했다. 이는 아래 file:line 근거를 사용한
point-in-time review snapshot이며, 자동화된 compliance score나 외부 인증 결과가 아니다.
아래 P0/P1은 보안 severity와 별개로 **개선 실행 순서**를 나타낸다.

| 통제 영역 | 문서 정렬 | 실제 집행·증거 | 판정 |
|---|---|---|---|
| Goal·agent contract | 목적·금지·검증 문서는 강함 | 신규 researcher 1개만 stop·budget·authority·delegation ceiling을 완결했고 나머지는 migration 전 | Partial |
| Least agency/tool control | per-run allowlist·sandbox 규칙 존재 | Codex는 16개 역할 profile을 집행하지만 Claude/OpenCode와 parent override는 host 정책에 의존 | Partial |
| Identity·delegated authz | human+agent actor, tenant, scope 규칙 존재 | runtime identity/audit binding 없음 | Gap |
| Memory/context safety | quarantine·retrieval·promotion 정책 존재 | auto knowledge의 active-context/무승인 승격 경로가 정책과 충돌 | Gap |
| MCP authorization | 최소 권한·resource authz 규칙 존재 | `allowedSchemas`가 모든 nl-sql entry point의 authz가 아님 | Gap |
| Credential isolation | vault/broker 원칙 존재 | workspace `.env`/JSON 설정을 agent shell과 분리하지 않음 | Gap |
| Tool result trust | untrusted result·toxic-flow 규칙 존재 | DB row/metadata를 Markdown context로 직접 전달 | Gap |
| Supply chain | lockfile·manifest 존재 | digest/signature/SBOM·symlink containment·변조 검증 없음 | Partial |
| Evaluation·trace | structural/behavioral harness와 offline CI 존재 | 25/25 catalog coverage, dry default; live runtime trace/운영 trend 없음 | Partial |
| Dependency·secret hygiene | lock integrity, examples, local guard 존재 | 감사 당시 dependency CVE 0, known-secret 0; CI scanner는 없음 | Partial |

NIST AI RMF 관점에서는 **MAP은 비교적 강하고, GOVERN·MEASURE는 부분 구현, MANAGE는 약함**으로
요약할 수 있다. 위협과 경계는 잘 문서화했지만 owner/risk acceptance/CI evidence, 실제 trial,
운영 incident와 rollback이 아직 같은 control system으로 연결되지 않았다.

### 4.2 우선 차단해야 할 실제 위험

| 우선순위 | Finding | Evidence |
|---|---|---|
| P0 | 설치된 pre-push memory gate가 경로 불일치로 silent no-op | `templates/githooks/pre-push:19-21`, `install/manifest.txt:77-79` |
| P0 | offline CI가 live adapter trial·install matrix·security scan까지 강제하지 않음 | `.github/workflows/evals.yml`은 structural/contracts/dry validation/strict coverage 범위 |
| P0 | behavioral catalog coverage 이후에도 실제 runtime result evidence가 없음 | `--validate`는 static; `--run`은 explicit adapter 필요 |
| P0 | nl-sql schema/tenant authz가 모든 entry point에서 강제되지 않음 | `mcp/nl-sql/src/introspect.ts:30-65`, `src/index.ts:118-145` |
| P0 | 대부분의 agent tool 권한이 host control이 아니라 prompt 규칙 | 12/16 Bash, 4/16 Write/Edit, 2/16 Web+Bash; native profile 1/16 |
| P0 (과거 snapshot) | auto-memory 존재 확인만으로 무승인 curated promotion 가능 | 1.0.0에서 제거된 `knowledge-audit` 스킬 |
| P1 | nl-sql 결과 poisoning, credential isolation, server-side hard row/resource cap 미흡 | `format.ts:17-30`, `config.ts:59-90`, `guard.ts:165-180` |
| P1 | 설치 source revision·asset digest·signature/attestation 부재 | `install/install.sh:246-275`, `INSTALL.md` clone/pull 절차 |
| P1 | 과거 SkillSpector report가 현재 34 skill/16 agent inventory 전체를 대표하지 않음 | `docs/security/skillspector-report.md:3-7,48-52` |
| P1 | repo-local `AGENTS.md`와 내부 reference validation 부재 | 외부 주입 정책; 이번 변경에서 발견한 Kotlin KB routing은 수동 보정했지만 자동 gate는 없음 |

## 5. 목표 Agent Lifecycle Feedback Loop

모든 단계는 **artifact**, **independent gate**, **failure return edge**를 가져야 한다. 실패를 기록만
하고 다음 단계로 진행하면 폐루프가 아니다.

~~~mermaid
flowchart TB
    S[Signal<br/>사용자 요구 · incident · eval regression · protocol update]
    G0{G0. Agent가 필요한가?}
    D[Deterministic code / skill / native tool]
    C[Agent contract<br/>identity · input/output · authority · state · stop · budget]
    T[Threat model + data flow<br/>trust · credential · sink · abuse cases]
    E0[Eval spec first<br/>positive · negative · adversarial · cost]
    A[Canonical scaffold로 authoring<br/>definition · SOUL · KB · adapter profile]
    G1{G1. Static gate}
    E1[Isolated behavioral eval<br/>outcome · trajectory · safety · multiple trials]
    G2{G2. Threshold + regression gate}
    P[Package<br/>manifest · dependency closure · digest · SBOM · version]
    I[Ephemeral install matrix<br/>Claude · OpenCode · Codex]
    G3{G3. Discovery · protocol · security gate}
    R[Versioned release<br/>signed evidence + rollback]
    O[Operate with least capability<br/>policy gateway · sandbox · credential broker]
    M[Redacted telemetry<br/>goal · actor · tool · policy · outcome · cost]
    Q[Quarantine + triage<br/>user feedback · anomaly · incident · stale knowledge]
    G4{G4. Independent promotion review}
    X[Regression case first<br/>candidate change + expected effect]
    Z[Reject / archive / risk acceptance with expiry]

    S --> G0
    G0 -- No --> D
    G0 -- Yes --> C
    C --> T --> E0 --> A --> G1
    G1 -- Fail --> C
    G1 -- Pass --> E1 --> G2
    G2 -- Fail --> A
    G2 -- Pass --> P --> I --> G3
    G3 -- Fail --> A
    G3 -- Pass --> R --> O --> M --> Q --> G4
    G4 -- Reject --> Z
    G4 -- Improve --> X --> C

    classDef gate fill:#fff3cd,stroke:#b58100,color:#3d2d00;
    classDef control fill:#d7f5df,stroke:#198754,color:#102a18;
    classDef reject fill:#f8d7da,stroke:#b02a37,color:#3d0b10;
    class G0,G1,G2,G3,G4 gate;
    class C,T,E0,A,E1,P,I,R,O,M,Q,X control;
    class Z reject;
~~~

### 5.1 Gate 계약

| Gate | 필수 입력 | PASS 증거 | FAIL 시 |
|---|---|---|---|
| G0 Necessity | use case, ambiguity, action surface, deterministic alternative | agent 사용 이유와 non-agent 대안 기각 근거 | code/skill/tool로 축소 |
| G1 Design/static | agent contract, threat model, source/reference, capability profile | contract lint, local link/ref, secret/SAST, dependency, policy diff | contract/설계로 복귀 |
| G2 Behavior | versioned cases, baseline, runtime adapter, thresholds | 실제 trial result, trace assertion, safety/cost, regression diff | case 또는 asset 수정 후 전체 재실행 |
| G3 Install/release | manifest, digest, SBOM, runtime profiles | 격리 설치, native discovery, protocol smoke, tamper/symlink/adversarial test | package/adapter/asset으로 복귀 |
| G4 Promotion | redacted signal, provenance, candidate, expected effect | 독립 review, regression case, improvement evidence, no safety regression | quarantine·reject 또는 만료 risk acceptance |

### 5.2 승격 불변식

- 요구 또는 incident는 바로 prompt/KB 수정으로 승격하지 않는다.
- behavioral failure를 고칠 때 **실패를 재현하는 case를 먼저** 추가한다.
- raw transcript, web/DB/tool result, machine-written memory는 quarantine에서 시작한다.
- code symbol이 존재한다는 사실만으로 knowledge가 참이거나 안전하다고 판정하지 않는다.
- candidate는 기존 baseline보다 outcome을 개선하면서 safety·cost threshold를 악화시키지 않아야 한다.
- 같은 author/agent의 자기 평가는 독립 gate를 대체하지 않는다.
- release 이후 telemetry는 secret/raw sensitive payload가 아닌 redacted event와 artifact hash를 남긴다.
- 실패한 gate를 waiver로 넘기려면 owner, 이유, 보완 통제, 만료일, 재검증 조건이 필요하다.

## 6. 실행 우선순위

### Phase 0 — 거짓 안전 신호 제거

1. pre-push와 memory gate 설치 경로를 하나로 맞추고 forbidden artifact 재현 테스트를 추가한다.
2. CI에 manifest, contract/reference lint, install matrix, dependency/secret scan을 필수화한다.
3. 신규·변경 agent에 behavioral case가 없으면 PASS가 아니라 FAIL하게 한다.
4. versioned repo-local `AGENTS.md` 또는 동일 정책을 생성·검증하는 설치 계약을 둔다.
5. “전체 안전”, “Codex agent 호환”, “compliant” 표기는 실제 evidence 범위로 제한한다.

### Phase 1 — 결정적 control plane

1. 신규 researcher를 제외한 기존 15개 agent를 10-field contract로 migration한다.
2. OS-backed provenance가 생기기 전에는 Codex/Claude/OpenCode agent 실행 surface를 넓히지 않는다.
3. nl-sql의 schema/tenant authorization, secret broker, structured result, resource cap, error redaction을 고친다.
4. installer에 canonical path, parent symlink deny, digest, atomic install/rollback을 추가한다.
5. auto-memory를 active context에서 분리하고 독립 검증 없는 promotion을 금지한다.

### Phase 2 — 평가·설치 폐루프

1. 16/16 agent에 positive, negative, adversarial case를 최소 한 개씩 둔다.
2. runtime별 status-only package와 all-runner fail-closed smoke를 유지한다. 실제 discovery/execution smoke는
   OS-backed provenance 설계가 승인된 뒤 별도 단계로 추가한다.
3. install ledger에 source revision, asset digest, compatibility profile, test result를 기록한다.
4. MCP는 `npm ci → typecheck/build → protocol contract → security/adversarial`을 release gate로 묶는다.

### Phase 3 — 운영 피드백

1. audit event schema로 goal, actor, delegated scope, tool, policy, outcome, latency, cost를 수집한다.
2. regression, incident, user correction, stale knowledge를 quarantine queue로 정규화한다.
3. 개선 proposal은 regression case와 기대 효과를 포함하고 G1~G4를 다시 통과한다.
4. pass rate, safety violation, cost, rollback, promotion precision을 version별 trend로 비교한다.

## 7. 완료 지표

다음 조건을 만족해야 M3 Enforced로 승격한다.

- 16/16 agent가 10-field contract와 runtime capability profile을 가진다.
- 16/16 agent가 positive + negative + adversarial behavioral case를 가진다.
- changed agent의 case 0건, safety 미측정, missing runtime adapter가 모두 fail closed한다.
- 모든 merge에서 CI가 manifest, contract/ref, security, changed behavior, install matrix를 강제한다.
- 설치된 모든 asset이 source revision과 digest로 검증되고 path/symlink escape test를 통과한다.
- Claude/OpenCode/Codex 지원 표기가 native discovery와 실제 execution evidence에 대응한다.
- P0와 HIGH security finding이 0이고, exception은 owner·expiry가 있는 risk register에만 존재한다.

M4 Measured로 승격하려면 추가로 다음이 필요하다.

- production-equivalent trace의 actor/goal/tool/policy/outcome coverage 100%
- version별 pass rate, safety, cost, latency baseline과 regression alert
- incident/user feedback에서 regression case와 개선 PR까지의 추적 가능성
- promotion 이후 효과 검증과 실패 시 자동 rollback 또는 disable 경로

## 8. 감사 재현 명령

~~~bash
bash install/check-manifest.sh
VULPORA_REQUIRE_CODEX=1 bash install/test-install.sh
bash evals/run-evals.sh
bash evals/behavioral/run-behavioral-evals.sh --validate

# nl-sql은 source tree에 node_modules를 남기지 않고 임시 복사에서 실행한다.
WORK="$(mktemp -d "${TMPDIR:-/tmp}/vulpora-nlsql-audit.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
cp mcp/nl-sql/package.json mcp/nl-sql/package-lock.json mcp/nl-sql/tsconfig.json "$WORK/"
cp -R mcp/nl-sql/src "$WORK/"
(
  cd "$WORK"
  env -u NODE_TLS_REJECT_UNAUTHORIZED npm ci
  npm run typecheck
  npm run build
  env -u NODE_TLS_REJECT_UNAUTHORIZED npm audit --omit=dev
)
~~~

`--validate` 결과는 실제 agent behavior PASS가 아니라 fixture 계약 PASS라고 보고해야 한다.
보안 평가는 dependency audit, secret scan, SkillSpector만으로 끝내지 않고 authorization, path,
memory promotion, cross-tool data flow, runtime capability를 수동·동적 검증해야 한다.
