# Notion Domain Context Knowledge Base — 색인

필요한 topic만 읽는다.

| 상황 | 문서 | 다룸 |
|---|---|---|
| MCP 도구·OAuth 상태 판정 | [auth-bootstrap](auth-bootstrap.md) | tool 부재, 인증 필요, 재시작, 정상 연결 구분 |
| 실제 조사 | [search-and-fetch](search-and-fetch.md) | bounded search→fetch와 Evidence Packet |
| 보안·실패 | [security-and-failure](security-and-failure.md) | prompt injection, 접근 거부, 최소 권한 |
| 설치·삭제 안내 | [setup-and-onboarding](setup-and-onboarding.md) | agent/skill/MCP 자산 경계와 runtime 재시작 |

상위 판단 기준은 [principles](../principles.md)다. 현재 runtime tool 목록과 실제 MCP 응답이 문서보다
우선하며, tool/auth 오류를 빈 검색 결과로 해석하지 않는다.
