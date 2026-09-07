---
title: Clarified task specification v2 schema
source: Vulpora internal artifact contract; RFC 2119
last_fetched: 2026-08-11
consumers: [requirement-dialogue, task-splitter, task-orchestrator]
---

# Clarified task specification v2

Actionable candidate는 현재 구현 요청 또는 material blocker 답변 digest에 결합해 바로 `status: ready`,
projection `approval: true`로 commit한다. Generic freeze question이나 별도 확인 턴은 만들지 않는다.

Final frozen bytes are canonical JSON, which is also valid YAML 1.2, stored as `clarified-spec.yaml`.
The child candidate uses the same normative body plus `schema: vulpora.clarified-task-spec-candidate/v2`,
`approval`, and `approval_basis`; it omits only primary-owned projection path/hash. A four-field ready wrapper is
not a candidate.

```json
{
  "schema": "vulpora.clarified-task-spec/v2",
  "spec_id": "task-<stable-slug>",
  "status": "ready",
  "clarity_projection_path": ".vulpora/tasks/<run-id>/clarity-projection.json",
  "clarity_projection_sha256": "<sha256>",
  "clarity_projection": {
    "spec_status": "ready",
    "approval": true,
    "unknowns": [],
    "clarity_gate": {
      "score": 100, "threshold": 85, "status": "passed",
      "dimensions": [
        {"id": "goal", "rating": 4, "weight": 20, "awarded": 20, "evidence": "user: observable outcome stated"},
        {"id": "scope", "rating": 4, "weight": 20, "awarded": 20, "evidence": "user: include and exclude scope stated"},
        {"id": "acceptance", "rating": 4, "weight": 20, "awarded": 20, "evidence": "user: pass and fail outcomes stated"},
        {"id": "constraints", "rating": 4, "weight": 15, "awarded": 15, "evidence": "policy: runtime constraints observed"},
        {"id": "authority_risk", "rating": 4, "weight": 15, "awarded": 15, "evidence": "policy: write authority remains bounded"},
        {"id": "verification", "rating": 4, "weight": 10, "awarded": 10, "evidence": "repository: verification command exists"}
      ],
      "skip": {"requested": false, "basis": null, "reason": null, "decision_ref": null, "decision_context": null, "accepted_risk_unknown_ids": [], "non_bypassable_blocker_ids": []}
    }
  },
  "goal": "<observable outcome>",
  "context": {"evidence": []},
  "scope": {"include": [], "exclude": []},
  "requirements": {"functional": [], "non_functional": []},
  "acceptance_criteria": [],
  "constraints": [],
  "assumptions": [],
  "decisions": [],
  "authority": {"allowed_reads": [], "allowed_writes": [], "allowed_external_effects": [], "forbidden": []},
  "verification": [],
  "provenance": {"generated_by": "requirement-dialogue", "question_rounds": 0, "source_summary": []}
}
```

불변식:

- `clarity_projection`은 approval·unknowns·clarity gate의 유일한 normative representation이다. 같은 이름의
  top-level `approval`, `unknowns`, `clarity_gate`를 중복하면 invalid다.
- `clarity_projection`의 canonical bytes는 같은 run의 `clarity-projection.json`과 byte-for-byte 같고,
  `clarity_projection_sha256` 및 `clarity_projection_path`가 그 파일을 가리킨다.
- top-level `status`는 `clarity_projection.spec_status`와 같아야 한다. `ready`이면 projection approval이
  current implementation-intent digest에 의해 true이고 blocking unknown이 0개이며 gate status가
  `passed|skipped`다.
- projection의 `clarity_gate.status: passed`이면 score가 threshold 이상이고 비우회 blocker가 0개다.
- projection의 `clarity_gate.status: skipped`이면 점수와 미결정 영역을 본 뒤의 explicit user request,
  reason, `answer-sha256` decision ref가 있고 비우회 blocker가 0개다. 최초 task digest는 skip 근거가
  될 수 없다. 이때 남은 가역적 unknown은
  `blocking: false`, `disposition: accepted_risk`로 보존한다.
- skipped decision context는 `run_id`, `answer_sha256`, 사용자가 본 clarity/ambiguity, 정확한 unknown id 집합,
  각 unknown의 category·summary·blocking·disposition을 canonicalize한 SHA-256, question signature,
  pre-answer clarification-offer artifact의 SHA-256/reference를 포함한다. 현재 projection과
  한 필드라도 다르거나 offer freeze·question event보다 spec commit이 먼저면 invalid다.
- 모든 unknown은 `id`, `category`, 12자 이상의 구체적인 `summary`, `blocking`, `disposition`을 가진다.
  `goal|authority|destructive|credential|external_write|public_contract|material_data_model` category는 항상
  blocking이며 accepted risk로 바꿀 수 없다.
- `accepted_risk_unknown_ids`는 projection의 `unknowns[]`에서 disposition이 `accepted_risk`인 id 집합과 정확히 같고,
  해당 unknown은 모두 `blocking: false`다. `status: ready`에는 `pending` disposition이 없다.
- 모든 기능 요구는 하나 이상의 acceptance criterion에 연결된다.
- dimension id와 weight는 `goal:20`, `scope:20`, `acceptance:20`, `constraints:15`,
  `authority_risk:15`, `verification:10`으로 정확히 일치한다. 각 rating은 0..4 정수이고 awarded는
  `floor(weight * rating / 4 + 0.5)`이며 score는 여섯 awarded 합계다. threshold는 85다.
- `assumption:` evidence는 rating 2를 넘길 수 없다. goal evidence는 `user:`, authority-risk evidence는
  `user:|policy:` provenance만 허용한다.
- `authority`는 상위 사용자/runtime 정책의 교집합이며 새로운 권한을 만들지 않는다.
- 알려지지 않은 test 명령을 발명하지 않는다. 이때 `command_or_method`에는 발견 방법이나 수동 검증을 적는다.

## 리뷰 훅

- [ ] schema id와 stable spec id가 있는가?
- [ ] 요구↔인수기준↔검증이 추적 가능한가?
- [ ] assumption의 가역성과 근거가 있는가?
- [ ] raw transcript, secret, 개인 경로를 복제하지 않았는가?
- [ ] 점수·dimension evidence·skip provenance·잔여 위험이 서로 일치하는가?
