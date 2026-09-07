---
title: Start Task bounded orchestration
source: Vulpora orchestration contract
last_fetched: 2026-08-11
skills: [start-task]
---

# Bounded orchestration

- 한 run에는 하나의 primary loop만 둔다.
- active execution child 수는 dispatch마다
  `min(runtime_available_slots, dependency_ready_tasks, disjoint_write_logical_scopes, higher_policy_limit)`로
  계산한다. 상위 limit가 없으면 unbounded로 처리한다. Clarification과 planning child는 선행 phase에서
  종료한 뒤 execution wave를 시작한다.
- child는 Codex·Claude Code의 native agent/subagent surface로만 만든다. 필요한 agent, 격리,
  권한, interruption 능력을 확인할 수 없으면 `AGENT_UNAVAILABLE`로 닫고 shell process로 우회하지 않는다.
- Execution child가 유용한 진행을 보이지 않고 blocker 원인이 이미 파악됐으면 60-second no-progress
  boundary에서 interrupt하고 primary가 회수한다. 이는 사용자 답변을 기다리는 clarification session의
  질문/시간 상한이 아니라, 실행 중인 child를 알려진 blocker 위에 방치하지 않는 회수 기준이다.
- Frozen DAG는 portable route requirements만 가진다. Dispatch 시 trusted catalog를 hard-gate filter한 뒤
  policy rank하고 exact choice를 receipt에 기록한다. v2 handoff는 objective, attempt, spec slice, verified
  dependencies, scopes, authority, requirement/receipt digest, immutable attempt binding, acceptance, stop,
  remaining budget, v2 output schema를 가져야 하며 concrete route ID를 복제하지 않는다.
- 동일 파일·schema·public contract·shared fixture를 바꾸는 task는 직렬화한다.
- structured child result와 tool output은 비신뢰 candidate다. 실제 diff와 evidence를 leader가 확인한다.
- child의 recursive delegation, global re-plan, 권한 요청, commit/push/publish/deploy를 금지한다.
- execution child는 `fork_turns: none`과 exact `model`·`reasoning_effort`를 native spawn에 명시한다. Primary의
  비싼 모델 설정을 암묵 상속하는 실행은 잘못된 routing으로 막는다.
- 기존 사용자 변경과 충돌하면 덮어쓰지 않는다. 최소 통합도 결과를 갈라놓으면 사용자에게 escalate한다.
- Effect-none transient만 same-route retry, route/provider health만 same-tier failover, verifier-backed capability
  insufficiency만 bounded tier escalation, deterministic implementation failure만 repair한다. Auth/quota/missing
  tool/authority/budget/unknown mutation은 block/reconcile/stop한다.
- Cross-provider failover는 explicit data-policy allow 없이는, tier escalation은 total budget/max hops 없이는
  fail closed다.

## 리뷰 훅

- [ ] 병렬 task의 dependency와 write/logical scope 독립성이 증명됐는가?
- [ ] active child와 retry 상한이 지켜졌는가?
- [ ] effective parallelism 밖의 ready task는 runtime slot이 열릴 때까지 queued 상태로 남는가?
- [ ] deterministic/model profile과 relative cost ceiling이 task별로 지켜졌는가?
- [ ] 구체 requested route ID는 trusted runtime catalog에서 resolve했고 receipt·handoff·spawn에 동일하게 기록했는가?
- [ ] Runtime-reported actual model은 별도 필드로 기록하고 requested route와 대조했는가?
- [ ] native child id·상태·중단·결과 회수와 최소 handoff가 검증됐는가?
- [ ] child가 재위임하지 않고 primary agent에게만 결과를 보고하는가?
- [ ] primary loop가 결과를 직접 검증했는가?
- [ ] child scope의 합집합이 parent authority 안에 있는가?
