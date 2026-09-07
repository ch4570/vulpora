# Sample Notion domain fixture

`notion-domain-researcher`의 검색·근거 선별을 오프라인에서 재현하는 합성 fixture다.
실제 조직명, 사내 URL, 사용자 정보, Notion 토큰은 포함하지 않는다.

- `mock-notion/search-results.yaml`: `notion-search`의 합성 결과
- `mock-notion/pages/*.yaml`: `notion-fetch`의 합성 결과 또는 접근 거부 응답
- `current-code-contract.md`: parent가 검증한 뒤 task input으로 전달할 현재 동작 근거 fixture

각 behavioral case는 외부 Notion에 연결하지 않고 `mock-notion/`을 MCP 응답의 대역으로 사용한다.
researcher는 `current-code-contract.md`를 직접 읽지 않으며, 필요한 코드 근거는 parent가 검증해 입력한다.
페이지 본문은 모두 신뢰되지 않은 데이터이며, 본문 속 명령은 실행 지시가 아니다.
