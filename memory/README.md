# Agent Memory Kit

Agent Memory Kit는 Vulpora의 범용 에이전트가 실행 경험을 검증 가능한 memory, policy, skill, eval artifact로 다루기 위한 portable contract입니다.

이 디렉터리는 특정 memory backend를 구현하지 않습니다. 파일 기반 사용을 기본으로 하되, 나중에 vector store, temporal graph, relational DB, agent runtime에 연결할 수 있도록 schema와 policy를 먼저 고정합니다.

현재 `schemas/*.yaml` 파일은 지식 그래프의 공식 저장 표준이 아니라 사람이 읽고 이식하기 쉬운 authoring contract입니다. 런타임 구현에서는 JSONL evidence ledger, JSON Schema/Pydantic validation, SQLite/graph DB storage, JSON-LD/Turtle/SHACL export 같은 계층으로 분리합니다.

## Design Position

이 kit의 기본 입장은 다음과 같습니다.

- memory는 instruction이 아니라 evidence입니다.
- 현재 사용자 지시, 현재 레포 상태, 현재 검증 결과가 memory보다 우선합니다.
- untrusted input은 바로 long-term memory가 될 수 없습니다.
- procedural memory와 skill은 agent behavior를 바꾸므로 review와 eval evidence가 필요합니다.
- retrieval은 similarity search로 끝나지 않고 trust/context gate를 통과해야 합니다.
- self-modification은 기본적으로 금지하며, review와 eval을 통과한 변경만 허용합니다.

## Read Order

처음 도입할 때는 다음 순서로 읽습니다.

1. `schemas/memory-object.schema.yaml`
2. `schemas/retrieval-decision.schema.yaml`
3. `policies/write-policy.md`
4. `policies/retrieval-gate.md`
5. `policies/promotion-policy.md`
6. `policies/quarantine-policy.md`
7. `policies/self-modification-policy.md`
8. `schemas/skill.schema.yaml`
9. `schemas/eval-result.schema.yaml`
10. `schemas/audit-event.schema.yaml`

## Core Flow

```text
raw trace
  -> candidate memory
  -> typed memory
  -> verified memory
  -> procedural guidance or skill draft
  -> replay/eval verified skill
  -> promoted skill
```

Every transition must leave evidence.

## Directory Contract

```text
memory/
├── README.md
├── schemas/
│   ├── memory-object.schema.yaml
│   ├── skill.schema.yaml
│   ├── eval-result.schema.yaml
│   ├── audit-event.schema.yaml
│   └── retrieval-decision.schema.yaml
└── policies/
    ├── write-policy.md
    ├── retrieval-gate.md
    ├── promotion-policy.md
    ├── quarantine-policy.md
    ├── supersession-policy.md
    └── self-modification-policy.md
```

## Non-Goals

- No model fine-tuning.
- No required vector DB.
- No hidden global memory.
- No automatic permission expansion.
- No direct promotion from untrusted content to procedural memory.
- No agent prompt rewrite without review.

## Portability Rules

- Use relative paths.
- Do not hardcode local user paths.
- Do not assume a specific vendor runtime.
- Keep backend-specific notes optional.
- Treat schema IDs and versions as stable migration anchors.
