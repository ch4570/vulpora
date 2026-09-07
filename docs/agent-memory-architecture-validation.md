# Agent-Memory 자가 학습 아키텍처 재검토 보고서

작성일: 2026-06-24

## 1. 결론

이전 보고서의 큰 방향은 맞습니다. 특히 다음 판단은 최신 연구와 제품 문서 기준으로도 유지됩니다.

- 자가 학습을 모델 weight fine-tuning이 아니라 memory, reflection, skill, eval의 외부 시스템으로 다뤄야 한다.
- memory를 semantic, episodic, procedural, skill, evaluation 계층으로 나누는 것이 flat vector memory보다 낫다.
- 실행 경험은 곧바로 행동 규칙이 아니라 candidate memory가 되어야 한다.
- 검증된 경험만 skill로 승격해야 한다.
- memory poisoning과 stale memory를 핵심 리스크로 둬야 한다.
- Vulpora처럼 이식성을 중시하는 레포는 DB-first보다 file/schema/policy-first가 맞다.

하지만 “최선”에 더 가까워지려면 이전 설계를 아래처럼 보강해야 합니다.

1. **Eval harness를 후순위가 아니라 memory loop의 전제 조건으로 올려야 한다.**
2. **Retrieval을 similarity search로 끝내지 말고, task-conditioned trust gate를 넣어야 한다.**
3. **Knowledge와 memory의 persistence semantics를 더 명확히 분리해야 한다.**
4. **Skill graph는 좋은 방향이지만, graph 자체보다 promotion contract와 replay evidence가 핵심이다.**
5. **자가 prompt 수정은 기본 금지에 가깝게 두고, PR/review 기반 절차로만 승격해야 한다.**

따라서 최종 권장 구조는 다음입니다.

```text
Evidence-Gated Memory + Trust-Gated Retrieval + Audited Skill Graph + Agentic Eval Harness
```

짧게 말하면, "많이 기억하는 agent"가 아니라 **검증된 기억만 제한적으로 행동에 영향을 주는 agent**가 되어야 합니다.

## 2. 재조사 근거

### 2.1 Memory는 write-manage-read loop로 봐야 한다

2026년 agent memory survey는 agent memory를 perception/action과 결합된 `write-manage-read` loop로 정리합니다. 이 관점은 이전 보고서의 `경험 수집 -> 반성/추출 -> 후보 메모리 -> 검증 -> 승격` 구조와 잘 맞습니다.

판단:

- 이전 보고서의 memory pipeline은 타당합니다.
- 다만 "manage" 단계가 더 강해야 합니다. 단순 분류/요약이 아니라 conflict resolution, staleness, deletion, trust scoring, retrieval admission까지 포함해야 합니다.

### 2.2 Agentic memory 평가는 단순 recall benchmark로 부족하다

MemGym은 기존 memory benchmark가 multi-turn chat의 개인정보 recall에 치우쳐 있고, coding/web navigation/deep research 같은 실제 agent execution에서의 dynamic memory formation을 충분히 평가하지 못한다고 지적합니다.

판단:

- 이전 보고서의 eval section은 방향은 맞지만 위치가 늦습니다.
- MVP Phase 4가 아니라 Phase 0/1부터 "작은 replay eval"이 있어야 합니다.
- Vulpora에서는 최소한 `memory recall`, `skill replay`, `poisoning simulation`, `stale memory` fixture를 초기에 만들어야 합니다.

### 2.3 Similarity 기반 retrieval만으로는 위험하다

2026년 "Beyond Similarity" 계열 연구는 semantically related memory가 현재 task에 contextually inappropriate할 수 있으며, 이로 인해 cross-domain leakage, sycophancy, tool-call drift, memory-induced jailbreak이 생길 수 있다고 봅니다. Zep, Mem0, A-Mem, MemOS 같은 프레임워크 평가에서도 memory search가 trust boundary가 됩니다.

판단:

- 이전 보고서의 "retrieved memory는 instruction이 아니라 evidence"라는 원칙은 맞습니다.
- 하지만 설계상 `retrieval gate`가 명시적 컴포넌트로 올라와야 합니다.
- 추천 구조는 `retrieve candidates -> trust/context gate -> cite/admit selected memories -> agent uses as evidence`입니다.

### 2.4 Temporal graph와 structured memory가 flat RAG보다 강하다

Zep은 temporal knowledge graph로 cross-session temporal reasoning과 enterprise context retrieval을 강화합니다. Mem0도 long-term conversation memory에서 extraction, consolidation, retrieval을 중심에 두며 graph variant를 제안합니다. A-MEM은 Zettelkasten식 dynamic indexing/linking으로 memory evolution을 다룹니다. MIRIX는 core, episodic, semantic, procedural, resource, knowledge vault를 나누고 multi-agent memory control을 둡니다.

판단:

- 이전 보고서의 typed memory 계층은 방향이 맞습니다.
- 단, production target에서는 `semantic memory`를 단순 문서 collection이 아니라 temporal graph 또는 relationship-aware store로 바꾸는 것이 낫습니다.
- Vulpora의 portable MVP는 파일 기반이어도 되지만, schema가 graph migration을 막지 않아야 합니다.

### 2.5 Skill graph 방향은 강하다

Voyager는 executable skill library가 lifelong learning에서 실용적인 누적 능력임을 보였습니다. Audited Skill-Graph Self-Improvement는 self-improvement를 opaque parameter update가 아니라 verifiable, reusable skill graph 축적으로 다루는 쪽을 제안합니다.

판단:

- 이전 보고서의 skill graph는 매우 타당합니다.
- 하지만 "성공 episode 2개 이상" 같은 단순 기준보다, replay evidence, verifier-backed contract check, negative cases가 더 중요합니다.
- skill은 "좋은 요약"이 아니라 "재실행 가능한 contract"여야 합니다.

### 2.6 Self-modification은 좁게 열어야 한다

STOP과 Language Agents as Optimizable Graphs는 scaffold나 agent graph 자체를 개선할 수 있음을 보였지만, 동시에 sandbox 우회, overfitting, reproducibility 문제가 생깁니다. "AI Agents That Matter"는 agent benchmark에서 accuracy만 보고 복잡도와 cost를 무시하면 잘못된 결론에 도달한다고 지적합니다.

판단:

- 이전 보고서의 "초기에는 prompt/rule/checklist/skill/eval 중심" 제한은 옳습니다.
- self-prompt rewrite나 orchestration graph optimization은 기본 기능이 아니라 advanced lane으로 빼야 합니다.
- cost, latency, reproducibility가 eval metric에 들어가야 합니다.

### 2.7 Memory poisoning 방어는 더 공격적으로 설계해야 한다

2026년 memory poisoning 연구들은 persistent memory가 장기 control channel이 될 수 있음을 보입니다. "From Untrusted Input to Trusted Memory"는 공격적인 memory write/retrieval이 exploitability를 높인다고 보고합니다. "Poison Once, Exploit Forever"는 웹 agent가 환경 관찰만으로 cross-session/cross-site memory poisoning에 당할 수 있음을 보입니다.

판단:

- 이전 보고서의 quarantine, provenance, least privilege는 맞습니다.
- 하지만 policy는 더 엄격해야 합니다.
- 기본값은 `untrusted content cannot become procedural memory`여야 합니다.
- hot path memory write는 원칙적으로 꺼두고, 사용자가 명시한 preference 또는 verified internal evidence만 예외로 허용해야 합니다.

## 3. 이전 보고서 논리 구조 평가

| 항목 | 평가 | 판단 |
| --- | --- | --- |
| 문제 정의 | 강함 | "memory 기반 self-learning"을 weight update가 아닌 외부 학습 시스템으로 본 것은 맞다. |
| memory taxonomy | 강함 | LangGraph, CoALA, MIRIX 방향과 일치한다. |
| file-first portability | 강함 | Vulpora 목적에는 맞다. production architecture와 분리한 것도 맞다. |
| skill graph | 강함 | Voyager, ASG-SI 흐름과 잘 맞는다. |
| security posture | 중상 | poisoning을 다뤘지만 retrieval gate를 1급 컴포넌트로 올려야 한다. |
| eval strategy | 중간 | eval 항목은 있으나 architecture control loop의 중심으로 더 끌어올려야 한다. |
| knowledge semantics | 중간 | semantic memory와 knowledge layer의 revision/supersession semantics가 더 명확해야 한다. |
| self-modification governance | 중상 | 제한 방향은 맞지만 prompt rewrite는 더 강한 review gate가 필요하다. |
| implementation roadmap | 중상 | Phase 순서를 eval-first로 조정하는 것이 낫다. |

종합 판단:

```text
현재 보고서 점수: 8/10
보강 후 목표 점수: 9/10
```

감점 이유는 아이디어가 틀려서가 아니라, 최신 memory security/eval 연구 기준으로 retrieval trust boundary와 eval-first 운영이 덜 전면에 있었기 때문입니다.

## 4. 보강된 최종 아키텍처

### 4.1 핵심 컴포넌트

```text
Task
  |
  v
Context Builder
  |
  +-- Current repo/user/task state
  +-- Memory candidate retrieval
  +-- Trust/context retrieval gate
  +-- Evidence bundle assembly
  |
  v
Agent Execution
  |
  +-- Planner
  +-- Executor
  +-- Reviewer
  +-- Verifier
  |
  v
Trace + Verification Evidence
  |
  v
Memory Curator
  |
  +-- Extract
  +-- Classify
  +-- Score trust
  +-- Resolve conflicts
  +-- Quarantine unsafe candidates
  +-- Run replay/eval
  +-- Promote or reject
  |
  v
Versioned Memory + Skill Graph
  |
  v
Eval Harness + Audit Log
```

### 4.2 기존 설계 대비 핵심 변경

이전:

```text
retrieve memory -> use in context
```

수정:

```text
retrieve memory candidates -> trust gate -> admit only scoped evidence -> use with citations
```

이전:

```text
build memory first -> add eval later
```

수정:

```text
define minimal eval fixtures -> add memory -> measure utility and safety -> promote
```

이전:

```text
semantic / episodic / procedural memory
```

수정:

```text
knowledge layer: durable facts with supersession
episodic memory: decaying experiences
procedural memory: reviewed behavior rules
skill graph: executable/replayable capabilities
```

## 5. Vulpora에 대한 구체적 권장 변경

### 5.1 README의 방향성은 유지

README의 "범용 에이전트 자산 저장소" 방향은 유지해도 됩니다. 다만 다음 문장을 나중에 보강하는 것이 좋습니다.

```text
Vulpora은 에이전트 프롬프트만이 아니라, memory schema, skill contract, eval fixture, safety policy까지 함께 관리하는 portable agent kit를 지향한다.
```

### 5.2 다음 파일을 우선 추가

가장 먼저 만들 파일은 agent prompt가 아니라 memory/eval contract입니다.

```text
memory/schemas/memory-object.schema.yaml
memory/policies/write-policy.md
memory/policies/retrieval-gate.md
memory/policies/promotion-policy.md
evals/README.md
evals/memory-recall/README.md
evals/memory-poisoning/README.md
agents/memory-curator.md
agents/verifier.md
```

### 5.3 MVP 순서 수정

권장 MVP 순서:

1. Memory object schema
2. Retrieval gate policy
3. Minimal eval harness
4. Memory curator agent
5. File-based memory layout
6. Skill schema
7. 2-3개 sample skill
8. Poisoning/stale-memory regression cases

이 순서가 중요한 이유는, memory를 먼저 쌓으면 오염된 자료를 나중에 청소하기 어렵기 때문입니다.

## 6. 최종 판단

이전 보고서는 방향은 좋지만, 최신 연구 기준에서 "best possible"이라고 말하려면 다음 문장으로 재정의해야 합니다.

> 자가 학습 에이전트는 스스로 기억을 늘리는 시스템이 아니라, 경험을 검증 가능한 evidence와 replay 가능한 skill로 변환하고, trust gate를 통과한 일부만 다음 행동에 제한적으로 반영하는 시스템이다.

Vulpora에는 이 철학이 잘 맞습니다. 이 레포의 장점은 특정 제품 런타임에 묶이지 않고 portable agent assets를 관리할 수 있다는 점입니다. 그러므로 제품별 memory backend를 먼저 고르기보다, memory schema, retrieval gate, promotion policy, eval fixture를 먼저 고정하는 것이 최선입니다.

## 7. 참고 자료

- Memory for Autonomous LLM Agents: Mechanisms, Evaluation, and Emerging Frontiers, https://arxiv.org/abs/2603.07670
- Agent Memory: Characterization and System Implications of Stateful Long-Horizon Workloads, https://arxiv.org/abs/2606.06448
- MemGym: a Long-Horizon Memory Environment for LLM Agents, https://arxiv.org/abs/2605.20833
- Beyond Similarity: Trustworthy Memory Search for Personal AI Agents, https://arxiv.org/abs/2606.06054
- From Untrusted Input to Trusted Memory: A Systematic Study of Memory Poisoning Attacks in LLM Agents, https://arxiv.org/abs/2606.04329
- Poison Once, Exploit Forever: Environment-Injected Memory Poisoning Attacks on Web Agents, https://arxiv.org/abs/2604.02623
- Mem0: Building Production-Ready AI Agents with Scalable Long-Term Memory, https://arxiv.org/abs/2504.19413
- Zep: A Temporal Knowledge Graph Architecture for Agent Memory, https://arxiv.org/abs/2501.13956
- A-MEM: Agentic Memory for LLM Agents, https://arxiv.org/abs/2502.12110
- MIRIX: Multi-Agent Memory System for LLM-Based Agents, https://arxiv.org/abs/2507.07957
- Cognitive Architectures for Language Agents, https://arxiv.org/abs/2309.02427
- Voyager: An Open-Ended Embodied Agent with Large Language Models, https://arxiv.org/abs/2305.16291
- Reflexion: Language Agents with Verbal Reinforcement Learning, https://arxiv.org/abs/2303.11366
- Audited Skill-Graph Self-Improvement for Agentic LLMs, https://arxiv.org/abs/2512.23760
- AI Agents That Matter, https://arxiv.org/abs/2407.01502
- Letta Docs - Stateful Agents, https://docs.letta.com/guides/core-concepts/stateful-agents
- LangGraph Memory Overview, https://docs.langchain.com/oss/python/concepts/memory
- OpenAI Agents SDK - Agent memory, https://openai.github.io/openai-agents-python/sandbox/memory/
- Mem0 Docs, https://docs.mem0.ai/
- Zep Docs, https://help.getzep.com/
