# Grafana Monitoring Report Knowledge Base — 색인

필요한 topic만 읽는다.

| 상황 | 문서 | 다룸 |
|---|---|---|
| MCP가 없음, 처음 설정, token 질문 | [setup-and-onboarding](setup-and-onboarding.md) | mcp-grafana 실행 방법, Viewer service account, Claude Code·Codex 설정 |
| scope 파일 작성·검증 | [scope-schema](scope-schema.md) | `.vulpora/grafana-monitor.json` 필드, 한계, 예시 |
| 보고서 작성·이전 보고서 diff | [report-format](report-format.md) | severity 규칙, 섹션 순서, `report-state` block |
| 주기 실행 설정 | [scheduling](scheduling.md) | `/loop`, cloud routine, headless cron의 차이 |
| 보안·실패 상태 | [security-and-failure](security-and-failure.md) | 금지 tool, prompt injection, status별 대응 |

상위 판단 기준은 [principles](../principles.md)다. 현재 runtime tool 목록과 실제 MCP 응답이 문서보다
우선한다. 수집 절차와 packet 필드의 단일 출처는 `grafana-monitor` agent 정의다.
