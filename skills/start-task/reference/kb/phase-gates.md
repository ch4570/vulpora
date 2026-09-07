---
title: Start Task phase gates
source: Vulpora workflow contract; ISO/IEC/IEEE 29148:2018
last_fetched: 2026-08-25
skills: [start-task]
---

# Start Task phase gates

허용 전이는 다음과 같다.

```text
clarify -> approve(commit) -> split -> execute -> integrate -> verify -> terminal
    |          |             |         |           |          |
    +--------> escalated/cancelled/failed/partial <-------------+

verify --deterministic repair within frozen spec--> verify
terminal(partial) --validated checkpoint--> fresh successor run
```

- `clarify -> approve`: actionable spec, blocking unknown 0, clarity gate `passed|skipped`; 현재 사용자의 구현
  요청 digest를 `spec_committed` user-decision event로 기록한다. Generic freeze question은 보내지 않는다.
- `approve -> split`: committed spec projection과 frozen spec hash가 일치하고 run-control validator가 통과함.
- `split -> execute`: DAG ready, acyclic, AC coverage 100%, authority-valid.
- `execute -> integrate`: dependency-ready task 결과가 candidate로 수집됨.
- `integrate -> verify`: scope/conflict 검사가 끝남.
- `verify -> complete`: 모든 AC verified, pending/error 0.
- `terminal(partial) -> successor run`: runtime configuration, frozen spec/DAG, clarity projection, ledger,
  HEAD/diff fingerprint를 검증한 새 run만 pending frontier를 이어간다. 기존 terminal ledger에 phase back-edge를
  append하지 않고 verified task/AC evidence만 immutable provenance로 가져온다.

각 transition checkpoint는 현재 phase의 work event 뒤, 현재 `phase_finished`와 다음 `phase_started` 앞에서
검증하고 freeze한다. Checkpoint가 통과한 뒤에만 그 두 lifecycle event를 순서대로 append한다. Ledger
chain replay, expected head/count, run id 중 하나라도 불일치하면 다음 transition을 막는다.
각 control projection은 `run-control-NNNN.json`에 exclusive-create하고, 이전 파일 hash가 ledger의 마지막
`run_control_state_frozen` event와 일치할 때만 다음 파일을 검증·append한다. 질문 이력, spec hash/revision,
task/AC inventory와 observed evidence는 checkpoint 사이에서 삭제하거나 초기화할 수 없다.
Run directory와 ledger는 clarification child를 부르기 전에 exclusive create하며, clarify/approve event를
나중에 backfill하지 않는다. 승인 전 product write는 금지하지만 이 run-local audit metadata와 deterministic
clarity/question validator command 기록은 허용한다.

질문은 `clarify`에서만 사용자 턴마다 결정 축 1개로 제한하되 고정된 총량 상한을 두지 않는다. 매 턴
명확도·모호성, 미결정 영역, 가역적 결정의 추천 기본값과 영향, 안전할 때 현재 상태로 구현할 수 있다는
선택을 보여준다. 사용자가 구현을
선택하면 가역적 unknown을 accepted risk로 기록하고 숫자 threshold만 우회한다. Freeze 뒤
split→clarify 및 execute→plan 복귀는 0회다. Execution의 same-route retry, same-tier failover, tier escalation은 v2 task별/전체 budget·hop·attempt
bounds 중 작은 상한을 따르고 repair cycle은 2회가 상한이다. Unknown mutation retry는 0회다.

사용자의 구현 요청은 현재 actionable scope의 실행 의도다. 가역적 unknown은 명시적 assumption으로
처리하지만 비우회 blocker는 `clarify`에 남긴다. Ready spec bytes는 첫 checkpoint의 spec hash를 위해
`clarify`에서 준비하지만 audit freeze evidence는 commit 뒤에 기록한다. 상태 전이는
`prepare spec -> checkpoint clarify/approve -> approve(commit) -> freeze spec evidence -> checkpoint approve/split -> split -> freeze DAG -> execute` 순서를 지킨다.

## 리뷰 훅

- [ ] 구현 전 네 gate(spec ready, clarity passed/skipped, no blocker, implementation-intent commit)를 모두 확인했는가?
- [ ] phase를 건너뛰거나 무한 되돌림이 없는가?
- [ ] cancel 뒤 새 dispatch/mutation을 하지 않는가?
- [ ] 새 local override가 implementation detail이면 additive directive로 처리하고 normative change면 successor run을 만드는가?
- [ ] 한 사용자 턴에 결정 하나만 묻고, 추천 기본값과 자유 입력 경로 없이 폐쇄형 선택지를 강제하지 않는가?
- [ ] 명확도와 모호성의 합이 100이며 미결정 영역과 진행 선택을 사용자에게 보여주는가?
- [ ] 85점 미만인데 사용자의 명시적 진행 결정 없이 spec을 ready로 판정하지 않았는가?
- [ ] skip이 숫자 gate만 우회하고 권한·파괴적 작업·외부 부작용 blocker는 보존하는가?
