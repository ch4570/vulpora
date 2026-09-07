---
title: Acceptance-driven task decomposition quality gate
source: Vulpora orchestration contract; PMI work breakdown structure; Anthropic orchestrator-workers pattern
last_fetched: 2026-08-25
consumers: [task-splitter, start-task]
owner: task-splitter
source_type: internal-contract
status: verified
evals: [task-splitter.feature-decomposition-quality.v1]
---

# Acceptance-driven task decomposition quality gate

분해는 파일 목록을 여러 child에게 나누는 작업이 아니다. 먼저 frozen spec의 각 acceptance criterion을
사용자에게 보이는 결과, 변경되는 contract/state, 이를 증명할 검증으로 연결한 `AC → contract → evidence`
지도를 만든다. 그 다음에만 owner와 task 경계를 정한다.

## 분해 순서

1. 각 AC가 바꾸는 observable behavior, public/internal contract, persistent/shared state, 최종 evidence를 적는다.
2. repository map에서 해당 contract의 실제 component와 기존 test seam을 찾는다. 찾지 못한 경로는 발명하지
   않고 discovery task의 bounded outcome으로 둔다.
3. shared contract·schema·generated artifact·공유 파일을 먼저 식별해 single owner를 지정한다.
4. 서로 다른 owner 전문성, 독립 검증, disjoint write/logical scope 중 하나가 실제로 생길 때만 task를 나눈다.
5. task별로 사용자 관찰 가능한 outcome 하나, 연결된 AC, 정확한 done evidence, dependency output을 적는다.
6. AC와 task의 양방향 coverage, dependency edge, 병렬 독립성을 다시 대조한다.

## 강제 품질 조건

- `백엔드 구현`, `테스트 추가`, `DB 작업`, `정리`, `통합`처럼 대상 contract와 결과가 없는 objective는
  invalid다. `주문 생성 API가 새 상태를 저장하고 기존 오류 계약을 유지한다`처럼 결과를 명시한다.
- controller/service/repository/test 같은 layer 또는 file type만으로 horizontal slice하지 않는다. 하나의
  동작을 검증하려면 강하게 결합된 layer를 같은 vertical slice에 둔다.
- test task를 별도 owner에게 넘기는 것이 구현 contract를 다시 추측하게 만든다면 같은 task의 첫 단계로
  둔다. 독립 acceptance harness나 cross-cutting regression suite일 때만 별도 task로 둔다.
- 한 task의 결과가 다른 task의 raw prose를 해석해야만 실행 가능하면 handoff가 불완전하다. Downstream은
  frozen artifact, exact path, schema, command evidence 같은 검증 가능한 dependency output만 받는다.
- 같은 파일, schema, logical state를 건드릴 가능성이 있으면 edge를 추가하거나 합친다. 추정 병렬성은
  허용하지 않는다.
- coordination-only task, orphan AC, 검증 없는 구현 task, task 없는 AC, AC 없는 task, 작은 작업의 인위적
  과분해는 ready DAG를 막는다.

## 최종 decomposition audit

Ready를 내기 전에 다음을 모두 0건으로 만든다: vague objective, file-type-only slice, orphan AC, orphan task,
implicit dependency, overlapping parallel scope, raw-prose dependency, coordination-only task, fake parallelism.
하나라도 남으면 task를 합치거나 objective·edge·evidence를 고친 뒤 다시 검사한다.

## 리뷰 훅

- [ ] AC마다 observable behavior, contract/state, evidence가 연결됐는가?
- [ ] task를 나눈 이유가 owner 전문성·독립 검증·scope 독립성 중 하나로 설명되는가?
- [ ] 모든 objective가 하나의 구체 결과와 done evidence를 가지는가?
- [ ] layer/file type 기준 분할과 coordination-only task가 없는가?
- [ ] downstream이 raw child 설명 없이 검증된 artifact로 시작할 수 있는가?
- [ ] 작은 작업을 하나로 유지하고, 병렬성은 dependency와 scope로 증명했는가?
