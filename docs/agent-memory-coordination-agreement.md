# Agent-Memory 구현 협업 합의안

작성일: 2026-06-24

## 1. 상태

이 문서는 Vulpora에서 Claude 작업과 Codex 작업이 겹치지 않도록 정한 파일 단위 협업 합의안이다.

현재 관찰된 작업 상태:

- Claude 쪽 작업으로 보이는 범위:
  - `STANDARD.md`
  - `.extraction-brief.md`
  - `agents/**`
  - `skills/**`
- Codex 쪽 기존 작업 범위:
  - `README.md`
  - `docs/agent-memory-self-learning-architecture.md`
  - `docs/agent-memory-architecture-validation.md`
  - `docs/agent-memory-implementation-plan.md`

Claude CLI 직접 검토는 시도했지만 현재 `Not logged in · Please run /login` 상태라 live consensus는 받지 못했다. 따라서 이 문서는 **제안된 합의안**이며, Claude가 로그인된 세션에서 재검토하면 된다.

## 2. 협업 원칙

1. 파일 소유권을 먼저 나누고 구현한다.
2. 상대 agent가 만든 미추적 파일은 수정하지 않는다.
3. 충돌 가능성이 있는 `README.md`는 최소한의 링크/구조 수정만 허용한다.
4. `agents/**`와 `skills/**`는 Claude 작업이 끝나기 전까지 Codex가 건드리지 않는다.
5. memory-kit의 정책과 스키마가 안정화되기 전에는 memory 관련 agent/skill prompt를 만들지 않는다.
6. 구현 완료 후 서로의 산출물을 review-only 모드로 검토한다.

## 3. 파일 소유권

### Claude Primary Scope

Claude가 계속 맡는 범위:

```text
STANDARD.md
.extraction-brief.md
agents/**
skills/**
```

Codex는 이 범위를 읽을 수는 있지만, Claude 작업이 완료되기 전에는 수정하지 않는다.

### Codex Primary Scope

Codex가 맡을 수 있는 범위:

```text
memory/**
evals/**
docs/agent-memory-*.md
examples/portable-memory-pack/**
README.md
```

단, `examples/portable-memory-pack/.agent-memory/`는 임시 스캐폴딩이다. 구현 완료 후 삭제하거나 재생성 가능한 예시로 대체한다.

### Shared / Caution Scope

```text
README.md
docs/**
examples/**
```

공유 영역 규칙:

- `README.md`는 링크와 저장소 구조 설명만 수정한다.
- 기존 문서의 의미를 바꾸는 수정은 하지 않는다.
- `examples/**`에는 임시 디렉터리임을 명시한다.
- 상대 agent가 만든 문서는 먼저 읽고, 덮어쓰지 않는다.

## 4. Codex 구현 범위

Codex는 먼저 Phase 1-2만 구현한다.

### Phase 1: Core Schemas

파일:

```text
memory/README.md
memory/schemas/memory-object.schema.yaml
memory/schemas/skill.schema.yaml
memory/schemas/eval-result.schema.yaml
memory/schemas/audit-event.schema.yaml
memory/schemas/retrieval-decision.schema.yaml
```

### Phase 2: Memory Policies

파일:

```text
memory/policies/write-policy.md
memory/policies/retrieval-gate.md
memory/policies/promotion-policy.md
memory/policies/quarantine-policy.md
memory/policies/supersession-policy.md
memory/policies/self-modification-policy.md
```

### Explicitly Deferred

Codex는 다음을 나중으로 미룬다.

```text
agents/memory-curator.md
agents/memory-verifier.md
agents/skill-promoter.md
agents/memory-security-reviewer.md
skills/memory-consolidate/**
skills/memory-audit/**
skills/skill-promote/**
skills/memory-eval/**
```

이 파일들은 Claude의 `agents/**`, `skills/**` 작업과 직접 겹치므로 Claude 작업 완료 후 합쳐서 진행한다.

## 5. 상호 견제 방식

### Codex가 Claude 산출물을 검토할 때

검토 범위:

- `STANDARD.md`와 실제 `agents/**`, `skills/**` 구조가 일치하는가
- `STANDARD.md`에 정의된 금지 도메인 토큰이 남아 있는가
- agent/skill마다 `reference/principles.md`, `reference/kb/INDEX.md`, KB 파일이 있는가
- KB 파일에 source, last_fetched, 리뷰 훅이 있는가
- 범용 agent repo 원칙과 맞는가

검토 명령:

```bash
# Use the forbidden-token regex from STANDARD.md.
rg -n "<STANDARD_FORBIDDEN_TOKEN_REGEX>" agents skills STANDARD.md .extraction-brief.md
find agents skills -path "*/reference/kb/INDEX.md" -print
rg -n "## 리뷰 훅|last_fetched|source:" agents skills
```

### Claude가 Codex 산출물을 검토할 때

검토 범위:

- `memory/schemas/*`가 지나치게 특정 backend에 묶이지 않는가
- `memory/policies/*`가 `STANDARD.md`의 범용성 규칙과 충돌하지 않는가
- untrusted content가 procedural memory나 skill로 직접 승격되는 경로가 없는가
- retrieval gate가 similarity-only가 아닌 trust/context gate로 정의되어 있는가
- self-modification이 default deny인지 확인한다

검토 명령:

```bash
rg -n "Letta|Mem0|Zep|LangGraph" memory
rg -n "untrusted|quarantine|procedural|self-modification|retrieval gate|similarity" memory
rg -n "<ABSOLUTE_LOCAL_PATH_OR_STANDARD_FORBIDDEN_TOKEN_REGEX>" memory evals docs
```

## 6. Conflict Protocol

충돌 발생 시 처리 순서:

1. `git status --short --untracked-files=all`로 겹친 파일을 확인한다.
2. 상대 agent가 만든 파일이면 수정하지 않는다.
3. 꼭 수정해야 하면 별도 문서에 proposed patch 형태로 남긴다.
4. `README.md` 충돌은 더 작은 diff를 우선한다.
5. `agents/**`와 `skills/**` 충돌은 Claude 작업 완료 전까지 Codex가 양보한다.
6. `memory/**`와 `evals/**` 충돌은 Codex가 primary owner지만, 정책/스키마가 `STANDARD.md`와 충돌하면 Claude 쪽 표준을 먼저 검토한다.

## 7. Implementation Gate

Codex가 실제 구현을 시작하기 전 확인할 것:

```bash
test ! -e memory || find memory -maxdepth 3 -type f -print
test ! -e evals || find evals -maxdepth 3 -type f -print
git status --short --untracked-files=all
```

시작 조건:

- `memory/**`가 비어 있거나 Codex가 만든 파일만 있다.
- `evals/**`가 비어 있거나 Codex가 만든 파일만 있다.
- Claude가 만든 `agents/**`, `skills/**`, `STANDARD.md`, `.extraction-brief.md`는 수정하지 않는다.

## 8. 합의된 다음 실행안

Codex가 지금 바로 안전하게 할 수 있는 구현:

```text
1. memory/README.md 작성
2. memory/schemas/* 작성
3. memory/policies/* 작성
4. README에 memory/와 evals/ 방향만 최소 반영
5. verification 명령 실행
```

아직 하지 않을 것:

```text
1. agents/** 파일 추가/수정
2. skills/** 파일 추가/수정
3. STANDARD.md 수정
4. .extraction-brief.md 수정
5. Claude가 만든 KB 파일 수정
```

## 9. Final Review Checklist

구현 후 Codex가 보고할 내용:

- 생성한 파일 목록
- 수정한 공유 파일 목록
- 건드리지 않은 Claude scope
- policy상 memory poisoning 방어 경로
- retrieval gate decision matrix
- self-modification 제한
- 실행한 검증 명령과 결과

Claude 검토가 가능해지면 이 문서를 기준으로 approve/revise/reject 중 하나의 verdict를 받는다.
