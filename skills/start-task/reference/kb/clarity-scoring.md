---
title: Start Task clarity scoring and user-directed proceed decision
source: Vulpora workflow policy derived from ISO/IEC/IEEE 29148:2018 quality characteristics
last_fetched: 2026-08-25
skills: [start-task]
---

# 명확도·모호성 점수와 구현 진행 결정

Caller가 dimension `rating`을 정하지 않는다. `scripts/assess-clarity.js`가 아래 exact boolean signal 중
evidence로 관찰된 개수를 `0..4` rating으로 도출하고, 해당 dimension에 pending unknown이 있으면 최대 3으로
제한한다. `scripts/score-clarity.js`가 awarded를 `floor(weight * rating / 4 + 0.5)`로 계산해 합산한다.
점수는 문서 길이가 아니라 사용자 답변, 안전한 저장소 관찰, 상위 정책에 연결된 evidence로만 올린다.
각 dimension evidence는 `user:`, `repository:`, `policy:`, `assumption:` 중 실제 출처와 구체 근거를
포함해야 하며 placeholder나 단일 문자 claim은 점수 근거가 아니다.

| dimension | weight | exact evidence signals |
|---|---:|---|
| goal | 20 | `outcome_named`, `trigger_named`, `observable_change_named`, `user_value_named` |
| scope | 20 | `include_named`, `exclude_named`, `repository_targets_bound`, `ownership_bound` |
| acceptance | 20 | `happy_path_observable`, `failure_path_observable`, `expected_values_named`, `criterion_ids_stable` |
| constraints | 15 | `compatibility_named`, `dependency_policy_named`, `operational_limits_named`, `recovery_named` |
| authority_risk | 15 | `write_scope_named`, `external_effects_named`, `destructive_effects_resolved`, `credentials_resolved` |
| verification | 10 | `method_named`, `expected_outcome_named`, `failure_diagnostics_named`, `environment_bound` |

해석상 rating은 `0=근거 signal 없음`, `1=한 개`, `2=두 개`, `3=세 개 또는 pending unknown cap`,
`4=네 개 모두 관찰`이다. 총점은 100점이고 기본 threshold는 85점이다. Extra/missing signal,
caller-supplied rating·awarded·total, provenance 없는 evidence는 invalid input이다.

Gate 판정:

- `passed`: score >= 85, blocking unknown 0, non-bypassable blocker 0.
- `blocked`: 위 조건을 만족하지 않으며 explicit skip도 유효하지 않음.
- `skipped`: score가 85 미만이고, 사용자가 점수 표시 뒤의 답변에서 이번 run 진행을 명시했으며,
  하나 이상의 구체적인 accepted risk가 있고 non-bypassable blocker가 0.

사용자에게는 `명확도 score/100`, `모호성 (100-score)/100`을 함께 보여준다. 가장 약한 축과 남은
불확실성을 평이하게 설명하고, 비우회 blocker가 없으면 지금 구현할 경우 이를 가정·위험으로 기록한다고
안내한다.

`빨리`, `급해`, `알아서`, deadline, silence는 진행 결정이 아니다. 사용자가 점수와 미결정 영역을 본 뒤
`그래도 구현해`, `일단 만들어`, `현재 내용으로 진행해`처럼 현재 scope의 구현을 명시하면 내부 projection에
explicit skip provenance로 기록한다. Skip은 낮은 점수와 가역적인 범위
unknown만 accepted risk로 바꾼다. 실행 가능한 목표 자체의 부재, 권한 확대, 파괴적·비가역 작업,
credential/security 수준, external write/message, public API·schema, material data-model 결정은 우회하지 않는다.
Skip decision ref는 점수 표시 뒤의 `answer-sha256`만 허용한다. 최초 task digest나 과거 run의 digest를
대신 사용할 수 없다. Decision context는 run id, 그 답변 전에 동결한 offer의 score/ambiguity/unknown-id
집합과 각 unknown 의미의 canonical hash/question signature/artifact hash를 모두 보존한다. 답변 digest가 같아도 offer context가 바뀌면
무효다. 각 accepted-risk unknown은 category와 구체 summary를 가지며 DAG의 structured risk entry에
정확히 한 번 연결한다.

사용자가 `질문은 그만하고 현재 내용으로 바로 구현해`처럼 이번 run의 질문 중단과 현재 scope 구현을
명시하면 숫자 gate skip과 남은 가역적 unknown 수용 근거로 기록할 수 있다. 구현 요청 자체가 실행
의도이므로 비우회 blocker가 0이면 `ready`로 전환해 그 메시지 digest에 spec commit을 결합하고 곧바로
spec/DAG freeze와 split을 시작한다. 별도의 범용 확인 질문은 보내지 않는다.

각 질문 전후에 score와 dimension evidence를 다시 계산한다. 다음 질문은 아직 resolved되지 않은 dimension
중 기대 점수 개선 폭이 가장 큰 한 개의 결정 축이어야 한다. 가역적 결정은 repository evidence와 최소
변경 원칙으로 추천 기본값을 고르고 그 영향을 밝힌 뒤, 사용자가 기본값을 수락하거나 다른 기준을 직접
쓸 수 있는 짧은 질문으로 만든다.

## 리뷰 훅

- [ ] 각 awarded point가 user/observed/policy evidence에 연결되는가?
- [ ] exact dimension/weight 합계가 100이고 score가 awarded 합계와 같은가?
- [ ] 명확도와 모호성의 합이 100이고 사용자에게 보였는가?
- [ ] score 85 미만을 사용자의 명시적 진행 결정 없이 통과시키지 않았는가?
- [ ] `급해` 같은 표현만으로 skip을 추론하지 않았는가?
- [ ] skipped run의 reason·accepted risk·잔여 unknown을 spec과 DAG·terminal report에 보존하는가?
- [ ] non-bypassable blocker가 있으면 점수와 무관하게 구현을 막는가?
