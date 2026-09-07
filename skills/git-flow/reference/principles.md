# git-flow 핵심 원칙 (Principles)

> 로컬 변경을 `commit → push → MR`로 안전하게 올리는 기본 자동 파이프라인의 판단 기준("헌법").
> KB(공식 문서 distill)가 "사실·규칙"이라면, 이 문서는 "통찰·판단 기준"이다. 충돌 시 **KB(공식 문서)가 우선**.
>
> **출처(Sources)**
> - Conventional Commits 1.0.0 — https://www.conventionalcommits.org/en/v1.0.0/
> - Git 공식 문서(git-scm) — https://git-scm.com/doc
> - GitLab Docs (Merge requests, Reviews, Protected branches, CI/CD) — https://docs.gitlab.com/
> - glab(GitLab CLI) Docs — https://gitlab.com/gitlab-org/cli
> - A successful Git branching model (Vincent Driessen) — https://nvie.com/posts/a-successful-git-branching-model/

---

## 0. 대전제: 안전한 기본값은 묻지 않고 적용한다

- 작업 시작 시 사용자가 target branch를 지정하지 않으면 `develop`, 지정하면 해당 브랜치를 base로 삼는다.
  origin에서 base를 fast-forward한 뒤 작업 의도에 맞는 하위 브랜치를 만들고, 구현은 그 브랜치에서만 한다.
- 사용자가 별도 값을 주지 않으면 안전한 변경 전체를 명시적으로 stage하고, diff 기반 커밋 메시지로
  commit/push한 뒤 `target=base branch`, `assignee=@me`, `reviewer=@me`로 MR을 만든다.
- 질문은 secret, protected/diverged branch, 권한 부족, 안전한 기본값이 없는 transport 강등처럼 실제
  진행을 갈라놓는 blocker에만 한 번 한다.
- 큰 diff나 여러 독립 관심사가 있으면 atomic commit으로 나누고 각 commit을 검증·push한 뒤 MR을 만든다.
- 자동 끝까지(머지 포함)는 별도 흐름(`/ship`)의 책임. git-flow는 **MR 생성에서 멈춘다.**

## 1. 브랜치 모델은 의도를 드러낸다

- 장수 브랜치(`master`/`develop`)는 **보호 대상**이며 직접 커밋/푸시하지 않는다.
- 기본 작업은 최신 `develop`의 하위 브랜치에서 시작한다. 명시적 target이 있으면 최신 target의 하위
  브랜치에서 시작하며, target은 이후 MR target으로 유지한다.
- 작업은 의도를 드러내는 `feature/*`, `fix/*`, `refactor/*`, `chore/*` 브랜치에서 수행한다.
- base 최신화는 fast-forward만 허용한다. dirty tree, missing base, divergence는 보존하고 중단한다.
- landing 단계가 보호 브랜치 위에서 호출되면 즉시 중단한다. 작업 시작 단계에서는 clean base를
  fast-forward하기 위해서만 잠시 checkout하고 곧바로 하위 작업 브랜치를 만든다.

## 2. 커밋은 기계가 읽을 수 있어야 한다 (Conventional Commits)

- `<type>[scope] : <설명>` 형식. type은 변경의 **성격**을 선언한다(feat/fix/refactor/docs/test/chore/perf/ci).
- `feat`/`fix`는 SemVer의 MINOR/PATCH에 대응. 파괴적 변경은 `!` 또는 `BREAKING CHANGE:` 푸터로 명시.
- type은 diff에서 유추하되, 여러 테마가 섞이면 **행동 영향이 가장 큰 것**을 고른다.
- 본문은 "왜"를 적는다. "무엇"은 diff가 말한다.

## 3. 비밀은 절대 커밋 트리에 들어가지 않는다

- stage 전에 secret-file 가드를 돌린다. 매치되면 사용자가 "그냥 올려라" 해도 진행하지 않는다.
- `.env`(예외 `.env.example`), `*.key/*.pem/*.p12/*.jks`, `*secret*/*token*/credentials*` 패턴.
- 이미 푸시된 비밀은 git 히스토리에 영구히 남는다 → **사전 차단**이 유일하게 싼 방어다.

## 4. staging은 명시적이다

- `git add -A`/`git add .` 금지. 무엇이 커밋되는지 사람이 알아야 한다.
- 의도치 않은 파일(빌드 산출물, 로컬 설정)이 섞이는 사고를 구조적으로 막는다.

## 5. 히스토리를 파괴하는 명령은 기본 금지

- `--amend`, `--no-verify`, `--force*`, `reset --hard`, `branch -D`는 **사용자 명시 요청 시에만**.
- pre-commit 훅이 실패하면 원인을 고치고 **새 커밋**을 만든다(amend로 덮지 않는다).

## 6. push는 divergence를 먼저 확인한다

- 푸시 전 `fetch` + divergence 점검. behind/diverged면 중단하고 사용자가 명시적으로 해소한다.
- 자동 rebase/merge로 히스토리를 임의로 바꾸지 않는다.

## 7. MR은 리뷰를 위한 문서다

- assignee/reviewer는 별도 지시가 없으면 `@me`다. `@me`는 인증 컨텍스트로 해석하고 이메일로 추측하지 않는다.
- 본문은 슬림 템플릿으로 일관되게. 체크박스는 diff로 자동 채우되, "검증" 박스는 **증거가 있을 때만** 체크.
- 사용자/인스턴스 호스트는 하드코딩하지 않는다 — `glab` 인증 컨텍스트와 `origin`에서 유도한다.

## 8. 전송 방식은 명시적으로 바인딩하고 묵시적 강등 금지

- `glab`(선호) → REST(토큰) → push-option(최후) 순으로 탐지. 첫 viable을 바인딩.
- push-option은 4개 한계(리뷰어 불가, 단일행 본문, ref-update 시에만 동작, 출력 필터 취약)를 사용자가 수용해야 쓴다.

## 9. 머지 전 CI green

- 리뷰 통과 + CI green이 머지 전제다(이 스킬 범위 밖이지만 MR 생성 시 검증 TODO로 남긴다).
- "별일 없어 보임"으로 검증 체크박스를 채우지 않는다.
