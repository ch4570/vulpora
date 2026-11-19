---
title: Grafana monitoring scope 파일 schema
source: Vulpora grafana-monitor agent input contract (agents/grafana-monitor.md)
last_fetched: 2026-11-19
skills: [grafana-monitoring-report]
---

# KB: monitoring scope 파일 schema

기본 위치는 저장소의 `.vulpora/grafana-monitor.json`이다. 한 파일은 한 환경의 한 scope만 담는다.
여러 환경은 파일을 나누고 `--scope-file`로 고른다.

## 리뷰 훅

- [ ] `schema`가 `vulpora.grafana-monitor-scope/v1`인가.
- [ ] `scope_name`이 소문자·숫자·하이픈이고 64자 이하인가 (보고서 파일명에 쓰인다).
- [ ] `window`가 24h 이하인가.
- [ ] dashboards/folders/datasources/alert_rules/signals 중 하나 이상이 비어 있지 않은가.
- [ ] token, password, Authorization, Grafana URL 필드가 없는가.
- [ ] budget이 상한(`max_queries` 40, `max_log_lines` 200) 이하인가.

## 필드

| 필드 | 필수 | 설명 |
|---|---|---|
| `schema` | 예 | `vulpora.grafana-monitor-scope/v1` |
| `scope_name` | 예 | 사람이 읽는 이름, 보고서 파일명에 사용 |
| `window` | 예 | `30m`, `1h`, `6h`, `24h` 같은 duration. agent에는 `{from: now-<window>, to: now}`로 전달 |
| `baseline` | 아니오 | `previous_window`(기본) 또는 `none` |
| `dashboards` | 아니오 | `[{"uid": "...", "panels": ["panel title", ...]}]`, 최대 5개 |
| `folders` | 아니오 | alert rule과 dashboard 검색을 제한할 folder uid 목록 |
| `datasources` | 아니오 | health를 볼 datasource uid 목록 |
| `alert_rules` | 아니오 | `{"folder_uids": [], "label_matchers": ["team=orders"], "include_states": ["firing","pending","error","nodata"]}` |
| `signals` | 아니오 | `[{"id","datasource_uid","kind":"promql|logql","expr","unit","warn","crit","direction":"above|below"}]` |
| `budgets` | 아니오 | `{"max_queries": 20, "max_log_lines": 50, "max_dashboards": 5, "max_panels_per_dashboard": 8}` |
| `report` | 아니오 | `{"output_dir": "reports/grafana"}` — `--out`이 없을 때만 사용 |

Grafana URL과 token은 MCP server 설정이 소유한다. scope 파일에 넣지 않는다.

## 최소 예시

```json
{
  "schema": "vulpora.grafana-monitor-scope/v1",
  "scope_name": "orders-api-prod",
  "window": "1h",
  "alert_rules": { "label_matchers": ["service=orders-api"] },
  "signals": [
    {
      "id": "http-5xx-ratio",
      "datasource_uid": "prometheus-main",
      "kind": "promql",
      "expr": "sum(rate(http_requests_total{service=\"orders-api\",code=~\"5..\"}[5m])) / sum(rate(http_requests_total{service=\"orders-api\"}[5m]))",
      "unit": "ratio",
      "warn": 0.01,
      "crit": 0.05,
      "direction": "above"
    }
  ]
}
```

## 검증 실패 시

필수 필드 누락, 24h 초과, 빈 scope, credential 필드는 Grafana 호출 전에 오류로 중단하고 위 예시를
보여준다. credential 값은 오류 메시지에 다시 출력하지 않는다.
