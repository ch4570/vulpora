# Vulpora 표준 구조 (STANDARD)

이 저장소는 판단형 **에이전트**와 각 에이전트가 소유한 지식 번들을 배포한다. 기준은 KB를 갖춘
에이전트(`agents/dba`, `agents/code-review`, `agents/opensearch`, `agents/refactor`)의 구조다.
실제 만드는 순서와 예시는 [에이전트 구축과 KB 저작 가이드](docs/agent-authoring-and-kb-guide.md)를
따른다.

## 1. 디렉터리 레이아웃

### 에이전트
```text
agents/<agent-id>.md             # Claude Code 에이전트 정의(frontmatter: name, description, tools)
                                 #  - 운영 지침(절차·출력형식)만. 정체성은 SOUL.md를 가리킨다.
agents/<bundle-id>/
├── SOUL.md                      # 정체성(페르소나·가치·말투·금기) — 단일 출처(SSOT)
└── reference/
    ├── principles.md            # 핵심 원칙("헌법") — 통찰·판단 기준
    └── kb/
        ├── INDEX.md             # KB 색인: 작업유형 → 읽을 KB 매핑
        └── <topic>.md           # 개별 지식 파일(공식 문서 distill)
```

`<agent-id>`와 `<bundle-id>`는 같을 수도, 다를 수도 있다. 둘의 설치 관계는
`install/manifest.txt`의 agent row가 단일 출처이며, 정의 문서의 reference path도 그 mapping과
일치해야 한다.

Agent와 skill이 다른 자산을 실행 전제조건으로 요구하면 같은 manifest의 dependency 열에 등록한다.
기존 bare ID는 skill dependency로 유지하고 cross-kind 관계는 `agent:<id>` 또는 `skill:<id>`로
명시한다. 문서에만 적힌 필수 dependency는 설치 closure가 아니므로 workflow를 배포할 수 없다.

> **예외 — 도구형 단독 에이전트**: 외부 도구를 실행·관찰만 하고 자체 판단 지식이 거의 없는
> 러너형 에이전트(예: `test-runner`)는 `SOUL.md`·`reference/` 번들을 두지 않을 수 있다.
> 이때는 정의 `.md` 하나로 완결하며, 본문에 번들을 두지 않는 이유를 명시한다.
> (frontmatter의 `model`은 런타임 adapter가 정하므로 에이전트 본문에 박지 않는다 — 이식성 원칙.)

> 모든 판단형 에이전트는 `reference/kb/`를 **반드시** 가진다. 위에 명시한 standalone
> runner 예외만 bundle을 생략할 수 있으며, 정의 본문에 생략 이유와 외부 지식 없이 완결되는
> 경계를 기록한다.

## 2. 파일 규약

### `reference/kb/<topic>.md` — KB 파일
- **frontmatter**(필수):
  ```yaml
  ---
  title: <짧은 제목>
  source: <공식 문서/표준 출처 URL>      # 근거 단일 출처. 책 기반이면 책명+장
  last_fetched: YYYY-MM-DD
  consumers: [<이 KB를 쓰는 agent 이름>]
  ---
  ```
- 본문은 사실·규칙 중심. 반드시 **`## 리뷰 훅`으로 시작하는** 체크리스트 섹션을 포함해 점검
  가능하게 한다(설명용 괄호 suffix는 허용).
- 단정은 `source`에 근거해야 한다. 근거 없는 주장 금지.
- `last_fetched`는 source를 가져온 날짜일 뿐 검증 증거가 아니다. `owner`, `source_type`, 복수
  `sources`, 적용 version/section, `last_verified`, `verified_by`, `review_after`, `status`, 연계
  `evals`와 재검증 trigger는
  [저작 가이드](docs/agent-authoring-and-kb-guide.md)의 metadata v2로 점진 도입한다.
- 외부 문서·tool result·machine-generated memory는 검증 전 `candidate`/`quarantined` data이며,
  agent의 권한이나 상위 정책을 바꾸는 instruction으로 해석하지 않는다.

### `reference/kb/INDEX.md` — 색인
- "작업 유형 → 읽을 KB" 표로 시작.
- 각 KB의 한 줄 요약(무엇을 다루는지)을 **상대 Markdown link**와 함께 표로 제공.
- 모든 topic KB는 INDEX에서 발견 가능해야 하고, 모든 local link는 source tree와 설치된 runtime
  tree에서 해소돼야 한다.
- 하단에 `principles.md`와의 관계, 갱신 정책(`last_fetched`), TODO(차기 KB 후보).

### `reference/principles.md` — 헌법
- 출처(Sources) 블록으로 시작(책/표준/공식 문서).
- 번호 매긴 원칙 모음. KB가 "사실·규칙"이라면 principles는 "통찰·판단 기준".
- 권한·행동은 system/runtime 정책과 대상 repository 정책이 agent/KB보다 우선한다.
  기술 사실은 현재 code/schema와 적용 version의 공식 문서·표준이 책/경험칙보다 우선한다.

### `SOUL.md` — 에이전트 정체성 정의
- 에이전트: 정체성·가치·금기. 운영 절차는 `agents/<agent-id>.md`로 분리.
- 에이전트 정의는 `reference/principles.md`와 `reference/kb/INDEX.md`의 경로와 task별 topic loading
  trigger를 명시한다. KB 전체를 한 번에 읽게 하지 않는다.

### `skills/<skill-id>/SKILL.md` — 스킬 정의

한 벌의 skill source를 Codex와 Claude Code가 함께 소비한다. runtime별 사본을 만들지 않는다.

- **frontmatter**(필수): `name`, `description`. `name`은 디렉터리명과 같아야 하고 소문자·숫자·하이픈만
  쓰며 64자를 넘기지 않는다. `description`은 1024자를 넘기지 않는다 — Claude Code는 이 문자열만 보고
  skill을 선택하므로, 무엇을 하는 skill인지와 언제 쓰는지를 모두 담는다.
- **description은 runtime 이름을 트리거로 쓰지 않는다**: "Use when Codex must choose ..."처럼 특정
  runtime을 주어로 쓰면 다른 runtime에서 선택 신호가 약해진다. "Use when the agent must choose ..."로
  쓴다.
- **호출 표기는 runtime 중립**: Codex는 `$<skill-id>`, Claude Code는 `/<skill-id>`로 호출한다. 다른
  skill로 라우팅할 때는 호출 문법 대신 이름을 쓴다(예: "route rendering to the `diagram-styler` skill").
  실제 호출 예시를 보여야 하면 같은 문서에서 두 runtime 표기를 함께 제시한다.
- **상대 링크의 두 경계를 구분한다**: skill 디렉터리 안(`reference/`, `references/`, `scripts/`,
  `assets/`)을 가리키는 링크는 source tree와 설치 트리 양쪽에서 해소돼야 한다. `../../../AGENTS.md`처럼
  설치 대상 repository를 가리키는 링크는 의도된 바깥 참조이며 source tree에서 해소되지 않는다.
- **runtime별 discovery 경로**: Claude Code는 각 scope의 `.claude/skills`, Codex는 user
  `~/.agents/skills` / project `.agents/skills`를 쓴다. Claude marketplace 설치는 저장소 루트의
  `.claude-plugin/`이 catalog 전체를 노출한다.
- **검증**: `bash install/test-claude-skill-port.sh`가 위 계약을 강제한다(릴리스 게이트인
  `install/check-npm-package.sh`에서 함께 실행된다).

## 3. 범용성(이식성) 규칙 — 도메인 토큰 금지

이 저장소는 **특정 서비스·레포에 묶이지 않는다.** 추출 시 다음을 제거/치환한다.

- **금지 토큰(도메인)**: 각 조직의 **서비스·도메인 고유 토큰**을 제거한다 — 서비스/제품명, 내부 모듈·경로명,
  업종 특화 모델·용어, 사내 호스트. 저장소엔 특정 회사를 식별하는 토큰을 남기지 않으며, 각 팀이 자기 금지
  목록을 정의해 점검한다. 일반 영어 단어(예: `resume`=프로세스 재개)는 도메인 토큰이 아니다.
- **치환 원칙**:
  - 업종 특화 도메인 예시(특정 검색/시나리오 등) → 범용 예시(예: 일반 엔티티 `Order`/`Member`/`Article`).
  - 내부 경로/모듈명 → 일반 표현(`<module>`, "변경된 모듈").
  - 사내 GitLab 인스턴스 호스트는 명시하지 않고 `glab`이 인증된 인스턴스를 따르게 둔다.
- **유지 가능한 일반 기술**: PostgreSQL/Kotlin/Spring/OpenSearch 등 **기술 스택 지식 자체**는 범용이므로 유지한다.
  단, 그 안의 도메인 특화 예시·전제는 일반 예시로 바꾼다.

## 4. 도구·환경 규약

- **git 플랫폼**: provider-neutral이 기본이다. 현재 remote 또는 `vulpora.config.json`으로
  GitHub/GitLab/none을 해소하며, 특정 CLI·assignee·reviewer·base branch를 코어 계약에 강제하지 않는다.
  Branch 생성·전환·최신화·publish는 사용자나 trusted repository policy가 명시적으로 요청한 경우에만 한다.
- **언어**: 사용자와 repository의 기존 관례를 따르며, 필요하면 project config의 `locale`로 `ko` 또는
  `en`을 지정한다. 공용 agent/skill ID와 machine-readable schema는 영어를 사용한다.
- **빌드 게이트(git 훅 등)**: 특정 빌드도구(Gradle 등)에 묶지 않고 **빌드시스템 자동감지**
  (gradle/maven/npm/pnpm/yarn 등)로 일반화한다.

## 5. behavioral eval 작성 규약

실제 에이전트 실행을 평가하는 케이스는 `evals/behavioral/cases/<asset>/<name>.yaml` 에 둔다(구조/정합성 케이스와 분리).

- **필수 필드**: `id`, `asset`(또는 `agent`), `runtime`, `fixture_repo`, `prompt`, `baseline.compare_with`,
  `expected.{must_find, must_not_claim, required_artifacts}`, `safety.forbidden_actions`, `metrics.track`,
  `pass_threshold.{outcome,process,safety}`(0~1), `retention.raw_log_policy`(`ephemeral` 권장).
- **이식성**: `fixture_repo`·`prompt`·`must_*` 는 특정 회사/서비스/개인경로에 묶지 않는다(일반 엔티티 예시).
- **명시적 matcher**: `must_find`와 `must_not_claim`은 같은 규칙을 쓴다. bare 값과 `literal:`은
  고정 문자열, `any_of:`는 `|`로 나눈 고정 문자열 대안, `regex:`만 POSIX ERE다. KO/EN 용어
  변형은 `any_of:재색인|reindex`처럼 한 신호로 묶는다. bare 값에 `|`, `.*`, `[]`, `$` 등 정규식
  문법을 쓰지 않는다. `findings: []` 같은 실제 문자열은 `literal:findings: []`로 명시한다.
- **검증 가능한 artifact**: `required_artifacts`는 `file:<상대경로>`, `dir:<상대경로>`,
  `file_existing:<상대경로>`, `dir_existing:<상대경로>`, `text:<출력에 존재할 고정 문자열>`만 쓴다.
  `file:`과 `dir:`은 실행으로 실제 추가·변경된 산출물을 요구하며, `*_existing:`은 기존 산출물의
  존재를 명시적으로 허용한다. 경로는 fixture 안에 있어야 하며 symlink·traversal은 허용하지 않는다.
  사람이 읽는 산출물 설명만 적으면 검증에 실패한다. 상세 계약은
  [behavioral eval 안내](evals/behavioral/README.md)를 따른다.
- **안전/보존**: raw transcript는 영구 저장하지 않는다(임시·삭제, 결과엔 요약·점수·해시만). secrets/토큰/개인경로는 redaction한다.
- **metrics sidecar**: 실제 실행 adapter는 `VULPORA_METRICS_FILE`에 flat YAML/JSON 요약을 쓸 수 있다.
  지원 키는 `elapsed_seconds`, `tool_calls`, `files_read`, `files_written`, `command_count`,
  `estimated_tokens`, `forbidden_action_hits`, `guardrail_trips`다. raw trace는 sidecar에 쓰지 않는다.
  `process`/`cost` 점수는 sidecar가 있을 때만 휴리스틱으로 산출하고, 없으면 `unmeasured`(소프트 통과)로 둔다.
  `forbidden_action_hits`는 adapter가 tool 입력(예: Bash `command`)에서만 집계해야 한다 — 보고서 본문의 위험 명령 *언급*은 카운트하지 않는다(오탐 방지).
- **safety 게이트**: `safety`는 자동통과하지 않는다. sidecar가 없어 `safety_score=unmeasured`면 기본적으로 FAIL(`safety_unmeasured`)이며, `VULPORA_REQUIRE_SAFETY_METRICS=0` 으로만 통과 처리(opt-out)할 수 있다. `guardrail_trips`는 참고 지표이며 safety 점수에 직접 반영하지 않는다.
- **baseline id**: 3모드 비교는 `plain-runtime`, `agent-only`, `agent-memory` id를 사용한다.
  사람이 읽는 설명은 달라도 결과 YAML의 `behavioral.baseline_mode`는 이 id 중 하나를 권장한다.
- **검증**: `bash evals/behavioral/run-behavioral-evals.sh --validate` 로 필수 필드·fixture 경로·임계값 범위를 통과해야 한다.
- **구조 러너 불간섭**: behavioral 케이스는 `run-evals.sh` 의 메모리 스키마 검사를 받지 않는다(그 러너는 `behavioral/` 를 제외한다).

## 6. Agent/MCP 설계 규약

상세 규범과 근거는
[Agent/MCP 설계 규칙](docs/agent-mcp-design-rules.md)을 단일 출처로 삼는다.
새 agent/MCP와 권한·schema·transport가 실질적으로 바뀌는 기존 자산은 아래 규칙을
병합 게이트로 적용한다.

### 프로토콜 경계

- **MUST**: 저장소 상시 정책은 AGENTS.md, 선택형 절차는 Agent Skills, host와
  tool/resource provider 연결은 MCP에 둔다.
- **MUST**: 독립 배포·독립 운영되는 agent 간 discovery/delegation은 A2A, coding
  agent와 IDE/client의 session·permission UX는 ACP 경계로 분리한다.
- **SHOULD**: 같은 process/trust domain의 subagent와 단순 함수는 runtime-native
  orchestration/tool을 우선한다.
- **MUST NOT**: MCP server에 전체 agent orchestration, 전체 대화, 다른 server의
  credential/session/context를 넣는다.
- 프로덕션 baseline은 MCP 2025-11-25, A2A 1.0.0, ACP major v1이다.
  draft/RC/experimental 기능은 별도 compatibility profile과 feature flag에 둔다.

### Agent 계약

이 게이트가 적용되는 신규·실질 변경 agent는 다음을 **MUST** 명시한다.

- stable id와 한 문장 목적
- 입력과 신뢰 수준, 누락 시 행동
- 출력 형식·근거·provenance
- 허용 capability/resource scope와 금지 action
- delegation 대상과 권한 상한
- session/memory read-write·retention·redaction
- 완료·실패·취소·escalation 조건
- tool call·시간·token/cost·parallelism budget
- outcome·process·safety 검증

한 run에는 primary loop authority를 하나만 두며, subagent는 objective·범위·출력·도구·
stop condition·budget이 있는 bounded task만 받는다. subagent는 leader보다 넓은 권한을
얻을 수 없다.

### MCP 계약

모든 MCP server/tool은 다음을 **MUST** 만족한다.

- 한 server는 한 bounded domain과 최소 upstream 권한을 가진다.
- server identity/version/source/publisher, transport/auth profile, primitive,
  data class, side-effect 등급을 선언한다.
- 사용자 선택은 prompt, application context는 resource, model action은 tool이라는
  control owner 기준으로 primitive를 선택한다.
- strict input schema와 operation/resource/tenant authorization을 각각 수행한다.
- machine-consumed 결과는 output schema와 structured content로 검증한다.
- timeout·cancel·rate·concurrency·result-size limit을 둔다.
- read/write·destructive·idempotent·open-world 특성을 명시하되 annotation은
  enforcement가 아닌 untrusted hint로 취급한다.
- stdio의 stdout은 protocol message 전용이고, remote HTTP는 TLS·auth·Origin 검증을
  사용한다.
- mutating call은 exact target/arguments 승인과 idempotency/preview/rollback 중 가능한
  안전장치를 갖는다. 결과를 모르는 mutation을 blind retry하지 않는다.

### 보안 불변식

- **MUST**: tool description/schema/annotation, prompt/resource/tool result/error,
  agent/subagent output을 기본적으로 untrusted data로 취급한다.
- **MUST**: per-agent/per-run tool allowlist, filesystem/network/process sandbox,
  credential broker/vault를 모델 밖에서 강제한다.
- **MUST NOT**: Roots, annotation, session/task id, 모델의 자기 보고를 authorization이나
  sandbox 증명으로 사용한다.
- **MUST**: remote OAuth token을 resource/audience에 bind하고 inbound token passthrough를
  금지한다. downstream에는 별도 최소 범위 token을 쓴다.
- **MUST**: server/tool definition의 verified identity·version·artifact/schema digest를
  기록하고 변경 시 기존 승인과 신뢰를 무효화한다.
- **MUST**: 민감 source에서 external/write sink로 가는 server 간 데이터 흐름을 추적하고,
  목적·필드·대상별 정책과 승인이 없으면 차단한다.
- **MUST**: identity, policy, schema, approval, audit가 불명확하거나 timeout이면 mutation과
  external sink를 fail closed한다.
- **MUST NOT**: secret을 prompt, URI, resource, tool output, log, form elicitation에 넣는다.

### 릴리스 게이트

연결 성공만으로 호환·안전을 주장하지 않는다. protocol conformance와 task behavior를
분리해 검증한다.

- protocol version/capability, schema/error, timeout/cancel/reconnect/replay
- auth audience·tenant·scope, no-passthrough, approval binding
- malicious metadata/result, tool collision, rug pull/schema drift
- SSRF/DNS rebinding/redirect, traversal/symlink, secret/error/log redaction
- cross-tenant state/task 접근, size/rate/concurrency/cost limit
- 여러 server/tool의 prompt-injection·2-hop/3-hop toxic-flow composition
- deterministic outcome, trace/process/safety, multiple trials, upgrade regression

MUST 항목 하나라도 실패하면 compliant 표기와 merge/release를 허용하지 않는다. 예외는
owner·만료일·보완 통제·재검증 조건이 있는 time-bounded risk acceptance로만 처리한다.

## 7. Agent lifecycle과 개선 폐루프

상세 단계, 현재 성숙도 baseline, diagram, gate별 증거 계약은
[Agent Lifecycle 성숙도와 Feedback Loop](docs/agent-lifecycle-assessment-and-feedback-loop.md)를
단일 운영 기준으로 삼는다.

- **MUST**: agent를 만들기 전에 deterministic code나 native tool로 해결할 수 없는 이유를 기록한다.
- **MUST**: 구현 전에 agent contract, threat model, positive·negative·adversarial eval spec을 정의한다.
- **MUST**: 신규·변경 agent에 연결된 실제 behavioral case가 없으면 평가를 성공 처리하지 않는다.
- **MUST**: manifest·contract/reference·security·behavior·install matrix gate를 merge 전에 실행한다.
- **MUST**: 설치 증거는 파일 존재뿐 아니라 source revision, digest, compatibility profile,
  native discovery/execution 결과를 포함한다.
- **MUST**: runtime feedback과 machine-written memory는 quarantine에서 시작하며, 독립 검증과
  regression case 없이 agent/curated knowledge로 승격하지 않는다.
- **MUST**: 변경 후보는 outcome 개선뿐 아니라 safety·cost·권한 회귀가 없음을 증명한 뒤 승격한다.
- **MUST**: 어떤 gate든 실패하면 다음 단계로 진행하지 않고 contract/asset/eval 단계로 되돌린다.

현재 저장소의 미충족 항목은 위 문서의 point-in-time assessment와 P0/P1 목록으로 관리한다.
자동 집행이 추가되기 전에는 PR에 각 gate의 실행 명령·결과·미검증 범위를 직접 남긴다.

## 8. Agent/Skill/KB 저작 절차

[에이전트 구축과 KB 저작 가이드](docs/agent-authoring-and-kb-guide.md)를 canonical 작업 안내서로
삼는다. 새 자산과 실질 변경은 다음 순서를 따른다.

1. agent·deterministic tool 중 가장 작은 실행 단위를 선택하고 이유를 기록한다.
2. agent contract, capability, threat/data-flow, positive·negative·adversarial eval을 먼저 정의한다.
3. definition/SOUL/principles/INDEX/topic의 책임을 섞지 않고 v1 layout에 작성한다.
4. `install/manifest.txt`에 dependency closure를 등록한다.
5. static·behavior·install gate를 구분해 실행하고 copied/discovered/executed 증거를 따로 남긴다.
6. 운영 실패와 새 지식은 quarantine에서 regression case로 고정한 뒤 다시 승격한다.

현재 validator가 이 절의 모든 항목을 자동 집행하지 않는다는 사실은 PASS로 간주하지 않는다.
미집행 항목은 PR의 `Known gaps`와 owner/만료가 있는 risk acceptance에 기록한다.
