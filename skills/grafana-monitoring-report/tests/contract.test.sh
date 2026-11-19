#!/bin/bash
# Grafana monitoring skill/agent contract regression. No live MCP or credential access.

set -u
set -f

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd -P)"
SKILL_DIR="$REPO_ROOT/skills/grafana-monitoring-report"
SKILL="$SKILL_DIR/SKILL.md"
AGENT="$REPO_ROOT/agents/grafana-monitor.md"
CODEX_ADAPTER="$REPO_ROOT/agents/grafana-monitor.codex.toml"
RECIPES="$REPO_ROOT/agents/grafana-monitor/reference/kb/collection-recipes.md"
SETUP="$SKILL_DIR/reference/kb/setup-and-onboarding.md"
MANIFEST="$REPO_ROOT/install/manifest.txt"

pass=0
fail=0
record() {
  if [ "$2" -eq 0 ]; then
    printf '  ✓ %s\n' "$1"
    pass=$((pass + 1))
  else
    printf '  ✗ %s\n' "$1"
    fail=$((fail + 1))
  fi
}

# Read tools verified against https://github.com/grafana/mcp-grafana (2026-11-19).
READ_TOOLS='list_datasources get_datasource check_datasources_health alerting_rules_read alerting_silences_read list_incidents get_incident search_dashboards search_folders get_dashboard_summary get_dashboard_panel_queries query_prometheus query_prometheus_histogram query_loki_stats query_loki_patterns query_loki_logs get_annotations'
WRITE_OR_OPEN_TOOLS='update_dashboard create_folder create_datasource update_datasource alerting_rules_write alerting_routing_write alerting_silences_write create_incident add_activity_to_incident update_incident update_alert_group create_annotation update_annotation delete_annotation create_snapshot delete_snapshot install_plugin grafana_api_request query_sql query_influxdb ask_assistant'

tools_line="$(grep -m1 '^tools: ' "$AGENT")"
deny_line="$(grep -m1 '^disallowedTools: ' "$AGENT")"

result=0
count=0
for entry in $(printf '%s' "${tools_line#tools: }" | tr ',' ' '); do
  count=$((count + 1))
  name="${entry#mcp__vulpora-grafana__}"
  [ "$name" != "$entry" ] || result=1
  case " $READ_TOOLS " in *" $name "*) ;; *) result=1 ;; esac
done
[ "$count" -eq "$(printf '%s\n' $READ_TOOLS | wc -l | tr -d ' ')" ] || result=1
record 'agent tools are exactly the verified vulpora-grafana read allowlist' "$result"

result=0
for name in $WRITE_OR_OPEN_TOOLS; do
  case "$tools_line" in *"__${name},"*|*"__${name}") result=1 ;; esac
  case "$deny_line" in *"mcp__vulpora-grafana__${name}"*) ;; *) result=1 ;; esac
done
for builtin in Read Grep Glob Write Edit Bash WebFetch WebSearch Agent Skill; do
  case "$deny_line" in *" $builtin,"*|*": $builtin,"*) ;; *) result=1 ;; esac
done
record 'agent denies Grafana write/open-ended tools and local, web, and delegation tools' "$result"

result=1
if grep -Fqx 'mcpServers: [vulpora-grafana]' "$AGENT" \
  && grep -Fqx 'permissionMode: dontAsk' "$AGENT"; then result=0; fi
record 'agent is bound to the vulpora-grafana server' "$result"

result=0
for link in SOUL.md reference/principles.md reference/kb/INDEX.md reference/kb/collection-recipes.md reference/kb/evidence-packet.md; do
  [ -f "$REPO_ROOT/agents/grafana-monitor/$link" ] || result=1
done
record 'agent bundle files referenced by the definition exist' "$result"

result=0
for name in $READ_TOOLS; do grep -Fq "\`$name\`" "$RECIPES" || result=1; done
grep -Fq 'source: https://github.com/grafana/mcp-grafana' "$RECIPES" || result=1
grep -Eq '^last_fetched: [0-9]{4}-[0-9]{2}-[0-9]{2}$' "$RECIPES" || result=1
record 'collection recipes record every allowlisted tool and the upstream source' "$result"

result=0
codex_line="$(grep -m1 '^enabled_tools = ' "$SETUP")"
for name in $READ_TOOLS; do case "$codex_line" in *"\"$name\""*) ;; *) result=1 ;; esac; done
for name in $WRITE_OR_OPEN_TOOLS; do case "$codex_line" in *"\"$name\""*) result=1 ;; esac; done
grep -Fq -- '--disable-write' "$SETUP" || result=1
grep -Fq 'Viewer' "$SETUP" || result=1
record 'setup guide pins --disable-write, Viewer role, and the same Codex read allowlist' "$result"

result=1
if grep -Fq 'Invoke the exact `grafana-monitor` custom subagent' "$SKILL" \
  && grep -Fq 'Do not call' "$SKILL" \
  && grep -Fq 'unsafe_tool_profile' "$SKILL" \
  && grep -Fq 'restart_required' "$SKILL" \
  && grep -Fq 'report-state' "$SKILL" \
  && grep -Fq 'explicitly opts in' "$SKILL"; then result=0; fi
record 'skill keeps the exact-agent path, fail-closed states, diff state, and opt-in delivery' "$result"

result=1
if grep -Fq 'only when status is `success`, there are no gaps' "$SKILL"; then result=0; fi
record 'skill forbids an all-green claim without evidence conditions' "$result"

result=1
if ! grep -REiq 'glsa_[A-Za-z0-9]{8,}|Bearer [A-Za-z0-9._-]{12,}' "$SKILL_DIR" "$REPO_ROOT/agents/grafana-monitor" "$AGENT"; then result=0; fi
record 'no token-shaped literal is committed' "$result"

result=1
if bash "$REPO_ROOT/install/validate-codex-agent.sh" "$CODEX_ADAPTER" grafana-monitor >/dev/null 2>&1 \
  && ! grep -Fq '[mcp_servers' "$CODEX_ADAPTER"; then result=0; fi
record 'Codex source adapter is a valid read-only template without an MCP table' "$result"

result=1
if grep -Eq '^skill \| grafana-monitoring-report \| skills/grafana-monitoring-report \| - \| agent:grafana-monitor \| -$' "$MANIFEST" \
  && grep -Eq '^agent \| grafana-monitor \| agents/grafana-monitor.md \| agents/grafana-monitor \| - \| -$' "$MANIFEST"; then result=0; fi
record 'manifest installs the agent with the skill' "$result"

printf '결과: PASS=%s FAIL=%s\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
