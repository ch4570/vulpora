---
title: Grafana monitoring 보고서 주기 실행
source: https://code.claude.com/docs/en/scheduled-tasks
last_fetched: 2026-11-19
skills: [grafana-monitoring-report]
---

# KB: 주기 실행

skill 자체는 한 번 실행에 보고서 하나를 만든다. 주기는 runtime의 스케줄러가 소유한다. 어디서 실행되는지에
따라 `vulpora-grafana` MCP와 Grafana에 닿을 수 있는지가 달라진다.

## 리뷰 훅

- [ ] 선택한 방식이 실행 위치에서 `vulpora-grafana` MCP와 Grafana URL에 접근 가능한가.
- [ ] 저장 경로(`--out`)가 실행 위치에 존재하고 이전 보고서 diff가 같은 경로를 보는가.
- [ ] 주기가 window보다 짧지 않은가 (겹치는 window는 같은 alert를 반복 보고한다).
- [ ] 외부 전송을 켰다면 사용자가 그 목적지에 명시적으로 동의했는가.

## 방식별 비교

| 방식 | 실행 위치 | 지속성 | MCP·파일 조건 |
|---|---|---|---|
| Claude Code `/loop` | 현재 session (내 machine) | session이 열려 있어야 함. recurring task는 7일 뒤 만료 | session의 MCP를 그대로 상속. local 파일 접근 가능 |
| Claude Code Desktop scheduled task | 내 machine | session 없이 지속, machine은 켜져 있어야 함 | MCP config 파일과 connector 사용. local 파일 접근 가능 |
| Claude Code cloud routine (`/schedule`) | Anthropic cloud | machine과 독립. 최소 간격 1시간 | task별로 설정한 connector만 쓴다. 노트북의 local stdio server와 token 파일은 쓸 수 없고, Grafana가 cloud에서 닿아야 한다. 매번 fresh clone이라 local에 저장한 이전 보고서로 diff할 수 없다 |
| OS cron/CI + headless CLI | 그 host | host가 켜져 있는 동안 | 그 host의 runtime config에 `vulpora-grafana`가 등록돼 있어야 함 |

## 예시

Session 안에서 1시간마다:

```text
/loop 1h /grafana-monitoring-report --scope-file .vulpora/grafana-monitor.json --out reports/grafana/
```

Headless(예: cron에서 Claude Code CLI 비대화형 실행):

```bash
claude -p "/grafana-monitoring-report --scope-file .vulpora/grafana-monitor.json --out reports/grafana/"
```

headless 실행에서는 permission prompt에 응답할 사람이 없다. 보고서 파일 쓰기와 `grafana-monitor`
subagent 실행에 필요한 도구만 runtime의 permission 설정으로 허용하고, 그 밖의 도구를 넓게 허용하지 않는다.
Codex에서는 같은 prompt를 `$grafana-monitoring-report`로 비대화형 실행 명령에 넘긴다.

## 주의

- window는 주기와 같게 둔다(예: 1h 주기 → `window: "1h"`).
- `/loop`는 session-local이고 recurring task는 7일 뒤 만료된다. 장시간 무인 모니터링에는 Desktop scheduled
  task, cron/CI, cloud routine을 쓴다.
- scheduled fire는 Claude가 스스로 호출할 수 있는 skill만 실행한다. 이 skill에 `disable-model-invocation`을
  추가하지 않는다.
- 이 skill은 alerting 시스템을 대체하지 않는다. 실시간 paging은 Grafana Alerting contact point가 맡는다.
