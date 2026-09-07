---
title: STANDARD 규약 정합 체크
source: ../../../../STANDARD.md
last_fetched: 2026-06-24
consumers: [agent-evaluator]
---

# STANDARD 규약 정합 — D1/D3 체크

평가 대상이 저장소 표준 구조와 범용화 규약을 따르는지 **실측**한다(추측 금지).

## 에이전트 구조
- 정의 `agents/<name>.md` 존재 + frontmatter `name`/`description`/`tools`. `model` 은 **하드코딩 금지**(런타임 adapter 결정).
- 번들 `agents/<bundle>/` 에 `SOUL.md` + `reference/principles.md` + `reference/kb/INDEX.md` + `reference/kb/<topic>.md`.
- 정의 `.md` 본문은 **운영 지침만**(절차·출력형식), 정체성은 SOUL.md 로 위임.
- **stem 관행**: 레포는 "에이전트명 ≠ 짧은 번들dir"(예: `postgres-dba.md`↔`dba/`, `opensearch-expert.md`↔`opensearch/`)을 **일관되게** 쓴다. 이는 STANDARD §1 문구와 다르나 전 자산 공통 관행이므로 **위반 아님**(principles §7). 단, 정의 본문의 상대경로가 실제 번들dir과 **일치**해야 한다.
- 예외: 도구형 단독 러너(`test-runner`)는 번들 없이 정의 1개로 완결 가능. 그 사유가 본문에 명시돼야 한다.

## 스킬 구조
- Vulpora은 `skills/<skill-id>/SKILL.md`와 선택적 `agents/`, `scripts/`, `reference/`, `tests/`, `config/`를 배포한다.
- source·manifest·runtime inventory의 skill 수가 일치해야 하며 현재 수를 문서에 하드코딩하지 않는다.
- Codex/OpenAI skill frontmatter의 필수 필드는 `name`과 `description`이다. 외부 평가기의 추가 권고 필드를 저장소 규약으로 오인하지 않는다.

## KB 파일 필수 요건
- frontmatter: `title`·`source`(단일 출처 URL/표준, 내부면 정직 라벨)·`last_fetched`(YYYY-MM-DD)·`skills`.
- 본문에 **`## 리뷰 훅`** 체크리스트 섹션 필수.
- 단정은 `source` 근거. 근거 없는 주장 금지.

## 범용성(D3) — 금지 도메인 토큰
- 평가 대상 조직의 **도메인 토큰 목록**(서비스/제품명·내부 모듈명·업종 용어 — STANDARD §3)으로 검색: `grep -rniIE '<service>|<internal-module>|<industry-term>' <T>` → **0 hit** 여야 함. 목록은 조직별로 채운다. 일반 영어 단어(예: `resume`=프로세스 재개)는 도메인 아님.
- 내부 모듈/사내 호스트 하드코딩 금지. 예시는 일반 엔티티(Member/Order/Article).
- 기술 스택 지식(PostgreSQL/Kotlin/Spring/JPA/OpenSearch)은 유지 가능.

## tools 적정성
- 선언한 `tools` 가 실제 절차에 필요한 최소 집합인가(과다 권한 = D5 신호). 문서 생성 에이전트에 불필요한 `Bash`·쓰기 권한 남발 점검.

## 리뷰 훅
- [ ] 정의 `.md` + 번들(SOUL/principles/kb/INDEX) 모두 존재하고 경로 참조가 깨지지 않는가?
- [ ] frontmatter 필수키 충족 + `model` 미하드코딩?
- [ ] 모든 KB에 필수 frontmatter + `## 리뷰 훅` 존재?
- [ ] 정의 본문이 운영 지침만 담고 정체성은 SOUL로 위임?
- [ ] 금지 도메인 토큰 grep 0 hit? 예시가 일반 엔티티?
- [ ] `tools` 가 최소 권한? 과다 권한 없음?
- [ ] manifest.txt 에 등록되어 install/check-manifest 통과?
