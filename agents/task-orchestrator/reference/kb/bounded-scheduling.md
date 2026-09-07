---
title: Bounded native-child scheduling
source: Vulpora docs/agent-mcp-design-rules.md section 5.1; Anthropic Building Effective Agents
last_fetched: 2026-08-11
consumers: [task-orchestrator]
---

# Bounded native-subagent scheduling

dispatch 조건:

1. 모든 dependency가 verified다.
2. 같은 wave의 active task와 write scope·logical shared state가 겹치지 않는다.
3. objective, inputs, expected output, tools, write scope, stop, budget이 완전하다.
4. child authority가 parent ceiling의 부분집합이다.
5. task의 v2 capability/risk/reasoning/cost/policy requirement가 완전하고, trusted catalog filter/rank 뒤의
   dispatch-time route/reasoning choice가 task/run budget 안이며 parent inheritance를 사용하지 않는다.
6. active child 수가
   `min(runtime_available_slots, dependency_ready_tasks, disjoint_write_logical_scopes, higher_policy_limit)`
   미만이다. 상위 limit가 없으면 unbounded로 처리한다.

Native subagent를 기본으로 사용하고 이용할 수 없으면 `leader-inline`을 명시하거나 blocked로 닫는다.
어떤 mode든 전체 transcript나 global plan을 받지 않는다. 필요한 spec slice와 파일 경계만 받는다.
실행 주체가 scope 확대·다른 child·새 외부 권한을 제안하면 실행하지 않고 leader에게 handoff한다.
Route 변경은 scheduling shortcut이 아니다. `routing-state-machine.md`의 classifier와 receipt gate를 통과한
새 attempt에서만 same-route retry, same-tier failover, tier escalation, repair를 실행한다.

## 리뷰 훅

- [ ] dependency가 검증되기 전에 dispatch하지 않았는가?
- [ ] active child가 현재 effective parallelism 이하인가?
- [ ] handoff에 objective/scope/output/tool/portable route requirement/dispatch receipt/stop/budget이 모두 있는가?
- [ ] child의 recursive orchestration과 external mutation이 금지됐는가?
- [ ] child가 runtime native surface로 생성되고 delegation depth 0을 지키는가?
