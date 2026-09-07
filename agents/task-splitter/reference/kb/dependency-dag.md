---
title: Task dependency DAG와 병렬 wave
source: Vulpora docs/agent-mcp-design-rules.md section 5.1; graph theory DAG definition
last_fetched: 2026-08-11
consumers: [task-splitter, task-orchestrator]
---

# Task dependency DAG와 병렬 wave

- edge `A -> B`는 B가 A의 산출물, 결정 또는 state를 필요로 함을 뜻한다.
- cycle이 있으면 task 경계가 잘못됐거나 상호 계약이 정해지지 않은 것이다. task를 합치거나 interface 결정을
  선행 task로 분리한다.
- 같은 wave에는 서로 reachable하지 않고 write scope가 겹치지 않는 task만 둔다.
- 단순히 서로 다른 파일이라는 이유만으로 독립이라고 보지 않는다. schema, public API, generated artifact,
  shared test fixture의 논리적 충돌도 확인한다.
- integration과 전체 verification은 구현 leaf 뒤에 둔다.

## 리뷰 훅

- [ ] cycle과 self-dependency가 0인가?
- [ ] 모든 `depends_on` id가 존재하는가?
- [ ] 같은 wave의 task가 write·schema·public contract를 공유하지 않는가?
- [ ] integration task가 모든 필요한 leaf를 기다리는가?
