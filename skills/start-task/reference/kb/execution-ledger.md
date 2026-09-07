---
title: Start Task tamper-evident execution ledger
source: Vulpora workflow contract; Ouroboros authority/lifecycle pattern
last_fetched: 2026-08-19
skills: [start-task]
---

# 실행 ledger와 진실 경계

각 run은 `.vulpora/tasks/<run-id>/execution-ledger.jsonl`에 실행 event를 append한다. Ledger의 목적은
대화형 진행 표시, phase/task/command 순서 복원, 완료 주장과 관찰 증거의 분리, 사후 변조 탐지다.

## 기록 계약

- sole primary owner만 recorder를 호출한다. 일반 event writer는 `scripts/append-execution-ledger.js`,
  command recorder는 `scripts/record-execution-command.js`, verifier는
  `scripts/validate-execution-ledger.js`만 쓴다. Child와 병렬 lane은 ledger에 직접 쓰지 않고 structured
  result를 primary에 반환한다.
- event는 `sequence`, `recorded_at`, `run_id`, `phase`, `event_type`, `status`, `source_type`, `source_ref`,
  `message`, `previous_sha256`, `event_sha256`를 가진다.
- 첫 event의 `previous_sha256`은 64자리 0이고 이후 event는 직전 `event_sha256`를 가리킨다.
- `event_sha256`는 canonical event body의 SHA-256이다. Validator는 처음부터 chain을 재생해 순서, 이전 hash,
  현재 hash, run id, schema를 다시 계산한다.
- Primary state나 agent 쓰기 권한 밖의 anchor가 보존한 known head/count가 있으면 validator의
  `path run_id expected_head_sha256 expected_record_count` 인자로 함께 대조한다. 이 값이 있어야 완전한 마지막
  event 삭제도 탐지할 수 있다. Path-only replay는 남아 있는 prefix의 내부 일관성만 증명한다.
- 새 ledger는 exclusive create로 만들고, 기존 ledger는 전체 chain이 유효할 때만 OS append mode로 한 줄을
  추가한다. Writer로 overwrite, truncate, delete, reorder, backfill하지 않는다.
- raw transcript, prompt, secret, token, PII, 개인 절대 경로는 기록하지 않는다. `message`는 짧은 redacted
  summary이며 사실 근거는 `source_type`과 `source_ref`로 구분한다.

## 신뢰 등급

| source_type | 의미 | verified success 근거 |
|---|---|---|
| `runtime_result` | command recorder가 직접 관찰한 argv·optional stdin digest·exit/timeout/signal | 가능 |
| `filesystem_digest` | writer가 직접 re-read한 file bytes의 digest | 가능 |
| `user_decision` | 현재 conversation에서 옮긴 사용자 승인/취소 | `reported` authority claim |
| `agent_claim` | child/모델의 자기보고 | 불가; `reported`만 허용 |

일반 writer는 caller가 만든 `runtime_result`를 거부한다. `agent_claim`과 `user_decision`을 `passed`로 기록하지
않는다. Child가 완료를 말해도 primary owner가 실제 diff, writer-computed file digest, command-recorder exit를
관찰하기 전에는 완료가 아니다.

Command recorder 형식은
`record-execution-command.js LEDGER RUN PHASE TIMEOUT LABEL [--stdin-file RELATIVE_PATH] -- ARGV...`다.
`--stdin-file`이 없으면 child stdin을 닫고 report의 `stdin_sha256`은 `null`이다. 있으면 workspace 안의 regular
file을 recorder가 직접 읽어 그 bytes만 stdin으로 전달한다. Command source digest는 canonical
`{argv, stdin_sha256}`를 묶으므로 inherited/unhashed stdin은 성공 증거가 될 수 없다.
Clarification 입력은 initial `clarity-projection.round-00.json`, 각 답변 뒤
`clarity-projection.round-NN.json`으로 exclusive create하고 overwrite/delete하지 않는다. 승인된 마지막 ready
round와 byte-identical한 파일만 final `clarity-projection.json`으로 동결한다.

## 명료화 round와 liveness

하나의 persistent child 또는 leader-inline fallback session에서 round는 0부터 연속 증가한다. 각 round의
시작과 종료는 다음 source reference grammar로 immutable input/output에 결합한다.

- 시작: `<session-ref>:round:<n>:input-sha256:<64hex>`
- 진행: `<session-ref>:round:<n>:heartbeat-sha256:<64hex>`
- host yield: `<session-ref>:round:<n>:yield:<1-based-index>`
- 정상 종료: `<session-ref>:round:<n>:output-sha256:<64hex>:score:<0..100>:status:<needs_input|ready|escalated|invalid_result>`
- stall: `<session-ref>:round:<n>:stalled:<no_progress_at_yield|host_disconnect|terminal_timeout>`

`clarification_heartbeat`는 host가 실제 child output/progress를 관찰했을 때만 기록한다. Host가 terminal
결과 없이 control을 돌려주면 `clarification_host_yielded`를 기록한다. 직전 yield 뒤 heartbeat나 terminal
output이 하나도 없는데 host가 다시 yield하면 그 round는 `no_progress_at_yield`로 닫아야 하며 정상 finish를
붙일 수 없다. Disconnect와 host-owned terminal timeout은 해당 reason으로 즉시 stall한다. 이 규칙은 고정
55초나 최대 12턴을 다른 이름으로 되살리는 timeout이 아니라, host가 이미 제공한 scheduling 경계에서
무진행 상태를 탐지하는 liveness 계약이다. `needs_input`으로 끝난 round만 다음 round를 열 수 있다.

## 필수 event

- run/spec: `run_initialized`, `clarity_gate_validated`, `artifact_frozen`
- phase: `phase_started`, `phase_finished`
- child: `child_dispatched`, `child_finished`
- clarification round: `clarification_round_started`, `clarification_heartbeat`,
  `clarification_host_yielded`, `clarification_round_finished`, `clarification_round_stalled`
- command: command recorder가 쌍으로 쓰는 `command_started`, `command_finished`
- decision: `integration_recorded`, `verification_recorded`, `retry_recorded`, `terminal_recorded`

Start와 finish를 짝지어 남긴다. 실패·timeout·cancel도 성공과 같은 방식으로 append하며 기존 event를
고쳐 쓰지 않는다. Spec/DAG freeze event는 re-read SHA-256 source reference를 포함한다.
Terminal `complete` 전에는 validator의 `complete` profile을 사용한다. 이 profile은 phase 순서, 7개 phase의
정확한 start/finish 경계, task-splitter dispatch/finish 쌍과 requirement-dialogue dispatch/finish 또는 primary
clarification fallback start/finish 쌍, 서로 다른 spec/DAG
filesystem digest 2개, clarify/verify에서 실제 exit 0인 command 쌍, gate/integration/verification/terminal
필수 event를 검사한다. 필수 이름만 맞춘 `agent_claim/reported` event 집합은 complete가 될 수 없다.
Complete profile에는 candidate v3 report와 workspace root도 전달한다. Validator는 실제
`clarified-spec.yaml`/`task-dag.yaml` bytes와 report SHA, approve/split ledger source reference를 다시 결합하고,
`child:<agent-id>:<native-child-id>`를 report child identity와 맞추며, report의 모든 verification argv/exit를
command event와 대조한다. Approve에는 bundled `validate-clarity-gate.js`의 exact argv가 한 번 있어야 하며,
recorder가 읽은 `--stdin-file` digest는 canonical `clarity-projection.json`, spec의
`clarity_projection_sha256`, report의 `clarity_gate_evidence`와 모두 일치해야 한다.

## 라우팅 영수증의 검증 범위

Dispatch의 모델 별칭 필드는 서로 일치해야 한다. 추론 강도(`selected_reasoning_effort`,
`reasoning_effort`, `selected_route.reasoning_effort`)가 하나라도 있으면 attempt receipt의
`runtime_reported_reasoning_effort`와 정확히 일치해야 한다. 강도가 양쪽 모두 없는 기존 최소 영수증은
모델만 대조한 증거이며 추론 강도는 `NOT_VERIFIED`다. Requirement digest가 제공되면 v2 handoff의
`route_requirement_sha256`과도 일치해야 한다. 이 대조는 영수증 간 일관성 검사이지 실제 런타임 관측의
출처 인증을 대신하지 않는다.

같은 task의 연속 attempt는 직전 잔여량에서 현재 `budget_debit`를 뺀 값이 현재 잔여 relative units와
estimated tokens가 되어야 하며, 잔여 attempts는 하나 줄어야 한다. Complete 검증은 frozen ledger 순서를
사용하고, ledger 없는 독립 검증은 report의 attempt 배열을 시간순으로 해석한다. 서로 다른 task의 예산은
합치지 않는다. Hop 잔여량은 증가하거나 한 전이에서 두 개 이상 감소할 수 없으며, failover/escalation과
무관한 차감도 허용하지 않는다. 같은 route retry/repair에서 모델이나 추론 강도를 바꿀 수 없다.

첫 attempt의 초기 배정량, handoff 예약 시점, hop 예약/차감 시점, run 전체 예산, 실제 청구액은 현재
영수증만으로 확정할 수 없어 `NOT_VERIFIED`다. 이 검증을 hard billing limit이나 실제 사용량 계측으로
보고하지 않는다.

## 사용자 진행 표시

Append 성공 결과가 반환된 직후 다음 한 줄을 사용자에게 보여준다.

```text
작업 로그: #<sequence> <phase>/<event_type> — <message> [head <event_sha256 앞 12자리>]
```

표시값은 recorder 반환값에서만 가져온다. 긴 작업은 의미 있는 phase/task/command 전환마다, 그리고 활성
작업이 60초를 넘으면 그 안에 적어도 한 번 기록·표시한다. 검증 시 ledger record와 최상위 assistant
message의 `작업 로그:` 줄은 순서와 개수가 정확히 1:1이어야 한다. Tool stdout이나 추가된 가짜 log는
사용자에게 표시된 진행으로 인정하지 않는다.

## 불변성 한계

로컬 hash chain은 중간 수정·삭제·재정렬·부분 절단을 탐지하고 trusted head/count가 있으면 tail 삭제도
탐지하지만, 같은 filesystem 전체를 통제하는 행위자가 ledger와 모든 local anchor를 함께 다시 만들 수
있으므로 절대 불변은 아니다. 따라서 기본
`integrity_level`은 `local_tamper_evident`다. v3 report는 `external_anchor: null`만 허용해 AI가 임의 문자열로
외부 anchor를 주장하지 못하게 한다. AI 쓰기 권한 밖의 runtime-owned event store, WORM sink, 또는 remote
transparency log를 지원하려면 host-side verifier와 함께 새 contract version으로 추가해야 한다. 로컬 Git
object, ref, reflog, `.committed`, `.head`만으로는 외부 anchor라고 주장하지 않는다.

## 리뷰 훅

- [ ] 모든 phase/task/command start와 finish가 ledger에 있는가?
- [ ] self-report가 observed pass로 승격되지 않았는가?
- [ ] artifact hash와 command exit가 해당 recorder가 만든 source reference에 연결되는가?
- [ ] terminal 전에 full-chain validator가 통과했는가?
- [ ] report의 path/head/count가 validator 결과와 일치하는가?
- [ ] 사용자 progress line이 append 결과에서만 렌더링됐는가?
- [ ] 외부 anchor가 없는데 absolute immutable이라고 주장하지 않았는가?
