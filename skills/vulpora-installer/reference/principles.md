# Vulpora Installer 핵심 원칙

1. 설치 의도만 trigger한다. 내부 지식 검색은 `notion-domain-context`의 책임이다.
2. `vulpora`, `install/manifest.txt`, `install/mcp-packs.txt`를 단일 출처로 사용하고 설치·인증 로직을 스킬에 복제하지 않는다.
3. dry-run으로 경로와 충돌을 먼저 확인한 뒤, 요청받은 selector만 설치한다.
4. Agent/skill 설치와 MCP/OAuth 연결을 분리하며, 제거된 `--onboard` 옵션을 사용하지 않는다.
5. copied, discovered, authenticated, live verified를 독립 상태로 판정한다.
6. 비대화형 환경에서도 deterministic install/status는 직접 실행하고, 사람의 project/OAuth 승인만 성공으로 가장하지 않는다.
7. 인증 URL, OAuth state, token, identity를 결과나 저장소에 남기지 않는다.
8. 일반 설치 중 OAuth를 시작하지 않고 첫 Notion 사용 또는 명시적 인증 요청까지 미룬다.

## 리뷰 훅

- 자연어 설치 요청과 지식 검색 요청이 서로 다른 스킬로 라우팅되는가?
- source catalog에 없는 asset이나 MCP pack을 추측하지 않는가?
- Notion skill 설치와 hosted MCP 설치·OAuth를 별도 상태로 판정하는가?
- 설치 성공을 live Notion access 성공으로 과장하지 않는가?
- Claude project MCP의 `Pending approval`을 미설치로 오판하지 않는가?
- 설치 완료와 첫 사용 OAuth를 분리하고 `auth_deferred`를 보고하는가?
