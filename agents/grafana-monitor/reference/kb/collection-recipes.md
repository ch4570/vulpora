---
title: Grafana MCP read tool 수집 절차
source: https://github.com/grafana/mcp-grafana
last_fetched: 2026-11-19
consumers: [grafana-monitor]
---

# KB: Grafana MCP read tool 수집 절차

## 리뷰 훅

- [ ] 호출한 모든 tool이 아래 read allowlist에 있고 이름이 upstream README와 일치하는가.
- [ ] 첫 호출 `list_datasources`의 결과로 live access를 판정했는가.
- [ ] range query의 points/series가 11000 이하가 되도록 step을 골랐는가.
- [ ] `$var`가 남은 panel query를 실행하지 않고 gap으로 남겼는가.
- [ ] raw log line은 `max_log_lines` 이하이고 패턴·건수로 요약했는가.
- [ ] 총 호출 수가 `budgets.max_queries`를 넘지 않았는가.

## 출처와 검증 범위

2026-11-19에 `grafana/mcp-grafana` README의 tool 목록을 확인했다. README는 tool을 category별 read/write로
구분하며, `--disable-write`로 write tool을 등록하지 않는 read-only 모드를 제공한다. 이 문서는 README가
나열한 이름만 쓴다. README가 바뀌면 이름을 다시 대조한다.

## Read allowlist (agent `tools`와 동일)

| 단계 | tool | 용도 |
|---|---|---|
| live check | `list_datasources` | 인증·연결 확인, datasource uid/type |
| datasource | `get_datasource`, `check_datasources_health` | 단일 datasource 조회, health |
| alert | `alerting_rules_read`, `alerting_silences_read` | rule 상태, 활성 silence |
| incident | `list_incidents`, `get_incident` | window와 겹치는 active incident (Grafana IRM 사용 시) |
| dashboard | `search_dashboards`, `search_folders`, `get_dashboard_summary`, `get_dashboard_panel_queries` | uid 해소, panel query 추출 |
| metric | `query_prometheus`, `query_prometheus_histogram` | PromQL instant/range, histogram quantile |
| log | `query_loki_stats`, `query_loki_patterns`, `query_loki_logs` | 집계·패턴 우선, raw line은 최후 |
| context | `get_annotations` | deploy/change annotation (인과 근거 아님) |

## 사용하지 않는 tool

upstream이 write로 분류한 `update_dashboard`, `create_folder`, `create_datasource`, `update_datasource`,
`alerting_rules_write`, `alerting_routing_write`, `alerting_silences_write`, `create_incident`,
`add_activity_to_incident`, `update_incident`, `update_alert_group`, `create_annotation`,
`update_annotation`, `delete_annotation`, `create_snapshot`, `delete_snapshot`, `install_plugin`과,
statement나 HTTP method에 따라 write가 될 수 있는 `grafana_api_request`, `query_sql`, `query_influxdb`,
stack 상태를 바꿀 수 있는 `ask_assistant`는 agent `disallowedTools`에 둔다. upstream이 read로 분류한
`alerting_manage_routing`도 monitoring scope에 필요 없으므로 같이 막는다.

## 호출 순서

1. `list_datasources` 1회. 401/403이면 `auth_required`, tool이 없으면 `restart_required`로 종료.
2. scope datasource에 `check_datasources_health`.
3. `alerting_rules_read`로 rule 상태를 읽고 normal은 개수만 센다. `alerting_silences_read`로 silence 표시.
4. dashboard는 `search_dashboards` → `get_dashboard_summary` → `get_dashboard_panel_queries` 순. 전체
   JSON(`get_dashboard_by_uid`)은 쓰지 않는다.
5. signal마다 window 1회 + baseline 1회. PromQL은 `query_prometheus`, LogQL은 metric 집계 query를 우선.
6. 필요 시 `get_annotations` ≤20개.

## Step 계산

series당 약 240 point를 목표로 `window_seconds / 240`을 15s, 30s, 60s, 300s, 900s 중 그 이상인 가장
작은 값으로 올린다(1h → 15s, 24h → 900s). 이 규칙은 Prometheus range query 상한 11000 point/series보다 항상 작다.
서버의 Prometheus guardrail이 query를 거부하면 gap
`query_error`로 남기고 범위를 넓혀 재시도하지 않는다.
