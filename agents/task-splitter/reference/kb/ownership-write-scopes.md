---
title: Bounded ownership와 write scope
source: Vulpora STANDARD.md section 6 Agent contract; docs/agent-mcp-design-rules.md section 5.1
last_fetched: 2026-08-11
consumers: [task-splitter, task-orchestrator]
---

# Bounded ownership와 write scope

각 task owner는 다음을 함께 받는다.

- 하나의 objective와 제외 범위
- 필요한 최소 read scope와 정확한 write scope
- 허용 tool·외부 효과·credential 범위
- 기대 출력과 acceptance tests
- stop condition, 시간/tool/token budget

write scope는 가능한 한 구체적인 파일 또는 디렉터리 prefix다. unresolved glob, workspace root 전체,
사용자 home은 범위가 아니다. shared file이 필요하면 한 owner에게 통합 책임을 주거나 dependency로 직렬화한다.

## 리뷰 훅

- [ ] owner role이 task에 필요한 역량을 설명하는가?
- [ ] write scope가 명세의 allowed writes 안에 있는가?
- [ ] 병렬 task끼리 같은 generated/shared file을 수정하지 않는가?
- [ ] 하위 task가 parent보다 넓은 network·credential·destructive 권한을 갖지 않는가?
