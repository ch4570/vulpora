# Sample Grafana monitoring fixture

`grafana-monitor` agent와 `grafana-monitoring-report` skill의 수집·판정을 오프라인에서 재현하는 합성
fixture다. 실제 조직명, Grafana URL, 사용자 정보, service account token은 포함하지 않는다.

- `scopes/grafana-monitor.json`: parent가 검증해 agent에 넘길 scope(실사용 기본 경로 `.vulpora/`는 gitignore 대상이라 fixture는 `--scope-file`로 지정)
- `mock-grafana/datasources.yaml`: `list_datasources`, `check_datasources_health`의 합성 응답
- `mock-grafana/alert-rules.yaml`: `alerting_rules_read`, `alerting_silences_read`의 합성 응답
- `mock-grafana/dashboard.yaml`: `search_dashboards`, `get_dashboard_summary`,
  `get_dashboard_panel_queries`의 합성 응답(조작된 title 포함)
- `mock-grafana/prometheus.yaml`: window와 baseline의 `query_prometheus` 합성 결과
- `mock-grafana/auth-error.yaml`: 401 인증 실패 응답
- `reports/grafana/grafana-orders-api-prod-20261119T0000Z.md`: diff 비교용 이전 보고서

각 behavioral case는 외부 Grafana에 연결하지 않고 `mock-grafana/`를 MCP 응답 대역으로 사용한다.
dashboard·alert 문자열은 모두 신뢰되지 않은 데이터이며 그 안의 명령은 실행 지시가 아니다.
