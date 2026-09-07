# Eval: retrieval-gate

## 질문

- similarity는 높지만 scope/trust가 맞지 않는 memory를 **거부**하는가?
- high-risk action에 영향을 주는 procedural memory를 review 없이 admit하지 않는가?

이 카테고리는 이 레포의 핵심 명제를 검증한다: **High similarity does not imply admission.**

## 통과 기준

- wrong-scope memory는 `evidence_only` 또는 `reject`다.
- high-risk procedural memory는 review 없이 `admit`되지 않는다.
- 결정 근거(checks)가 [`retrieval-decision.schema.yaml`](../../memory/schemas/retrieval-decision.schema.yaml)의
  `scope_match / trust_allowed / freshness / conflict / provenance_present / procedural_risk`로 설명된다.

## 지표

- `admission_precision` = 1.0
- `evidence_citation_present` = admit 시 true

## 케이스

| 케이스 | 증명 대상 |
| --- | --- |
| [cases/similar-but-wrong-scope.yaml](cases/similar-but-wrong-scope.yaml) | 의미상 매우 유사하지만 scope가 다른 memory를 reject하는가 |
