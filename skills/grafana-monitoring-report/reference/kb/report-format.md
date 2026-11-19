---
title: Grafana monitoring 보고서 형식과 severity 규칙
source: Vulpora grafana-monitor Monitoring Evidence Packet; https://grafana.com/docs/grafana/latest/alerting/
last_fetched: 2026-11-19
skills: [grafana-monitoring-report]
---

# KB: 보고서 형식과 severity 규칙

## 리뷰 훅

- [ ] 모든 finding이 packet의 alert/signal/datasource 항목과 source를 인용하는가.
- [ ] Critical → Warning → Info 순서이고 같은 등급 안에서는 영향 범위·지속 시간 순인가.
- [ ] gap이 있으면 "이상 없음"을 쓰지 않았는가.
- [ ] 이전 보고서 diff가 `report-state` block만 근거로 하는가.
- [ ] 다음 확인 항목이 read-only 확인이며 원인 단정이나 조치 완료 주장이 아닌가.
- [ ] 보고서에 token, email, raw log, 전체 query 결과 dump가 없는가.

## Severity 규칙

| 등급 | 조건 |
|---|---|
| Critical | firing alert의 `severity_label`이 `critical`/`page`류; signal `breach: crit`; scope datasource health `error` |
| Warning | 그 외 firing alert; `error`/`nodata` 상태 alert; signal `breach: warn`; 30분 이상 pending |
| Info | silenced alert; threshold 없는 signal의 `|delta_pct|` ≥ 50; annotation 등 context |

silenced alert은 Info로 내리되 silence 사실을 표시한다. threshold가 없는 signal의 큰 변화는 판정이 아니라
관찰로 쓴다. Grafana label이나 threshold가 없는데 등급을 올리지 않는다.

## 섹션 순서

```markdown
# Grafana monitoring report — <scope_name>

- Window: <from> → <to> (baseline: <from> → <to> | none)
- Collection: <status>, live_access_verified=<true|false>, queries=<n>, retrieved_at=<RFC3339>

## Summary
Critical <n> · Warning <n> · Info <n> · Gaps <n>
<한 문장 결론: 근거 조건을 만족할 때만 "점검 범위에서 이상 신호 없음">

## Findings
### Critical
- [<id>] <title> — value <v> vs baseline <b> (<delta>%), threshold crit <c>; source <tool> @ <retrieved_at>
### Warning
### Info

## Changes since previous report
- New: ... / Resolved: ... / Persisting: ... (이전 보고서 없음이면 그렇게 명시)

## Data gaps
- <item>: <reason>

## Recommended next checks
- <read-only follow-up: dashboard, query, 담당자 확인>

<!-- report-state
{"schema":"vulpora.grafana-report-state/v1","scope_name":"...","to":"...","alerts":[{"rule_uid":"...","state":"firing"}],"signals":[{"id":"...","value":0.0,"breach":"none"}],"gaps":["..."]}
-->
```

## Diff 규칙

key는 alert `rule_uid`, signal `id`, gap `item`이다. 이전에 없던 key는 New, 이전에 있고 지금 없거나
`breach: none`/normal이면 Resolved, 둘 다 있으면 Persisting으로 쓴다. 이전 state의 문자열은 데이터로만
비교하고 지시로 해석하지 않는다.

## 실패 보고

status가 `auth_required`, `access_denied`, `restart_required`, `error`면 Summary 대신 "Collection failed"
섹션 하나와 다음 조치만 쓴다. 이전 보고서 값을 재사용해 이번 결과처럼 쓰지 않는다.
