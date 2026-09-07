---
title: 비밀 가드 / pre-push 위생
source: https://git-scm.com/book/en/v2/Git-Tools-Rewriting-History
last_fetched: 2026-06-24
skills: [git-flow]
---

# KB: 비밀 가드 / pre-push 위생

> 근거: Git 공식 문서 "Rewriting History"(히스토리에 들어간 데이터의 영속성),
> "gitignore"(https://git-scm.com/docs/gitignore), GitLab Docs "Push rules"
> (https://docs.gitlab.com/user/project/repository/push_rules/).

## 핵심 사실
- **커밋된 비밀은 영구적이다.** 다음 커밋에서 지워도 히스토리(과거 커밋)에 남는다. 제거하려면
  히스토리 재작성(`git filter-repo` 등) + 강제 푸시 + **자격증명 회전**이 필요하다 → 사전 차단이 유일하게 싼 방어.
- 따라서 push 전에 비밀이 stage에 들어갔는지 차단하는 것이 1순위.

## 차단 패턴(스캔)
- `.env`, `.env.*` (예외: `.env.example`)
- `*.key`, `*.pem`, `*.p12`, `*.jks`
- `*secret*`, `*token*`, `credentials*` (대소문자 무시; `*/test/**` 픽스처는 제외)

## staging 위생
- `git add -A`/`git add .` 금지 → **명시적 파일**만 stage. 의도치 않은 비밀/산출물 혼입 방지.
- `.gitignore`로 빌드 산출물·로컬 설정·시크릿 경로를 선차단(추적 전 파일에만 효력).

## 서버측 보강(선택)
- GitLab Push rules / Secret Detection으로 푸시 단계에서 한 번 더 막을 수 있다(클라이언트 가드와 중복 방어).

## 리뷰 훅
- [ ] stage 목록에 차단 패턴 파일이 없는가. 있으면 사용자가 우회를 요청해도 **진행 금지**.
- [ ] staging이 명시적인가(`-A`/`.` 미사용).
- [ ] 새 비밀 경로가 `.gitignore`에 반영됐는가.
- [ ] 이미 푸시된 비밀이 발견되면 → 회전 + 히스토리 재작성 안내(단순 삭제 커밋으론 부족).
