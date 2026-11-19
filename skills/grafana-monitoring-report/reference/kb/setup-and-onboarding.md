---
title: Grafana MCP 연결과 최소 권한 설정
source: https://github.com/grafana/mcp-grafana
last_fetched: 2026-11-19
skills: [grafana-monitoring-report, grafana-monitor]
---

# KB: Grafana MCP 연결과 최소 권한 설정

Vulpora MCP pack catalog(`install/mcp-packs.txt`)는 OAuth/none 인증의 hosted HTTP server만 다룬다.
Grafana MCP는 사용자 Grafana URL과 service account token이 필요한 local stdio server이므로 pack으로
자동 설치하지 않는다. 사용자가 아래 절차로 직접 등록한다. skill은 설정 파일을 쓰거나 token을 받지 않는다.

| 자산 | 설치 방법 |
|---|---|
| `grafana-monitor` agent | Vulpora installer (skill dependency로 함께 설치) |
| `grafana-monitoring-report` skill | Vulpora installer |
| `vulpora-grafana` MCP server | 사용자 수동 등록 (이 문서) |

## 리뷰 훅

- [ ] server 이름이 정확히 `vulpora-grafana`인가 (agent의 `mcp__vulpora-grafana__*` 이름과 일치).
- [ ] `--disable-write`로 실행하는가.
- [ ] service account role이 Viewer인가 (Editor/Admin 아님).
- [ ] token이 chat, 저장소, scope 파일, 보고서에 없는가. 설정에는 token 파일 경로나 환경변수만 있는가.
- [ ] 등록 후 runtime session을 새로 시작했는가.

## 1. Viewer service account token 만들기

Grafana에서 service account를 만들고 role을 **Viewer**로 둔다. upstream README에 따르면 기본 Viewer
role이 read action을, Editor가 write action을 포함한다. 특정 folder·datasource만 보게 하려면 Grafana
RBAC로 범위를 더 줄인다. token은 파일(권한 600)이나 secret manager에 두고 chat에 붙여넣지 않는다.

## 2. 실행 방법 (upstream이 안내하는 세 가지)

- uvx: `uvx mcp-grafana`
- binary: GitHub release binary를 `$PATH`에 두거나 `go install github.com/grafana/mcp-grafana/v2/cmd/mcp-grafana@latest`
- Docker: `docker run --rm -i -e GRAFANA_URL -e GRAFANA_SERVICE_ACCOUNT_TOKEN grafana/mcp-grafana -t stdio --disable-write`

환경변수: `GRAFANA_URL`, `GRAFANA_SERVICE_ACCOUNT_TOKEN` 또는 `GRAFANA_SERVICE_ACCOUNT_TOKEN_FILE`.
`GRAFANA_API_KEY`는 upstream에서 deprecated다.

## 3. Claude Code 등록

```bash
claude mcp add vulpora-grafana --scope user \
  -e GRAFANA_URL=https://grafana.example.test \
  -e GRAFANA_SERVICE_ACCOUNT_TOKEN_FILE="$HOME/.config/grafana/viewer.token" \
  -- uvx mcp-grafana -t stdio --disable-write
```

팀이 project `.mcp.json`을 공유한다면 token 값 대신 환경변수 참조(`${GRAFANA_URL}` 등)만 커밋한다.
등록 후 Claude Code를 다시 시작하고 `/mcp`에서 `vulpora-grafana`가 연결됐는지 확인한다.

## 4. Codex 등록

`~/.codex/config.toml`(또는 project config)에 추가한다. `enabled_tools`는 agent `tools`와 같은 read
tool만 둔다.

```toml
[mcp_servers.vulpora-grafana]
command = "uvx"
args = ["mcp-grafana", "-t", "stdio", "--disable-write"]
env = { GRAFANA_URL = "https://grafana.example.test", GRAFANA_SERVICE_ACCOUNT_TOKEN_FILE = "<token 파일 절대 경로>" }
enabled_tools = ["list_datasources", "get_datasource", "check_datasources_health", "alerting_rules_read", "alerting_silences_read", "list_incidents", "get_incident", "search_dashboards", "search_folders", "get_dashboard_summary", "get_dashboard_panel_queries", "query_prometheus", "query_prometheus_histogram", "query_loki_stats", "query_loki_patterns", "query_loki_logs", "get_annotations"]
```

## 5. 확인

새 session에서 `/grafana-monitoring-report`(Claude Code) 또는 `$grafana-monitoring-report`(Codex)를
작은 scope로 실행한다. 보고서 header의 collection status가 `success` 또는 `partial`이고
`live_access_verified: true`면 연결된 것이다.
