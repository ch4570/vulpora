---
title: Task acceptance, risk, budget 계약
source: ISO/IEC/IEEE 29148:2018 traceability; Vulpora STANDARD.md sections 5-7
last_fetched: 2026-08-11
consumers: [task-splitter, task-orchestrator]
---

# Task acceptance, risk, budget 계약

- 모든 task는 하나 이상의 `acceptance_criterion_ids`와 이를 입증할 `acceptance_tests`를 가진다.
- risk는 `low|medium|high|critical`이며 영향과 회복 난이도의 이유를 적는다.
- high/critical, destructive, external side effect, public contract 변경은 별도 approval reference 없이는 실행
  task가 될 수 없다.
- budget은 tool call, wall-clock, token, retry, result-size, 상대 cost unit과 parallelism 중 적용 가능한
  상한을 가진다.
- `deterministic` task는 model token/cost가 0이어야 한다. LLM task는 per-attempt와 task-total relative
  cost/token ceiling, max total attempts, route hops, same-route retry, same-tier failover, tier escalation을
  함께 예산화한다. 허용된 attempt 수를 감당하지 못하는 total budget은 invalid다.
- Cross-provider failover는 explicit versioned data-policy allow가 없으면 0회다. Tier escalation은 verifier
  evidence, total budget, max hops/attempts가 모두 없으면 0회다.
- 검증 명령을 모르면 발명하지 않고 repository-native discovery를 task의 첫 단계로 둔다.

## 리뷰 훅

- [ ] 모든 AC가 task와 최종 verification에 연결되는가?
- [ ] risk 이유와 rollback/recovery 방식이 있는가?
- [ ] task budget이 bounded이며 전체 budget과 모순되지 않는가?
- [ ] 비싼 모델이 필요 없는 task와 결정적 검증이 낮은 tier 또는 model-free로 라우팅됐는가?
- [ ] 알려지지 않은 명령·경로·API를 사실처럼 만들지 않았는가?
