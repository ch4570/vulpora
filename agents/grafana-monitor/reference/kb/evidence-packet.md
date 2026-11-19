---
title: Monitoring Evidence Packet 작성 규칙
source: https://www.w3.org/TR/prov-overview/
last_fetched: 2026-11-19
consumers: [grafana-monitor]
---

# KB: Monitoring Evidence Packet 작성 규칙

## 리뷰 훅

- [ ] 모든 `alerts[]`와 `signals[]` 항목에 `source.tool`과 `source.retrieved_at`이 있는가.
- [ ] `success`/`no_evidence`일 때만 `live_access_verified: true`와 함께 쓰였는가.
- [ ] 계산하지 못한 값은 `null`이고 대응하는 `gaps[]` 항목이 있는가.
- [ ] title·message 문자열은 200자로 잘랐고 token·email·IP·raw log가 없는가.
- [ ] 격리한 문장 수를 `safety.quarantined_items`에 반영했는가.

## Status 규칙

| status | 조건 |
|---|---|
| `success` | live 확인, scope 전 항목 수집, gap 없음 |
| `partial` | live 확인, 일부 query 실패·권한 부족·budget 소진 |
| `no_evidence` | live 확인, scope가 어떤 rule/dashboard/signal에도 해소되지 않음 |
| `auth_required` | 401/403 또는 인증 오류 |
| `access_denied` | 인증은 됐지만 scope 전체에 권한 없음 |
| `restart_required` | 현재 session에 `vulpora-grafana` read tool이 없음 |
| `error` | invalid scope, schema 오류, 금지 tool 요구 |

## 필드 의미

- `alerts[]`: firing/pending/error/nodata만. `severity_label`은 rule label 값을 그대로 옮기며, 없으면
  `unknown`. collector는 severity를 새로 만들지 않는다.
- `signals[]`: `value`와 `baseline_value`는 같은 `aggregation`으로 계산한다. `delta_pct`는
  `(value - baseline_value) / |baseline_value| * 100`, baseline이 0이거나 없으면 `null`.
  `breach`는 입력 threshold와 `direction`으로만 정한다. threshold가 없으면 `none`이 아니라 `unknown`이다.
- `datasources[]`: health 응답을 `ok|error|unknown`으로 정규화하고 message는 요약만.
- `context[]`: annotation 등 참고 정보. 인과 관계 근거로 쓰지 않는다.
- `gaps[]`: 읽지 못한 항목과 이유. parent는 gap이 있으면 "이상 없음"을 단정할 수 없다.

## Redaction

Authorization header, token, cookie, 사용자 email, IP, hostname의 사용자 식별 부분은 넣지 않고
`safety.redactions`에 종류만 기록한다. log는 `query_loki_patterns` 패턴과 건수로 요약한다.
