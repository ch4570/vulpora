---
description: commit → push → MR(self assign/review) → reviewer agent → CI 대기까지 자동화. 머지는 사용자가 직접(자동 머지 안 함). CI 실패 시 진단·수정 후 처음부터 재시도.
argument-hint: "[target-branch] [--no-review] [--max-retries N] [--draft] [--ignore-soft-failures]"
allowed-tools: Bash, Read, Edit, Write, Grep, Glob, Agent
---

# /ship — 자동 출하 파이프라인

너는 사용자의 현재 작업 브랜치를 출하 직전까지 진행한다(commit → push → MR → review → CI 그린).
**머지는 자동으로 하지 않는다 — 항상 사용자가 직접 한다.** 모든 응답·커밋 메시지·MR 본문은 **한국어**.

GitLab `glab` CLI를 사용한다. **GitLab 인스턴스·사용자명을 하드코딩하지 않는다** — `glab`이 인증된
인스턴스를 그대로 따르고, assignee/reviewer 등은 항상 `@me`(현재 인증된 glab 사용자)로 해석한다.

## 인자 해석

`$ARGUMENTS`를 공백 단위로 파싱한다.

- 첫 번째 비-플래그 토큰 = **타깃 브랜치**. 없으면 프로젝트의 default branch
  (`glab api projects/:fullpath -X GET | jq -r .default_branch`)를 사용한다. 한 번 조회하면 세션 내 재사용.
- (머지는 항상 사용자가 직접 한다. 이 레포에는 자동 머지 옵션이 없다.)
- `--no-review` : reviewer agent 단계 스킵.
- `--max-retries N` : CI 실패 후 자동 재시도 최대 횟수(기본 **3**).
- `--draft` : MR을 Draft로 생성.
- `--ignore-soft-failures` : `allow_failure=true` job 실패를 보고만 하고 진행.

## 사전 검증 (반드시 가장 먼저)

1. `git rev-parse --abbrev-ref HEAD`로 현재 브랜치를 얻는다.
2. 현재 브랜치가 보호 브랜치(`master`/`main`/`develop`/`release-*` — 프로젝트 규약에 맞춰 판단)이면
   **즉시 중단**하고 사용자에게 알린다. 보호 브랜치에서 출하 흐름을 돌리면 안 됨.
3. `git status --porcelain`로 변경 사항을 본다. 변경이 0이고 origin과 동일하면 "출하할 변경이 없습니다"라고 알리고 종료.
4. 타깃 브랜치가 현재 브랜치와 같으면 중단.

## Step 1 — 커밋 & 푸시 (`COMMIT_AND_PUSH`)

1. `git status --porcelain`, `git diff --staged`, `git diff` 셋을 병렬로 확인.
2. `git log -n 5 --pretty=format:"%h %s"`로 이 저장소의 커밋 스타일을 학습해 동일 컨벤션을 따른다
   (예: `type : 메시지` 또는 `type(scope): 메시지` 등 저장소가 쓰는 형태).
3. 변경 의도를 1줄로 압축한 커밋 메시지를 만든다. 한국어 한 줄(필요 시 본문 추가). **"왜"**를 우선.
4. 비밀 파일(.env, credentials, *.key 등)은 절대 커밋하지 않는다. 발견되면 사용자에게 알리고 중단.
5. 파일을 **명시적으로 stage**(`git add <files>`, `git add -A` 금지)한 뒤 커밋. 메시지는 HEREDOC로 전달.
   저장소 규약이 커밋 attribution을 허용하면 끝줄에 `Co-Authored-By: Claude <noreply@anthropic.com>`을 포함하고,
   금지하면 생략한다(저장소/사용자 설정 우선).
6. 푸시. 첫 푸시면 `git push -u origin <branch>`, 이후엔 `git push`. **`--force`/`--no-verify`는 사용자 명시 요청 없이는 금지**.
7. pre-commit/pre-push 훅 실패 시: amend가 아니라 **새 커밋**으로 재시도. 훅 실패 원인을 먼저 고친다.

## Step 2 — MR 보장 (`ENSURE_MR`)

1. 동일 source 브랜치로 열린 MR 조회:
   ```
   glab mr list --source-branch "$(git rev-parse --abbrev-ref HEAD)" --state opened --output json
   ```
2. **있으면**: 그 IID를 재사용. 새 푸시는 자동 반영. description은 필요 시에만 보강(중복 갱신 금지).
3. **없으면**: 새 MR 생성.
   - title: 첫 커밋 메시지(또는 push 그룹 요지)
   - description: `.gitlab/merge_request_templates/`에 템플릿이 있으면 base로 빈 칸을 채워 한국어로 작성.
     없으면 변경 요약·영향 범위·테스트 방법을 한국어로 구성.
   - assignee/reviewer는 **현재 사용자(`@me`)**: `--assignee @me --reviewer @me`.
   - 타깃 브랜치는 사전 결정값. `--draft` 인자가 왔으면 `--draft` 추가.
   - source 브랜치 자동 삭제는 프로젝트 설정에 맡긴다(별도 플래그 주지 않음).
   - 예시:
     ```
     glab mr create \
       --title "<title>" \
       --description "$(cat <<'EOF'
     <body>
     EOF
     )" \
       --target-branch "<target>" \
       --assignee @me \
       --reviewer @me \
       --yes
     ```
4. 생성/탐색된 MR의 IID와 URL을 한 줄로 보고.

## Step 3 — 코드 리뷰 (`REVIEW`)

`--no-review`면 건너뛴다.

1. `Agent` 도구로 변경 언어에 맞는 설치된 리뷰 에이전트(예: `kotlin-spring-reviewer`, `java-reviewer`)를 호출한다. 자동 PR 코멘트는 **달지 않는다**.
2. 결과를 한국어로 요약:
   - **High/Confident 버그** → 파일 수정 후 **Step 1로 점프**(같은 MR에 후속 커밋이 쌓인다).
   - **사소한 지적/스타일**만 → 한 줄 보고 후 진행.
   - 깨끗하면 다음 단계.
3. 같은 지적이 두 번 연속 반복돼도 못 고치면 **사용자에게 결정 요청**(자동 루프 탈출).

## Step 4 — CI 파이프라인 대기 (`CI_WAIT`)

1. 현재 SHA에 연동된 MR 파이프라인을 찾는다:
   ```
   glab api "projects/:fullpath/merge_requests/<iid>/pipelines"
   ```
   head SHA == 로컬 SHA 인 최신 파이프라인 ID를 얻는다.
2. 폴링: 30초 간격으로 status 조회. **`run_in_background`·짧은 `sleep` 단독 금지** — `until`/`for` 루프를 한 번의 `Bash` 호출로 돌린다.

   ⚠️ **zsh 안전 규칙**: 변수명으로 `status`를 **절대 쓰지 않는다**(zsh read-only 예약어 → `read-only variable: status` 즉시 실패). `st`/`pstatus` 등을 쓴다.

   `Bash` 호출당 ~9분(30s×18)으로 끊고, 종료 상태(`success|failed|canceled|skipped`)가 안 나오면 동일 루프 재호출:
   ```bash
   PID=<pipeline-id>
   for i in $(seq 1 18); do
     st=$(glab api "projects/:fullpath/pipelines/$PID" 2>/dev/null \
            | python3 -c "import sys,json;print(json.load(sys.stdin).get('status',''))")
     echo "[$i/18 $(date +%H:%M:%S)] pipeline=$st"
     if [[ "$st" =~ ^(success|failed|canceled|skipped)$ ]]; then break; fi
     sleep 30
   done
   ```
   사용자가 인터럽트하면 중단.

3. 파이프라인 status가 종료 상태가 되면 **반드시 job 단위까지 재확인**한다. `allow_failure: true`가 걸린 job은
   실패해도 파이프라인 전체 status가 `success`로 표시될 수 있으므로, status만 보고 그린 판정하면 안 된다.
   ```bash
   glab api "projects/:fullpath/pipelines/<id>/jobs" \
     | python3 -c "import sys,json;[print(j['stage'],j['name'],j['status'],j.get('allow_failure',False)) for j in json.load(sys.stdin)]"
   ```

4. job 단위 분류 — **차단(blocking) vs 허용(advisory)**:
   - `allow_failure=False` job이 `failed`/`canceled` → **차단**. Step 4-5로.
   - `allow_failure=True` job이 `failed`/`canceled` → **허용이지만 무시하지 않는다**: 사용자에게 한 줄 보고하고
     기본은 **차단 처리**(Step 4-5). `--ignore-soft-failures`가 왔으면 보고만 하고 Step 5로.
   - 모두 `success` → "CI 그린" 보고 후 Step 5로.

5. **failed 진단 분기**(차단): 실패 job ID로 로그 분석.
   ```bash
   SHIP_TRACE="$(mktemp "${TMPDIR:-/tmp}/vulpora-ship-trace.XXXXXX")" || exit 1
   trap 'rm -f "$SHIP_TRACE"' EXIT HUP INT TERM
   glab api "projects/:fullpath/jobs/<job-id>/trace" > "$SHIP_TRACE"
   grep -nE "FAILED|FAIL$|Test .* failed|tests? failed|What went wrong|BUILD FAILED|ERROR" "$SHIP_TRACE" | head -50
   ```
   - 실패 **첫 원인 라인**과 파일을 1~2줄로 보고.
   - 가능하면 **로컬에서 그 테스트만 단독 실행**해 flaky 검증(빌드시스템에 맞는 명령 — 아래 참고).
   - 수정 적용 → **Step 1로 점프**. 재시도는 `--max-retries`(기본 3)까지. 초과 시 마지막 로그 요지와 함께 사용자에게 결정 요청.

6. 새 푸시로 새 파이프라인이 생겼다면 추적 대상을 갱신.

> **로컬 테스트 명령(빌드시스템 자동감지)**: `gradlew`/`build.gradle*` → `./gradlew test`(또는 모듈 `:m:test`),
> `pom.xml` → `mvn -q test`, `package.json` → 패키지매니저(lock 파일로 npm/pnpm/yarn 판별) `test` 스크립트.

## Step 5 — 머지 인계 (`HANDOFF`)

**이 레포에서는 `/ship`이 머지를 절대 자동 실행하지 않는다. 머지는 항상 사용자가 직접 한다.**
`glab mr merge`(또는 동등한 머지 동작)는 사용자가 명시적으로 별도 요청하지 않는 한 호출 금지.

1. MR 상태 재확인 — open, head SHA == 최신 푸시 SHA, pipeline success(있으면), conflict 없음.
2. 충돌이 있으면 보고(자동 rebase 금지 — 사용자 명시 요청 없음).
3. **머지하지 않는다.** 대신 머지 준비 상태를 한국어로 요약하고 MR URL을 출력해 사용자에게 인계한다:
   - mergeable 여부, head SHA, target 브랜치, 충돌/파이프라인 상태를 한 줄씩.
   - "머지는 사용자가 직접 진행하세요"를 명시하고, 사용자가 쓸 수 있는 명령을 안내(예: `glab mr merge <iid>`).
4. 사용자가 **이후에 명시적으로** "머지해"라고 요청하면 그때만 `glab mr merge <iid> --yes`를 실행한다.
5. 로컬 브랜치는 **삭제하지 않는다** — 사용자 명시 요청 시에만.

## 안전·예의 규칙

- 모든 위험 동작(force push, reset --hard, branch -D, hook 우회) 금지 — 사용자 명시 요청 시에만.
- 각 Step 시작 시 "이제 무엇을 하는지" 한 줄 안내, 끝나면 한 줄 결과.
- 자동 루프(Step 1 ↔ Step 4) 카운터를 유지하고 매 진입마다 "재시도 N/MAX"를 알린다.
- 사용자가 도중에 메시지를 보내면 즉시 현재 단계를 멈추고 응답한다.
- 모든 출력은 한국어.

## 마지막 보고 형식

성공(머지 인계):
```
✅ /ship 완료 — 머지 대기(사용자가 직접 진행)
- MR  : <url> (!<iid>)
- 커밋: <last sha> "<title>"
- CI  : success (pipeline <id>)
- 머지: 미실행 — 직접 머지하세요 (예: `glab mr merge <iid>`)
```
중단:
```
⏸ /ship 중단 (단계: <step>)
- 이유: <한 줄>
- 다음 행동 후보: <옵션 1>, <옵션 2>
```
