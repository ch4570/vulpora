# Agent-Memory 기반 자가 학습 에이전트 설계 보고서

작성일: 2026-06-24

## 1. Executive Summary

Hermes류의 지속 학습 에이전트를 설계할 때 핵심은 모델 자체를 매번 재학습시키는 것이 아니라, 에이전트의 실행 경험을 **검증 가능한 메모리, 절차, 스킬, 평가 기준**으로 축적하고 다음 실행에 재사용하는 것입니다.

권장 방향은 다음과 같습니다.

1. **대화 저장소가 아니라 학습 시스템으로서의 메모리**를 설계한다.
2. 메모리를 `short-term`, `episodic`, `semantic`, `procedural`, `skill`, `evaluation` 계층으로 분리한다.
3. 모든 기억은 출처, 신뢰도, 적용 범위, 만료 조건, 검증 결과를 가진다.
4. 자가 학습은 `경험 수집 -> 반성/추출 -> 후보 메모리 생성 -> 검증 -> 승격 -> 회귀 테스트` 루프로 운영한다.
5. 스스로 좋아지는 범위는 초기에 **프롬프트, 규칙, 체크리스트, 스킬, 검색 인덱스, 테스트 데이터**로 제한하고, 코드 수정이나 권한 확장은 별도 승인 게이트를 둔다.
6. 메모리 포이즈닝, 오래된 기억, 잘못된 성공 사례 복제, 과도한 agency가 가장 큰 리스크이므로 memory write path를 read path보다 더 엄격히 통제한다.

이 저장소인 `vulpora`에는 범용 에이전트 본문뿐 아니라, 이식 가능한 memory-enabled agent 운영 규약을 함께 저장하는 구조가 적합합니다.

## 2. 조사 배경과 핵심 인사이트

### 2.1 MemGPT / Letta: 메모리는 가상 컨텍스트 관리자다

MemGPT는 제한된 LLM context window를 운영체제의 계층형 메모리처럼 다루는 virtual context management 접근을 제안했습니다. 핵심은 긴 히스토리를 전부 프롬프트에 넣는 것이 아니라, 빠른 메모리와 느린 메모리 사이에서 필요한 정보를 이동시키는 것입니다.

Letta 문서는 stateful agent를 system prompt, memory blocks, messages, tools의 조합으로 설명합니다. 중요한 점은 core memory를 context window에 주입하고, agent가 memory tool을 통해 자신의 memory block을 수정할 수 있다는 점입니다.

설계 시사점:

- 모든 기억을 같은 방식으로 저장하지 말고, context에 항상 들어가는 core memory와 필요할 때 검색하는 archival memory를 분리해야 합니다.
- 에이전트가 자기 메모리를 수정할 수 있게 하되, 직접 수정은 정책과 감사 로그 뒤에 둬야 합니다.
- shared memory block은 여러 에이전트가 공통 행동 규칙을 학습하는 데 유용하지만, 잘못된 기억이 대규모로 전파될 수 있으므로 승격 게이트가 필요합니다.

### 2.2 LangGraph: 메모리 타입을 명확히 나눠야 한다

LangGraph의 memory overview는 agent memory를 크게 short-term memory와 long-term memory로 나누고, long-term memory 안에서 semantic, episodic, procedural memory를 구분합니다. 또한 memory write를 hot path와 background path로 나누어 latency와 품질의 trade-off를 설명합니다.

설계 시사점:

- `semantic memory`: 사용자/조직/레포/도메인에 대한 사실
- `episodic memory`: 과거 작업, 실패, 성공, 피드백, 실행 경로
- `procedural memory`: 에이전트가 작업을 수행하는 규칙, 프롬프트, 체크리스트
- hot path write는 즉시성이 좋지만 응답 지연과 오염 위험이 있습니다.
- background write는 더 안전하고 품질이 높지만 최신성이 떨어질 수 있습니다.

범용 에이전트 저장소에서는 기본적으로 background consolidation을 표준으로 삼고, hot path write는 명시적 `remember` 또는 검증된 preference 정도로 제한하는 것이 좋습니다.

### 2.3 OpenAI Agents SDK sandbox memory: 실행 후 메모리 생성 파이프라인

OpenAI Agents SDK의 sandbox memory는 future runs가 prior runs에서 배울 수 있도록 memory를 sandbox workspace의 파일로 남깁니다. session memory와 구분되며, memory generation은 conversation extraction과 layout consolidation의 두 단계로 나뉩니다. 또한 run 시작 시 작은 `memory_summary.md`를 developer prompt에 주입하고, 필요할 때 `MEMORY.md`와 rollout summary를 검색하는 progressive disclosure 방식을 사용합니다.

설계 시사점:

- 이식 가능한 구조에는 `memory_summary.md`, `MEMORY.md`, `rollout_summaries/`, `raw_memories/` 같은 파일 기반 memory layout이 적합합니다.
- memory는 현재 환경보다 우선하지 않아야 합니다. stale memory는 guidance로만 취급하고, 현재 레포와 테스트 결과가 항상 우선입니다.
- agent별 memory layout을 분리해야 합니다. 예를 들어 reviewer memory와 executor memory를 섞으면 잘못된 행동이 전파됩니다.

### 2.4 Generative Agents / Reflexion: 반성은 별도 산출물이어야 한다

Generative Agents는 관찰, planning, reflection이 believable behavior에 중요하다는 것을 보였습니다. Reflexion은 모델 가중치를 바꾸지 않고, 실패와 피드백을 verbal reflection으로 저장한 뒤 다음 trial에서 활용하는 방식으로 성능을 높였습니다.

설계 시사점:

- 단순 로그 저장은 학습이 아닙니다. 경험을 요약하고, 실패 원인을 추출하고, 다음 행동 지침으로 바꾸는 reflection 단계가 필요합니다.
- reflection은 원본 실행 로그와 분리된 산출물이어야 하며, 나중에 검증 또는 폐기될 수 있어야 합니다.
- "성공한 경험"도 무조건 좋은 기억이 아닙니다. 우연히 통과한 해결책, 오래된 convention, 잘못된 workaround를 재사용할 수 있습니다.

### 2.5 Voyager: 스킬 라이브러리로 능력이 누적된다

Voyager는 Minecraft 환경에서 자동 curriculum, executable skill library, 실행 피드백 기반 iterative prompting을 결합했습니다. 중요한 점은 학습 결과가 자연어 요약만이 아니라 재사용 가능한 executable skill로 축적된다는 것입니다.

설계 시사점:

- 에이전트가 똑똑해지는 가장 실용적인 형태는 "기억이 많아지는 것"보다 "검증된 스킬 라이브러리가 커지는 것"입니다.
- coding agent에서는 스킬이 다음 형태를 가질 수 있습니다.
  - repo 탐색 recipe
  - test 실행 recipe
  - migration checklist
  - review heuristic
  - 반복 bug-fix pattern
  - 도구 사용 절차
- 스킬은 반드시 precondition, input, output, failure mode, verification을 가져야 합니다.

### 2.6 Hermes류 설계의 강점: memory + verification

최근 HERMES 수학 reasoning agent 연구는 informal reasoning과 formal proof checking을 결합하고, 긴 reasoning chain의 continuity를 위해 memory module을 사용합니다. 사용자가 말한 "Hermess agent"가 특정 구현체를 뜻할 수도 있지만, 설계 관점에서 중요한 패턴은 명확합니다.

- 장기 작업에서 reasoning continuity를 memory가 담당한다.
- 중요한 중간 산출물은 검증 도구로 확인한다.
- agent가 만든 결과를 agent의 주장만으로 믿지 않고, compiler, theorem prover, test, benchmark 같은 외부 verifier가 확인한다.

범용 개발 에이전트에서는 Lean 대신 다음 verifier를 사용합니다.

- unit/integration/e2e test
- typecheck
- lint/static analysis
- replay 가능한 task fixture
- human review
- security policy checker
- prompt-injection red team suite

### 2.7 최근 연구의 경고: memory는 장기 공격면이다

최근 memory poisoning 연구들은 persistent memory가 agent behavior에 장기 영향을 줄 수 있다는 점을 보입니다. 특히 공격자가 외부 문서, 웹페이지, repo 파일, 이메일 등에 악성 instruction을 심어두면, 에이전트가 이를 "유용한 기억"으로 저장하고 미래 작업에서 재사용할 수 있습니다.

설계 시사점:

- memory write는 untrusted input에서 바로 일어나면 안 됩니다.
- 모든 기억은 source trust level을 가져야 합니다.
- 외부 콘텐츠에서 추출된 기억은 quarantine 상태로 저장하고, 검증 전에는 core/procedural memory로 승격하지 않습니다.
- retrieval된 memory도 instruction이 아니라 evidence로 취급해야 합니다.
- "aggressive memory write/retrieval"은 성능을 높일 수 있지만 공격면도 키웁니다.

## 3. 목표 아키텍처

### 3.1 설계 목표

자가 학습 에이전트의 목표는 다음입니다.

- 반복 작업에서 탐색 비용을 줄인다.
- 사용자의 선호와 레포 convention을 기억한다.
- 실패를 반복하지 않는다.
- 성공한 절차를 스킬로 재사용한다.
- 스스로 만든 개선안도 검증 없이는 신뢰하지 않는다.
- 다른 레포에 쉽게 이식할 수 있다.

비목표는 다음입니다.

- base model weight를 자동으로 fine-tuning하는 시스템
- 무제한 자기 코드 수정
- 사용자 승인 없는 권한 확장
- 외부 웹/파일 내용을 신뢰 메모리로 즉시 저장
- 단일 vector DB에 모든 기억을 밀어 넣는 구조

### 3.2 전체 구성도

```text
User / Task
    |
    v
Agent Runtime
    |
    +-- Context Builder
    |     +-- current task
    |     +-- repo state
    |     +-- short-term session
    |     +-- selected long-term memories
    |
    +-- Planner / Executor / Reviewer / Verifier Agents
    |
    +-- Tool Layer
    |     +-- shell, fs, git, browser, test runner, docs
    |
    v
Execution Trace
    |
    +-- raw logs
    +-- decisions
    +-- tool outputs
    +-- user corrections
    +-- verification results
    |
    v
Memory Pipeline
    |
    +-- Extract candidate memories
    +-- Classify memory type
    +-- Deduplicate / merge / supersede
    +-- Score confidence and risk
    +-- Verify or quarantine
    +-- Promote to memory store or skill graph
    |
    v
Memory Stores
    |
    +-- Core memory
    +-- Semantic memory
    +-- Episodic memory
    +-- Procedural memory
    +-- Skill graph
    +-- Evaluation memory
    +-- Audit log
```

### 3.3 핵심 루프

#### A. Online execution loop

```text
1. 사용자의 현재 task를 받는다.
2. 현재 레포 상태와 명시적 사용자 지시를 최우선 context로 둔다.
3. memory summary를 읽고 관련 memory를 검색한다.
4. memory를 instruction이 아니라 참고 evidence로 주입한다.
5. 계획, 실행, 검증을 수행한다.
6. 실행 trace와 verification result를 남긴다.
7. 즉시 기억해야 할 명시적 preference만 hot path로 저장한다.
```

#### B. Background sleep loop

```text
1. 완료된 run trace를 batch로 읽는다.
2. 실패, 반복 탐색, 사용자 수정, 성공 recipe, 검증 결과를 추출한다.
3. candidate memory를 생성한다.
4. candidate를 semantic / episodic / procedural / skill / eval로 분류한다.
5. 중복, 충돌, stale 여부를 검사한다.
6. 위험 기억은 quarantine한다.
7. 검증 가능한 기억은 replay/test/eval을 통과한 뒤 승격한다.
8. summary와 index를 갱신한다.
```

#### C. Skill promotion loop

```text
1. 여러 episodic memory에서 반복 성공 패턴을 찾는다.
2. 패턴을 skill draft로 컴파일한다.
3. skill draft에 input, output, precondition, steps, failure modes, verification을 붙인다.
4. fixture 또는 과거 task replay로 검증한다.
5. reviewer agent와 verifier agent가 독립 검토한다.
6. threshold를 넘으면 skill library에 승격한다.
7. 이후 task에서 skill retrieval 대상으로 노출한다.
```

## 4. 메모리 계층 설계

### 4.1 Working memory

현재 turn 또는 현재 run 안에서만 유지되는 메모리입니다.

저장 대상:

- 현재 사용자 요청
- 현재 계획
- 읽은 파일
- 실행 중인 테스트 결과
- 임시 가설

정책:

- run 종료 후 원본 trace에 남기되, long-term memory로 자동 승격하지 않습니다.
- 실패한 가설은 reflection 후보가 될 수 있습니다.

### 4.2 Short-term session memory

같은 thread나 task 흐름 안에서 유지되는 대화/작업 문맥입니다.

저장 대상:

- 사용자와의 최근 대화
- 진행 중인 plan
- pending tasks
- 최근 tool result

정책:

- session ID로 격리합니다.
- 오래된 메시지는 요약하되, 사용자 지시와 결정 사항은 손실 없이 보존합니다.

### 4.3 Episodic memory

과거 실행 경험입니다. "무슨 일이 있었는가"를 저장합니다.

저장 대상:

- 특정 repo에서 특정 문제를 해결한 trace
- 실패 원인
- 사용자가 고친 부분
- 어떤 테스트가 결정적이었는지
- 어떤 접근이 거부되었는지

예시:

```yaml
id: episode_2026_06_24_readme_concept
scope:
  repo: vulpora
  agent_role: executor
task: README에 범용 vulpora 컨셉 반영
outcome: success
signals:
  - README 기존 GitLab 템플릿 제거
  - 이식성 원칙과 예상 구조 추가
verification:
  - sed로 README 확인
  - git diff 확인
lessons:
  - 초기 레포에서는 docs보다 README에서 concept를 먼저 고정하는 편이 좋음
```

### 4.4 Semantic memory

사실과 관계입니다. "무엇이 참인가"를 저장합니다.

저장 대상:

- 레포의 목적
- 팀 convention
- 빌드 명령
- 모듈 관계
- 사용자의 선호

주의:

- semantic memory는 오래되기 쉽습니다.
- `valid_from`, `last_seen_at`, `source`, `confidence`, `supersedes`가 필요합니다.

### 4.5 Procedural memory

작업 규칙입니다. "어떻게 해야 하는가"를 저장합니다.

저장 대상:

- agent role prompt
- review checklist
- test selection policy
- coding convention
- release workflow

정책:

- procedural memory는 agent behavior를 직접 바꾸므로 가장 엄격하게 관리합니다.
- 외부 문서에서 추출된 procedural memory는 검증 및 human approval 전에는 활성화하지 않습니다.
- 작은 변경도 diff와 rationale을 남깁니다.

### 4.6 Skill memory

재사용 가능한 능력 단위입니다.

스킬 스키마:

```yaml
id: skill_repo_readme_reframe
version: 1
description: 초기 템플릿 README를 레포 목적 중심 문서로 재작성한다
applies_when:
  - repo has only default scaffold README
  - user asks to capture repository concept
inputs:
  - existing README
  - user concept statement
steps:
  - remove scaffold content
  - write purpose and direction
  - add portability or usage principles
  - verify diff is README-only
verification:
  - README renders as Markdown
  - git diff only touches intended file
failure_modes:
  - over-specific project assumptions
  - creating directories before concept stabilizes
provenance:
  promoted_from:
    - episode_2026_06_24_readme_concept
confidence: medium
```

### 4.7 Evaluation memory

에이전트 자체의 성능과 회귀를 추적하는 메모리입니다.

저장 대상:

- task success rate
- failed verification patterns
- latency/token cost
- human correction frequency
- memory retrieval precision
- stale memory incidents
- poisoning simulation results

정책:

- self-improvement의 "보상 함수" 역할을 합니다.
- 단순히 에이전트가 "잘했다"고 말하는 것은 점수가 아닙니다.
- 외부 verifier와 사용자 피드백을 우선합니다.

## 5. 메모리 객체 표준 스키마

범용 이식성을 위해 모든 memory object는 최소한 다음 필드를 가져야 합니다.

```yaml
id: string
type: semantic | episodic | procedural | skill | evaluation
scope:
  org: optional string
  repo: optional string
  project: optional string
  user: optional string
  agent_role: optional string
content:
  summary: string
  details: optional string
source:
  kind: user | repo | tool_output | test_result | web | generated_reflection
  uri: optional string
  run_id: optional string
  timestamp: ISO-8601
trust:
  level: trusted | internal | untrusted | mixed
  confidence: low | medium | high
  poison_risk: low | medium | high
validity:
  valid_from: ISO-8601
  expires_at: optional ISO-8601
  supersedes: optional list[string]
  stale_if:
    - condition string
verification:
  status: unverified | quarantined | verified | rejected | deprecated
  method: optional string
  evidence: optional list[string]
retrieval:
  tags: list[string]
  embedding_text: string
  priority: low | normal | high
audit:
  created_by: agent id
  reviewed_by: optional agent or human id
  updated_at: ISO-8601
```

이 스키마의 핵심은 "기억 내용"보다 "그 기억을 언제, 어디서, 얼마나 믿을 수 있는지"를 구조화하는 것입니다.

## 6. 저장소와 런타임 설계

### 6.1 파일 기반 기본 레이아웃

`vulpora`처럼 다른 레포에 이식하기 쉬운 자산 저장소는 DB보다 파일 레이아웃을 먼저 표준화하는 것이 좋습니다.

```text
.agent-memory/
├── README.md
├── memory_summary.md
├── MEMORY.md
├── memories/
│   ├── semantic/
│   ├── episodic/
│   ├── procedural/
│   ├── skills/
│   ├── evaluation/
│   └── quarantine/
├── rollout_summaries/
├── raw_traces/
├── indexes/
│   ├── tags.json
│   └── embeddings.manifest.json
└── audit/
    └── memory-events.jsonl
```

### 6.2 프로덕션 저장소

규모가 커지면 다음 조합을 권장합니다.

- PostgreSQL: canonical memory object, audit, versioning
- Vector index: semantic retrieval
- Graph DB 또는 relational edges: skill graph, supersession, dependency
- Object storage: raw traces, artifacts, screenshots, logs
- Git: procedural memory, prompts, skill definitions, policy 파일

중요한 원칙:

- canonical source는 구조화 DB 또는 Git에 두고, vector DB는 검색 인덱스로만 사용합니다.
- vector DB에만 기억을 저장하면 provenance, 삭제, supersession, audit가 약해집니다.

## 7. Context Builder 설계

자가 학습 agent의 품질은 memory store보다 context builder에서 결정됩니다.

Context builder는 다음 순서로 context를 구성해야 합니다.

1. system/developer instruction
2. 현재 사용자 요청
3. 현재 repo/runtime facts
4. active plan
5. relevant verified procedural memory
6. relevant semantic memory
7. relevant episodic examples
8. candidate skills
9. explicit warnings: stale, unverified, conflicting memory

규칙:

- 현재 사용자 지시가 memory보다 우선합니다.
- 현재 파일 시스템과 테스트 결과가 memory보다 우선합니다.
- unverified memory는 행동 지침으로 쓰지 않고 참고 후보로만 표시합니다.
- retrieved memory마다 source와 confidence를 model에게 노출합니다.
- 너무 많은 memory를 넣지 말고, progressive disclosure로 단계적으로 읽게 합니다.

## 8. 자가 학습 전략

### 8.1 학습 대상의 우선순위

초기 MVP에서는 아래 순서로 학습 대상을 넓히는 것이 안전합니다.

1. 사용자 선호와 repo convention
2. 반복 작업의 checklist
3. 실패 회피 규칙
4. 테스트/검증 선택 전략
5. 재사용 가능한 skill
6. agent prompt 개선
7. agent orchestration graph 개선
8. 제한적 코드 generator 개선
9. 모델 fine-tuning 또는 policy learning

1-5는 memory-based learning입니다. 6-8은 procedural self-modification에 가까우므로 review gate가 필요합니다. 9는 별도 ML pipeline과 governance 없이는 권장하지 않습니다.

### 8.2 Memory write policy

메모리 쓰기는 다음 decision tree를 따릅니다.

```text
Is it explicitly given by the user?
  yes -> save as trusted preference or instruction, scoped narrowly
  no  -> continue

Is it derived from current repo/test/tool evidence?
  yes -> save as internal candidate with evidence
  no  -> continue

Is it from external web/file/email/untrusted content?
  yes -> quarantine unless independently verified
  no  -> continue

Did it change agent behavior or permissions?
  yes -> require reviewer/verifier/human approval
  no  -> background consolidation is enough
```

### 8.3 Reflection prompt contract

Reflection agent는 다음 질문에 답해야 합니다.

- 이번 작업에서 성공/실패를 가른 결정은 무엇인가?
- 다음에 같은 상황이 오면 무엇을 더 빨리 해야 하는가?
- 어떤 접근은 다시 시도하지 않아야 하는가?
- 이 교훈은 특정 레포에만 해당하는가, 범용인가?
- 이 기억은 어떤 evidence로 검증되었는가?
- 언제 stale해질 수 있는가?
- 이 기억이 악용되면 어떤 행동을 유발할 수 있는가?

Reflection output은 곧바로 memory가 아니라 candidate입니다.

## 9. Skill Graph 설계

### 9.1 왜 skill graph인가

자가 학습 에이전트가 장기적으로 똑똑해지려면 "많은 노트"보다 "재사용 가능한 능력"이 필요합니다. Skill graph는 각 스킬을 독립 노드로 보고, precondition, dependency, verifier, failure mode를 연결합니다.

```text
skill:fix_kotlin_spring_test_failure
    depends_on -> skill:inspect_gradle_module
    depends_on -> skill:read_kotest_behavior_spec
    verified_by -> eval:kotlin_test_fixture_001
    conflicts_with -> policy:no_new_dependency_without_request
    supersedes -> skill:old_kotlin_test_recipe
```

### 9.2 스킬 승격 기준

candidate skill은 다음 조건을 통과해야 합니다.

- 최소 2개 이상의 성공 episode에서 반복된다. 단, 명시적 사용자 요청으로 만든 skill은 예외 가능.
- precondition이 명확하다.
- 실패 조건이 적혀 있다.
- deterministic 또는 semi-deterministic verification이 있다.
- 보안상 위험한 tool 권한을 요구하지 않는다. 필요하면 human approval이 필요하다.
- 다른 skill과 충돌하지 않는다.
- reviewer agent가 "과적합된 절차가 아니다"라고 판단한다.

### 9.3 스킬 사용 규칙

- 스킬은 현재 task와 precondition이 맞을 때만 retrieval됩니다.
- 스킬은 instruction이지만, 현재 사용자 지시와 repo state보다 우선하지 않습니다.
- 스킬 실행 후 결과가 좋지 않으면 skill performance score를 낮춥니다.
- skill failure는 episodic memory로 저장하고 다음 consolidation 때 수정 후보를 만듭니다.

## 10. 안전, 보안, 거버넌스

### 10.1 주요 리스크

1. **Memory poisoning**: 외부 입력이 장기 기억으로 저장되어 미래 행동을 조작합니다.
2. **Error propagation**: 과거의 틀린 성공 사례를 비슷한 문제에 계속 재사용합니다.
3. **Stale memory**: 오래된 convention이나 환경 정보가 현재 작업을 방해합니다.
4. **Over-retrieval**: 관련 없는 기억이 context를 오염시킵니다.
5. **Excessive agency**: 에이전트가 기억을 근거로 권한이 큰 행동을 자동 수행합니다.
6. **Prompt drift**: self-reflection이 procedural memory를 조금씩 바꿔 원래 운영 원칙이 약해집니다.
7. **Shared-memory blast radius**: 공통 memory block 하나가 여러 agent의 행동을 동시에 망가뜨립니다.

### 10.2 방어 설계

- Memory write quarantine: untrusted source는 기본 격리
- Provenance requirement: source 없는 memory 금지
- Least privilege: memory가 tool 권한을 자동 확장하지 못하게 함
- Human-in-the-loop: destructive action, credential, deploy, billing, 권한 변경은 승인 필요
- Retrieval firewall: retrieved memory 안의 instruction은 실행하지 않고 data로만 취급
- Conflict detector: 현재 repo state와 memory가 충돌하면 현재 state 우선
- Staleness policy: TTL, last verified, version pinning
- Red-team eval: prompt injection, memory poisoning, sleeper memory 테스트
- Audit log: memory 생성/수정/삭제/승격 이벤트를 append-only로 보관

### 10.3 Governance model

NIST AI RMF의 Govern, Map, Measure, Manage 구조를 agent-memory에도 적용할 수 있습니다.

- Govern: 누가 memory policy를 바꿀 수 있는가
- Map: 어떤 memory가 어떤 행동에 영향을 주는가
- Measure: memory retrieval 품질과 안전성을 어떻게 측정하는가
- Manage: 위험 memory를 어떻게 격리, 폐기, 롤백하는가

## 11. 평가 지표

### 11.1 성능 지표

- task success rate
- first-pass success rate
- 평균 tool call 수
- 평균 token cost
- time to completion
- user correction count
- repeated mistake rate

### 11.2 Memory 품질 지표

- retrieval precision: 검색된 memory 중 실제로 유용한 비율
- retrieval recall: 필요한 memory를 놓치지 않는 비율
- memory freshness: 최신 상태와 일치하는 비율
- contradiction rate: memory 간 충돌 비율
- promotion accuracy: 승격된 memory가 실제로 성능을 높이는 비율
- forgetting quality: 제거된 memory가 실제로 불필요했는지

### 11.3 안전 지표

- poisoning write success rate
- poisoning retrieval success rate
- poisoned action success rate
- untrusted-to-procedural promotion rate
- high-risk action without approval count
- stale memory induced failure count
- rollback time

### 11.4 회귀 테스트

자가 학습 시스템은 개선될수록 반드시 회귀 테스트가 필요합니다.

권장 eval suite:

- memory recall benchmark
- coding task replay benchmark
- repo convention benchmark
- prompt injection benchmark
- memory poisoning benchmark
- stale memory benchmark
- multi-agent shared memory benchmark

## 12. Vulpora에 맞는 권장 레포 구조

현재 `vulpora`는 범용 AGENT 자산을 모으는 저장소입니다. 따라서 다음 구조가 적합합니다.

```text
vulpora/
├── README.md
├── agents/
│   ├── planner.md
│   ├── executor.md
│   ├── reviewer.md
│   ├── verifier.md
│   └── memory-curator.md
├── skills/
│   ├── memory/
│   │   ├── consolidate-memory.md
│   │   ├── promote-skill.md
│   │   └── audit-memory.md
│   └── ...
├── memory/
│   ├── schemas/
│   │   ├── memory-object.schema.yaml
│   │   ├── skill.schema.yaml
│   │   └── eval-result.schema.yaml
│   ├── policies/
│   │   ├── write-policy.md
│   │   ├── retrieval-policy.md
│   │   └── promotion-policy.md
│   └── templates/
│       ├── MEMORY.md
│       ├── memory_summary.md
│       └── rollout-summary.md
├── evals/
│   ├── memory-recall/
│   ├── memory-poisoning/
│   └── skill-replay/
├── examples/
│   ├── codex/
│   ├── claude-code/
│   ├── openai-agents-sdk/
│   └── langgraph/
└── docs/
    └── agent-memory-self-learning-architecture.md
```

### 12.1 새로 필요한 에이전트: memory-curator

`memory-curator`는 실행 agent가 아니라 학습 파이프라인 담당 agent입니다.

책임:

- run trace에서 memory candidate 추출
- candidate 분류
- source trust 평가
- 중복/충돌 검사
- quarantine 여부 판단
- skill 승격 PR 생성
- memory audit report 작성

금지:

- untrusted external content를 procedural memory로 직접 승격
- test 없이 skill confidence를 high로 변경
- 사용자 명시 지시를 일반화해서 organization-wide policy로 저장

### 12.2 portable overlay 전략

이 저장소의 목표가 다른 레포에 이식되는 것이므로, memory 시스템도 core와 overlay를 분리해야 합니다.

```text
common agent memory package
    +
repo overlay
    =
memory-enabled repo agent
```

Core에 들어갈 것:

- memory schema
- write/retrieval/promotion policy
- generic curator/reviewer/verifier prompt
- generic eval templates

Overlay에 들어갈 것:

- repo-specific build/test commands
- team convention
- domain glossary
- deployment policy
- sensitive paths
- approval rules

## 13. MVP 구현 로드맵

### Phase 0: 문서와 스키마 고정

목표:

- memory object schema 작성
- skill schema 작성
- write/retrieval/promotion policy 작성
- memory-curator agent 초안 작성

완료 기준:

- 다른 레포가 schema와 policy만 복사해도 memory governance를 이해할 수 있음

### Phase 1: 파일 기반 memory MVP

목표:

- `.agent-memory/` 레이아웃 정의
- `MEMORY.md`, `memory_summary.md`, `rollout_summaries/` 템플릿 작성
- run summary에서 candidate memory를 수동 또는 반자동으로 작성

완료 기준:

- 한 레포에서 3개 이상의 작업 episode를 저장하고 다음 작업에서 재사용 가능

### Phase 2: Memory curator workflow

목표:

- `memory-curator.md` agent 추가
- candidate extraction checklist 작성
- quarantine/review/promotion flow 작성

완료 기준:

- user correction, failed approach, successful recipe를 분리해서 저장 가능

### Phase 3: Skill graph MVP

목표:

- skill schema와 skill index 작성
- 3-5개 범용 skill 작성
- skill replay checklist 작성

완료 기준:

- 과거 episode에서 스킬 후보를 승격하고, 새로운 작업에서 적용 여부를 판단 가능

### Phase 4: Eval과 안전성 테스트

목표:

- memory recall eval
- stale memory eval
- prompt injection / memory poisoning eval
- skill regression eval

완료 기준:

- memory를 추가했을 때 성능 개선과 안전 리스크를 숫자로 비교 가능

## 14. 설계 결론

지속적으로 똑똑해지는 에이전트는 "모든 것을 기억하는 에이전트"가 아닙니다. 좋은 설계는 오히려 다음을 잘합니다.

- 무엇을 기억하지 않을지 결정한다.
- 기억을 사실, 경험, 절차, 스킬로 분리한다.
- 검증된 경험만 행동 규칙으로 승격한다.
- 틀린 기억을 폐기하고 오래된 기억을 낮은 우선순위로 내린다.
- 스스로 개선하되, 자기 주장을 외부 verifier로 확인한다.
- memory가 권한이 아니라 참고 context임을 유지한다.

Vulpora의 장기 방향은 범용 agent prompt 모음에서 한 단계 더 나아가, **portable self-improving agent kit**가 되는 것입니다. 즉, 다른 레포에 복사하면 다음이 함께 따라가야 합니다.

- 역할별 agent
- memory schema
- memory write/retrieval/promotion policy
- skill library
- eval suite
- safety gates
- repo overlay template

이 구조를 따르면 Hermes/Voyager/Reflexion/Letta류의 장점을 가져오면서도, 실제 개발 레포에서 가장 위험한 memory poisoning과 behavioral drift를 통제할 수 있습니다.

## 15. 참고 자료

- MemGPT: Towards LLMs as Operating Systems, https://arxiv.org/abs/2310.08560
- Letta Docs - Introduction to Stateful Agents, https://docs.letta.com/guides/core-concepts/stateful-agents
- LangChain / LangGraph Memory Overview, https://docs.langchain.com/oss/python/concepts/memory
- OpenAI Agents SDK - Agent memory, https://openai.github.io/openai-agents-python/sandbox/memory/
- OpenAI Agents SDK - Sessions, https://openai.github.io/openai-agents-python/sessions/
- Generative Agents: Interactive Simulacra of Human Behavior, https://arxiv.org/abs/2304.03442
- Reflexion: Language Agents with Verbal Reinforcement Learning, https://arxiv.org/abs/2303.11366
- Self-Refine (arXiv:2303.17651): iterative refinement of LLM outputs, https://arxiv.org/abs/2303.17651
- Voyager: An Open-Ended Embodied Agent with Large Language Models, https://arxiv.org/abs/2305.16291
- HERMES: Towards Efficient and Verifiable Mathematical Reasoning in LLMs, https://arxiv.org/abs/2511.18760
- Memory for Autonomous LLM Agents: Mechanisms, Evaluation, and Emerging Frontiers, https://arxiv.org/abs/2603.07670
- How Memory Management Impacts LLM Agents, https://arxiv.org/abs/2505.16067
- Agent Memory: Characterization and System Implications of Stateful Long-Horizon Workloads, https://arxiv.org/abs/2606.06448
- From Untrusted Input to Trusted Memory: A Systematic Study of Memory Poisoning Attacks in LLM Agents, https://arxiv.org/abs/2606.04329
- Hidden in Memory: Sleeper Memory Poisoning in LLM Agents, https://arxiv.org/abs/2605.15338
- OWASP Top 10 for Large Language Model Applications, https://owasp.org/www-project-top-10-for-large-language-model-applications/
- OWASP LLM01:2025 Prompt Injection, https://genai.owasp.org/llmrisk/llm01-prompt-injection/
- NIST AI Risk Management Framework, https://www.nist.gov/itl/ai-risk-management-framework
