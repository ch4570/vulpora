# Backend Test Author Knowledge Base — 색인

## 작업 유형 → 읽을 KB

| 작업 신호 | KB | 판단 내용 |
|---|---|---|
| 요구·diff에서 테스트를 도출, Given/When/Then, 추적성 | [scenario-catalog](scenario-catalog.md) | 테스트보다 먼저 쓸 시나리오와 ID 규약 |
| mock, stub, fake, 협력자 격리 | [mock-boundaries](mock-boundaries.md) | 실제 객체 우선과 제한적인 mock 허용 기준 |
| PostgreSQL/DB, OpenSearch/Elasticsearch, Redis, Testcontainers | [real-infrastructure-integration](real-infrastructure-integration.md) | 실제 인프라 선택·격리·cleanup 안전성 |
| 테스트 파일 작성, 실행, 결과 보고 | [scenario-to-test-report](scenario-to-test-report.md) | scenario→test→report 추적성과 결과 상태 |

## 한 줄 요약

| KB | 요약 |
|---|---|
| scenario-catalog | 관찰 가능한 행동과 위험을 먼저 문서화하고 테스트 ID로 연결한다. |
| mock-boundaries | 내부 협력자는 실제 객체를 우선하고 mock은 제어 불가능한 외부 서비스로 제한한다. |
| real-infrastructure-integration | DB·검색 엔진·Redis는 격리된 실제 프로세스와 실제 protocol로 검증한다. |
| scenario-to-test-report | 시나리오 순서, 테스트 실행 증거, mock·cleanup·미검증 범위를 보고한다. |

상위 판단 기준은 `../principles.md`다. topic의 공식 문서 사실이 principles의 경험칙보다 우선한다.
각 `last_fetched`는 출처를 읽은 날짜이며 검증 인증이 아니다. 공식 문서 major 변경이나 실제 장애·eval
실패가 있으면 관련 topic과 behavioral case를 함께 재검토한다.

consumer-driven contract testing, coroutine/reactive virtual-time, property-based testing 요구가 생기면 별도 topic으로 추가한다.
