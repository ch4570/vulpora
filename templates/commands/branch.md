---
description: 통합 브랜치(develop 등) 기반 새 작업 브랜치 생성. 기본 feature/<user>/<slug>, 필요 시 type 오버라이드.
argument-hint: "<slug> [--type <type>]   (또는 <type>/<slug>)"
allowed-tools: Bash
---

# /branch — 통합 브랜치 기반 새 작업 브랜치 생성

통합 브랜치(기본 `develop`, 없으면 default branch)를 최신화한 뒤 그것을 base로 새 작업 브랜치를 만들고 switch 한다.

## 브랜치 이름 규칙

`<type>/<user>/<slug>` 형태 — **사용자명을 하드코딩하지 않는다.**

- `<type>` — 기본 `feature`. 변경 의도에 맞춰 `fix`/`refactor`/`chore`/`docs`/`test`/`perf` 등으로
  사용자가 명시하거나 자동 선택.
- `<user>` — `git config user.email`의 `@` 앞부분(예: `chatoy@example.com` → `chatoy`).
- `<slug>` — 케밥-케이스 영문/숫자/하이픈. 사용자 인자.

## 인자 해석

`$ARGUMENTS`를 공백 단위로 파싱한다.

1. 첫 토큰이 `<type>/<slug>` 형태이면(예: `fix/null-check`) 그대로 사용.
2. `--type <type>` 또는 `-t <type>` 플래그가 있으면 그것을 type으로 사용.
3. 첫 토큰이 알려진 type(`feature`/`fix`/`refactor`/`chore`/`docs`/`test`/`perf`)이고 둘째가 slug이면 첫 토큰을 type으로 해석.
4. 어디에도 해당 안 되면 type은 작업 컨텍스트(현재 git diff, 직전 대화의 변경 의도)로 자동 결정. 불명확하면 기본 `feature`.

알려진 type 외의 값(예: `feat`, `bugfix`)은 표준 type으로 정정 제안 후 진행.

## 동작 순서

1. **사전 검증**:
   - untracked/modified 변경분이 있으면 `git status --short`로 한 줄 보고. 변경분은 새 브랜치로 carry-over 됨을 명시.
   - 통합 브랜치 결정: `develop`이 origin에 있으면 `develop`, 없으면 default branch
     (`git symbolic-ref refs/remotes/origin/HEAD` 또는 `glab api projects/:fullpath | jq -r .default_branch`).

2. **사용자 식별** (하드코딩 금지):
   ```bash
   USER_ID=$(git config user.email | sed 's/@.*//')
   ```
   비어 있으면 즉시 중단하고 `git config user.email` 설정을 요청.

3. **base 브랜치 fetch**:
   ```bash
   git fetch origin <integration-branch>
   ```

4. **type 결정**: 위 우선순위에 따라.

5. **slug 정합**: 공백→`-`, 대문자→소문자. 한글·특수문자가 들어오면 정정 제안 후 진행.

6. **이름 충돌 체크**:
   ```bash
   git show-ref --verify --quiet "refs/heads/<type>/<user>/<slug>"
   ```
   존재하면 알리고 중단(자동 suffix 금지).

7. **브랜치 생성·전환**:
   ```bash
   git switch -c "<type>/<user>/<slug>" "origin/<integration-branch>"
   ```

8. **결과 보고**(한 줄):
   ```
   ✅ <type>/<user>/<slug> 생성 (base: origin/<integration-branch> @ <sha>)
   ```
   carry-over 변경분이 있으면 별도 한 줄.

## 안전 규칙

- push 하지 않는다 — 사용자가 commit 후 직접 또는 `/ship`으로 push.
- 동명 브랜치가 이미 존재하면 중단 — 강제 덮어쓰기 금지.
- 사용자명 하드코딩 금지 — `git config user.email`에서 동적 추출, 실패 시 중단.
- 모든 출력은 한국어.

## 예시
```
/branch index-version              → 의도 자동 판단 → <type>/<user>/index-version
/branch fix/null-check             → fix/<user>/null-check
/branch readme-cleanup --type docs → docs/<user>/readme-cleanup
/branch feature/add-foo            → feature/<user>/add-foo
```
