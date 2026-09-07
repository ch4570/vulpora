# start-task 실행 프로필

`start-task`는 작업 크기가 아니라 실패 비용과 불확실성으로 실행 프로필을 고른다. 기본값은 직접
실행이며, 감사형 절차는 명시적 요청이나 고위험 신호가 있을 때만 활성화한다.

## 프로필 선택

| 프로필 | 대상 | 질문·계획 | 실행 | 증거 |
|---|---|---|---|---|
| `lightweight` | 범위·성공 조건·검증이 명확한 가역적 변경 | 간결한 working brief 1회, 확인 질문 없음 | primary 한 명이 직접 순차 실행 | diff와 관련 검증 결과 |
| `standard` | 일반 API 계약, shared schema, 넓은 범위, material unknown, 독립 lane 2개 이상 | 필요한 결정을 한 턴에 요약, 짧은 계획 | coupled 변경은 primary 한 명; 완전히 독립적인 lane만 선택적 child | diff와 최종 통합 검증 |
| `audit` | 보안·권한, credential, production migration/backfill, 다중 서비스 production 배포, 비가역·파괴 작업, 복구 어려운 외부 효과, 규제·감사 증거 | 명확도 gate, immutable spec, DAG | v1 scheduler와 bounded children | append-only ledger, receipt, frozen artifact, AC evidence |

일반적인 공개 API 계약 변경은 `standard`다. 여러 모듈을 건드리더라도 하나의 request model 변경에
연쇄적으로 묶이면 독립 lane으로 나누지 않는다. 작업량이 작다는 이유만으로 위험 신호를 낮추거나,
파일 수가 많다는 이유만으로 audit를 선택하지 않는다.

프로필 판정은 `skills/start-task/scripts/select-execution-profile.js`가 구조화된 관찰 신호를 검증해
결정한다. 자동 선택은 `$start-task "<task>"`, 명시 선택은 task 앞에 정확히 하나의
`--lightweight|--standard|--audit` token을 둔다. 명시한 `lightweight`도 audit risk floor를 우회할 수 없다.
신호는 사용자 요청, 상위 policy, 저장소·계약의 관찰 근거에서만 설정한다. 안전 여부가 아직 미확정이면
`standard`에서 조사하고, audit 신호가 확인되는 즉시 위험 action 전에 상향한다.

## Lightweight·standard 흐름

1. 저장소와 관련 외부 계약을 먼저 확인한다.
2. goal, scope, 결정, acceptance, verification, risk를 하나의 concise working brief로 정리한다.
3. 구현 요청은 이미 실행 의도이므로 안전한 기본값으로 해결되는 경우 추가 동결 확인을 묻지 않는다.
4. 사용자 결정이 정말 필요하면 현재 알려진 material choice를 한 턴에 묶고 추천 기본값을 제시한다.
5. coupled 변경은 한 primary가 순차 구현한다. 독립 실행·독립 검증이 가능한 lane만 child에 맡긴다.
6. child write scope에는 결과에 필요한 설정·fixture·test resource를 포함한다. 원인이 알려진 blocker로
   60초 동안 진전이 없으면 primary가 interrupt 또는 회수한다.
7. 관련 검증을 한 번 실행한다. child 결과를 재사용할 수 있으면 무조건적인 `--rerun`으로 중복 실행하지
   않고, 결합된 변경에 필요한 최종 integration check만 수행한다.
8. changed files, 단순화, 검증, 남은 위험을 일반 coding report로 반환한다.

이 두 프로필은 `.vulpora/tasks` run, 명세 hash, DAG, projection, ledger, routing receipt, orchestration JSON을
만들지 않는다. 실행 중 audit 신호가 발견되면 위험한 action 전에 audit로 올린다.

## Audit profile

Audit는 기존 `vulpora.start-task/v1` 계약을 그대로 사용한다.

| 단계 | 실행 주체 | 산출물·판정 |
|---|---|---|
| clarify | primary + 지속형 `requirement-dialogue` session | 결정론적 점수와 ambiguity ledger |
| approve | primary | 구현 의도에 결합한 frozen spec |
| split | `task-splitter` | AC coverage를 가진 frozen DAG |
| execute | primary scheduler | 필요 profile을 runtime route로 해소한 bounded child 또는 leader-inline |
| integrate | primary | 실제 diff와 child candidate 검사 |
| verify | deterministic command 또는 judgment task | ledger-bound acceptance evidence |
| terminal | primary | ledger replay와 schema-valid report |

Ledger는 run 시작 시 만들지만 spec·DAG·routing receipt는 각 phase에 도달했을 때만 만든다. Routing
receipt는 native execution attempt에만 필요하며, 전부 leader-inline인 DAG에는 가짜 receipt를 만들지 않는다.
Audit report의 증거 수준은 외부 anchor가 없는 `local_tamper_evident`다. 독립 외부 anchor나 production
권한·credential·rollback authority가 요구되면 이 workflow가 발명하지 않고 정확한 blocker로 남긴다.

Audit ledger writer는 `initialize-run.js`로 생성된 run의 phase 순서를 append 전에 검사한다. 현재 phase가
끝나기 전 다음 phase event를 쓰거나 adjacent `phase_started`를 건너뛰면 파일을 변경하지 않고 거부한다.
따라서 순서가 잘못된 시도는 같은 run에서 올바른 event를 다시 제출하면 되며 run 전체를 재생성하지 않는다.

Audit의 상세 불변식과 모델 routing, DAG scheduling, receipt, continuation 규약은
[`operating-contract.md`](../skills/start-task/reference/kb/operating-contract.md)와
[`runtime-fast-path.md`](../skills/start-task/reference/kb/runtime-fast-path.md)를 따른다.

## 완료 기준

모든 프로필에서 primary가 실제 diff를 검사하고, 요청 동작을 증명하는 관련 테스트를 읽고, 기존 사용자
변경을 보존한 뒤에만 완료를 선언한다. 증거 형식만 프로필에 따라 달라진다.
