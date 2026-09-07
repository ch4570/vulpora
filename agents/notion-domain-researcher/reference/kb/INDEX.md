# Notion Domain Researcher Knowledge Base — 색인

## 작업 유형 → 읽을 KB

| 작업 유형 | KB | 다룸 |
|---|---|---|
| claim과 source record 작성 | [evidence-packet](evidence-packet.md) | provenance 필드, confidence, 최소 공개, 완결성 |
| 승인·stale·코드 충돌 판정 | [authority-and-conflicts](authority-and-conflicts.md) | policy intent/runtime fact 분리, conflict/unknown 처리 |

## 원칙 문서와의 관계

- 상위 판단은 [principles.md](../principles.md), 이 KB는 Evidence Packet과 conflict 판정 규칙을 구체화한다.
- 현재 코드·적용 버전 공식 문서·runtime 정책이 KB보다 우선한다.
- 설치·OAuth는 Vulpora installer가 담당하며, researcher는 현재 session의 MCP tool 상태만 판정한다.

## 갱신

- Notion tool response metadata 또는 Evidence Packet schema 변경 시 topic과 behavioral eval을 함께 갱신한다.
- `last_fetched`가 오래됐거나 Notion MCP supported tools가 바뀌면 source를 재확인한다.
- 설치 경로·adapter·OAuth 상태 계약이 바뀌면 연결 skill의 setup/onboarding guide와 회귀 테스트를 갱신한다.

## 차기 KB 후보

- 분류별 field-level redaction matrix
- multi-workspace source collision과 tenant label
