---
title: Start Task terminal status and reporting
source: Vulpora lifecycle and assurance contract
last_fetched: 2026-08-11
skills: [start-task]
---

# Terminal status and reporting

| Status | 필요 조건 |
|---|---|
| `complete` | 모든 in-scope AC verified, pending 0, known in-scope error 0 |
| `partial` | 독립적으로 유용한 subset verified, 남은 task와 영향 및 재개 checkpoint가 명시됨 |
| `failed` | 필수 결과를 안전하게 만들거나 검증하지 못함 |
| `cancelled` | 새 dispatch/mutation 중지, 이미 발생한 변경과 미실행 검증 명시 |
| `escalated` | authority/destructive/material branch에 사용자 결정 필요 |

최종 보고에는 changed files, simplifications, task status, 실제 verification 명령·결과, conflict/retry,
known risks와 gaps를 넣는다. dry schema validation과 child self-report를 actual runtime verification으로
표현하지 않는다.

모든 terminal status는 `execution_ledger`를 포함한다. Terminal event를 append하기 직전에 chain을 replay하고,
report에는 validator가 반환한 상대 path, record count, head SHA-256, `local_tamper_evident`,
validator outcome, `external_anchor: null`을 그대로 기록한다. 로컬 ledger만 있으면 immutable이라고 부르지
않으며, chain 오류가 있으면 `complete`를 금지한다.
`clarity_gate_evidence`에는 canonical projection path와 SHA-256을 기록하고 clarity validator의
`verification.stdin_sha256`과 spec의 `clarity_projection_sha256`에 결합한다. 다른 verification command의
`stdin_sha256`은 `null`이다.

최종 artifact는 한국어 요약과 정확히 하나의 `json` fenced object다. JSON은
[`orchestration-report.schema.json`](orchestration-report.schema.json)의 exact `$id`와
`schema_version: vulpora.orchestration-report/v3`를 만족하고, 현재 `run_id`와
`runtime_instance_id`가 독립 runtime evidence와 일치해야 한다. `clarify -> approve -> split -> execute ->
integrate -> verify -> terminal` 순서, runtime-native entrypoint, exact clarification/planning children와
runtime-derived execution children, primary-inline ownership, frozen spec/DAG path·SHA-256, argv/exit/timeout, cleanup,
changed files, structured routing attempt receipt lineage, conflict/retry/risk/gap을 모두 기록한다. stale,
prose-only, wrong-version report는 non-pass다. Ledger·routing receipt provenance가 없는 v1/v2 checkpoint는
v3 resume evidence로 승격하지 않는다. 기존 v1/v2 partial은
self-report를 재사용하지 않고 새 run에서 spec/DAG와 ledger를 다시 freeze한다.
`changed_files`에는 task가 수정한 product/source 파일만 넣고, workflow가 만든 spec/DAG 경로는
`clarified_spec.path`와 `task_dag.path`에만 기록한다.

## Partial continuation contract

`partial`은 추가 질문이 아니라 검증 후 successor run에서 재개 가능한 checkpoint다. 보고서의 `continuation`에는
resume frontier, exact completed/pending task set, gap에 결합된 remaining AC, blocker, 다음 action, 재개 조건,
HEAD/diff workspace fingerprint, 보존할 spec/DAG path·SHA-256을 기록한다.
`status: ready_to_resume`, `question: null`을 기록한다. JSON fence 뒤에는 질문이나 추가 content를 붙이지
않는다. 사용자 결정이 필요한 material blocker는 `partial`이 아니라 현재 run을 `escalated`로 닫는다.

재개 시 frozen artifact와 canonical clarity projection hash, execution ledger replay head/count, runtime configuration identity,
관련 working-tree state를 먼저 재검증한다. 모두 같으면 successor run에서 이미 verified인 task를 다시 돌리지 않고 가장 이른 pending task 또는 verify부터
이어간다. 하나라도 달라졌으면 fresh run으로 시작하며 이전 runtime evidence를 재사용하지 않는다. 사용자가
미검증 위험을 수용해도 해당 AC의 증거가 생기기 전에는 `complete`로 승격하지 않는다.

명령 결과도 의미적으로 일관되어야 한다. `outcome: pass`는 반드시 `exit_code: 0`이어야 하고,
`not_run|cancelled|timeout`은 `exit_code: null`이어야 하며 network success는 attempt를 넘을 수 없다.

## 리뷰 훅

- [ ] terminal status가 task/AC evidence와 일치하는가?
- [ ] partial이 원자적 기능의 실패를 성공으로 포장하지 않는가?
- [ ] partial에 pending 작업, blocker, resume 조건, frozen artifact hash가 있고 question은 null인가?
- [ ] successor run 재개 시 검증된 task/AC evidence만 가져오고 pending frontier부터 이어가는가?
- [ ] verification outcome과 exit code가 모순되지 않는가?
- [ ] execution ledger chain 검증 결과와 report의 path/head/count/integrity가 일치하는가?
- [ ] 외부 anchor가 없는데 로컬 ledger를 immutable이라고 부르지 않았는가?
- [ ] 취소 시 working tree 상태와 미실행 검증을 알리는가?
- [ ] secret, raw transcript, 개인 절대 경로를 보고하지 않는가?
