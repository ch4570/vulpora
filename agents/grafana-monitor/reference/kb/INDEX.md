# Grafana Monitor Knowledge Base — 색인

## 작업 유형 → 읽을 KB

| 작업 유형 | KB | 다룸 |
|---|---|---|
| tool 선택, query 실행, step·budget 계산 | [collection-recipes](collection-recipes.md) | upstream read tool 이름, 단계별 호출 순서, 금지 tool, range/step 계산 |
| packet 작성, gap·status 판정, 격리 기록 | [evidence-packet](evidence-packet.md) | 필드 의미, status 규칙, source record, redaction |

## 원칙 문서와의 관계

- 상위 판단은 [principles.md](../principles.md), 이 KB는 tool 호출과 packet 작성 규칙을 구체화한다.
- 현재 runtime tool inventory와 실제 MCP 응답이 KB보다 우선한다.
- MCP 설치·token·스케줄링·보고서 렌더링은 parent skill `grafana-monitoring-report`가 소유한다.

## 갱신

- `grafana/mcp-grafana`의 tool 이름이나 read/write 분류가 바뀌면 agent frontmatter의 `tools`/
  `disallowedTools`, `collection-recipes`, skill 계약 테스트를 함께 갱신한다.
- `last_fetched`가 90일을 넘으면 upstream README를 다시 확인한다.

## 차기 KB 후보

- Tempo trace, Pyroscope profile 신호를 bounded scope에 포함하는 규칙
- multi-org(`--dynamic-multi-org`) 환경의 tenant label
