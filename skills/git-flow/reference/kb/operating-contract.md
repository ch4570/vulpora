---
title: Git work-branch and merge-request contract
source: ../../SKILL.md
last_fetched: 2026-09-01
skills: [git-flow]
---

# Git work-branch and merge-request contract


# git-flow — Work Branch and Commit/Push/MR Skill

This skill defines the default-autonomous pipeline from safe work-branch preparation through landing local changes:
`update base → create child branch → one or more commits → staged pushes → MR creation`. It is normative —
keywords **MUST / MUST NOT / SHOULD** carry RFC-2119 meaning.

> Companion to the `/ship` slash command, which performs the **autonomous** end-to-end flow (commit → push → MR → review → CI wait → merge). `git-flow` stops at MR creation; review, CI, and merge are out of scope here.

> **Reference loading:** This is the complete publication contract. Read [principles](../principles.md)
> only for rationale and [the KB index](INDEX.md) only to find a needed transport/policy topic.
> Neither is an unconditional first read. MUST NOT recursively load the entire KB.

---

## 0. Scope and non-goals (MUST)

- In scope: task-start base selection and fast-forward, child work-branch creation, safe stage selection, one or more atomic commits, staged pushes to origin, MR creation/discovery on GitLab.
- Out of scope: code review, CI polling, MR merge, branch deletion, force-push recovery, rebase. If the user asks for these, point them at `/ship` or perform them as an explicit follow-up step outside this skill.
- All user-facing text in this flow (status lines, prompts, commit message, MR title/body) MUST be in **Korean**. Shell command output is left as-is.

## 0.5 Algorithm overview (MUST follow this sequence)

```
New-task path:
0. Prepare the work branch, before implementation edits
   0a. Bind $BASE_BRANCH to the explicit user target, otherwise `develop`.
   0b. Require a clean tree, fetch origin, and fast-forward the local base only. Dirty or diverged → STOP.
   0c. Derive $WORK_BRANCH from task intent and repository naming conventions, then create it from $BASE_BRANCH.
       Never implement directly on the base. Bind $MR_TARGET=$BASE_BRANCH.
   0d. Return control to implementation. Do not run the no-change landing short-circuit.

Existing-work landing path:
1. Pre-check
   1a. Read $BRANCH_NAME. If protected → STOP.
   1b. Read working-tree state. If clean AND not ahead of origin → emit "변경 사항이 없습니다" → STOP.
   1c. Bind $TRANSPORT ∈ {glab, REST, push-option}. Push-option requires explicit user
       acceptance of 4 limits. No transport viable → STOP.
2. Commit (Stage 1)
   2a. git status / diff (parallel). Run secret-file guard. Match → STOP.
   2b. Partition safe files into coherent commit groups. For ordinary diffs use one group; for large or
       multi-theme diffs use multiple groups. git add explicit files per group.
   2c. Derive $COMMIT_TYPE from each staged diff (§2.4 heuristic). Generate $COMMIT_MSG and commit without asking
       unless the user supplied an override or the grouping is materially ambiguous.
3. Push (Stage 2)
   3a. Fetch + divergence check. behind/diverged → STOP.
   3b. Push each completed commit group after divergence and hook checks. If $TRANSPORT == push-option: §4.2/§4.3
       MUST already have produced $MR_*; push with `-o merge_request.*` flags. Else: plain push.
4. MR (Stage 3)
   4a. If $TRANSPORT ∈ {glab, REST}: discover existing MR on $BRANCH_NAME. Found → reuse $MR_IID.
   4b. Keep $MR_TARGET=$BASE_BRANCH, bind $MR_TITLE from the branch change summary, and both $MR_ASSIGNEE/$MR_REVIEWERS=`@me`
       unless the user already supplied overrides.
       Resolve `@me` per transport (§4.2 rule — no email-based guessing).
   4c. Render $MR_BODY from §4.3 template, auto-fill checkboxes from `git diff --name-only`,
       propose $RISK_LEVEL and proceed without confirmation except for unsupported High-risk side effects.
   4d. Create MR via $TRANSPORT (§4.4).
   4e. Re-query (§4.5) to capture canonical $MR_IID and $MR_URL.
5. Final report (§6) with $TRANSPORT, $MR_IID, $MR_URL, auto-fill summary, post-creation TODOs.
```

## 0.6 State variables (MUST track across stages)

| Name | Set in | Domain / Shape |
|---|---|---|
| `$BASE_BRANCH` | §0.7 | explicit user target, otherwise `develop` |
| `$WORK_BRANCH` | §0.7 | task-derived child branch, or current non-protected branch when landing existing work |
| `$BRANCH_NAME` | §1.1 | `git rev-parse --abbrev-ref HEAD` |
| `$TRANSPORT` | §1.3 | one of `glab` \| `REST` \| `push-option` |
| `$STAGED_FILES` | §2.3 | explicit list of paths (no `-A`, no `.`) |
| `$COMMIT_TYPE` | §2.4 | one of `feat`/`fix`/`refactor`/`docs`/`test`/`chore`/`perf`/`ci` |
| `$COMMIT_MSG` | §2.4 | `<type> : <한국어 메시지>` + optional body |
| `$MR_TARGET` | §0.7/§4.2 | branch name, default `$BASE_BRANCH` |
| `$MR_TITLE` | §4.2 | Korean ≤ 70 chars |
| `$MR_ASSIGNEE` | §4.2 | username string \| empty (default `@me`) |
| `$MR_REVIEWERS` | §4.2 | comma-separated usernames \| empty (default `@me`) |
| `$MR_BODY` | §4.3 | rendered template (Korean) |
| `$RISK_LEVEL` | §4.3 | `Low` \| `Medium` \| `High` |
| `$MR_IID` | §4.5 | integer (or empty if push-option without token) |
| `$MR_URL` | §4.5 | absolute `web_url` (or search URL fallback) |

Any stage that produces one of these MUST end with an `**Outputs:**` line naming what got bound. Any stage that consumes a state variable MUST reference it by name.

---

## 0.7 Work-start branch preparation

New-task requests use [branch preparation](../branch-preparation.md) and stop after creating the work branch.
They do not load this publication contract. When landing existing work, bind `$WORK_BRANCH=$BRANCH_NAME`,
keep the current branch, and use the explicit target or `develop` as `$BASE_BRANCH` and `$MR_TARGET`.
Verify the base relationship where possible and report mismatches without switching, rebasing, or rewriting work.
The clean-tree prerequisite belongs to branch preparation; ordinary landing diffs proceed through §1.

## 1. Preconditions (MUST)

### 1.1 Branch guard

```bash
git rev-parse --abbrev-ref HEAD
```

**Stop condition:** result is `master`, `develop`, or matches `release-*` → stop and report (보호 브랜치).

**Outputs:** `$BRANCH_NAME`.

### 1.2 No-change short-circuit

```bash
git status --porcelain
git rev-list --count "@{u}..HEAD" 2>/dev/null || echo 0
```

**Stop condition:** staged + unstaged changes **= 0** **and** branch is not ahead of origin (or has no upstream + no local changes). Emit exactly:

```
ℹ️ 변경 사항이 없습니다 — commit/push/MR 진행할 작업이 없어 git-flow를 종료합니다.
- 브랜치: $BRANCH_NAME
- 상태  : 작업 트리 clean, origin 대비 ahead 0
- 필요 시: 변경을 만든 뒤 다시 `/git-flow` 호출하거나, 이미 푸시된 브랜치의 MR만 만들려면 토큰을 설정해 별도로 진행
```

Do **not** offer empty-commit / push-option fallback automatically — that requires an explicit, separate user request.

### 1.3 Transport selection (MUST — bind `$TRANSPORT` before Stage 2)

Probe in priority order; bind the first viable result. Never silently downgrade.

| Rank | `$TRANSPORT` | Probe | Stage 2 push form |
|------|--------------|-------|-------------------|
| Preferred | `glab` | `glab --version` ok **and** `glab auth status` shows an active token for the authenticated GitLab instance | plain `git push` |
| Fallback A | `REST` | env `GITLAB_TOKEN` (or `CI_JOB_TOKEN`) set with `api` scope | plain `git push` |
| Fallback B | `push-option` | both above fail **and** user explicitly accepts the 4 limits below | push carries `-o merge_request.*` |

**If glab is missing**, emit this guidance **before** falling back (no silent fallback):

```
ℹ️ glab 미설치 — 권장 복구:
  (패키지 매니저로 설치) && glab auth login --hostname <your-gitlab-host>
또는 GitLab Personal Access Token(api scope)을 발급해 `export GITLAB_TOKEN=...` 후 다시 실행.
둘 다 어려우면 push-option 폴백을 쓸 수 있지만 아래 4가지 한계가 있습니다.
```

> 호스트는 하드코딩하지 말고 `git remote get-url origin`에서 유도하거나 사용자가 인증한 인스턴스를 따른다.

**Push-option fallback friction — MUST surface BEFORE asking for acceptance:**

1. **Reviewer cannot be set** — `merge_request.reviewer` push option does not exist. Add reviewers via browser/REST afterwards.
2. **Description is effectively single-line** — Korean checkbox templates from §4.3 break under shell quoting. Only a one-line summary is safe; the rich body must be edited in the browser afterwards.
3. **Only fires on a ref-updating push** — if the branch is already in sync with origin, a noisy empty commit is required to trigger MR creation. Must be a **separate** explicit user request; never automatic.
4. **Response is fragile under output filters** — GitLab's `remote: View merge request for ...: <url>` line can be swallowed by tools like RTK. §4.5 re-query is the only reliable way to capture IID/URL.

Push-option cannot preserve the default reviewer contract. Ask once whether the user accepts the four limitations
and manual reviewer follow-up. Do not repeatedly ask for fields already covered by defaults.

**Stop condition:** no transport viable **and** user declines the 4 limits → stop and report.

**Outputs:** `$TRANSPORT`.

---

## 2. Stage 1 — Commit

### 2.1 Inspect

Run in parallel:

```bash
git status --porcelain
git diff --staged
git diff
```

### 2.2 Secret-file guard (MUST)

Scan the staged + unstaged file list for these patterns. **Stop condition:** any match — do NOT proceed even if the user asks to bypass without removing the file:

- `.env`, `.env.*` (except `.env.example`)
- `*.key`, `*.pem`, `*.p12`, `*.jks`
- `credentials*`, `*secret*`, `*token*` (case-insensitive, excluding test fixtures under `*/test/**`)

### 2.3 Stage selection and commit grouping

Default selection: all non-secret modified/untracked files in the user's requested scope. Proceed without asking.
If the user named explicit paths, treat that as an override and exclude everything else.

Partition before staging when the diff is large or has independent themes. Treat a diff as large when any condition
holds: more than 20 files, more than 1,000 changed lines, or at least three independently revertible concerns.
Prefer commit boundaries by behavior/contract rather than file type. Each group MUST build a reviewable state and
MUST NOT split mutually dependent production and regression-test changes.

```bash
git add <explicit-file-1> <explicit-file-2> ...
```

`git add -A` and `git add .` are MUST NOT — staging MUST be explicit.

After each commit group, run its available focused verification and continue to §3 so that commit and push progress
is preserved step by step. Return to §2.3 for the next group. Create the MR only after every planned group is pushed.

**Outputs:** `$STAGED_FILES`, commit-group plan.

### 2.4 Commit message — diff-driven proposal (MUST)

Convention:

```
<type> : <한국어 메시지>
```

- Single space before the colon (`feat : ...`, not `feat: ...`).
- Body optional. If present, blank line then 1–3 lines explaining "왜".

**Derive `$COMMIT_TYPE` from staged diff (use strongest match; if multiple apply, prefer the most behavior-affecting):**

| Diff signal (staged only) | `$COMMIT_TYPE` |
|---|---|
| Only `*.md`, docs, comments | `docs` |
| Only test files (`*/test/**`, `*Test.kt`, `*Spec.kt`, etc.) | `test` |
| Only `.gitlab-ci.yml`, GitHub workflows, build pipeline configs | `ci` |
| Only Gradle/Dockerfile/`.gitignore`/project metadata/`.claude/**` | `chore` |
| Behavior-preserving rename/move/extract, no new public surface | `refactor` |
| Adds new public function / endpoint / feature flag / module wiring | `feat` |
| Fixes a behavior bug (test diff shows assertion change, or comment/issue link says "fix") | `fix` |
| Changes algorithm/index/query/caching to improve runtime or memory | `perf` |

After choosing `$COMMIT_TYPE`, generate a Korean summary of the **most representative** change (≤ 70 chars where
possible). Apply repository commit-message requirements, including required trailers, in addition to this house
style. Proceed without asking unless the user supplied a message override or the diff cannot be classified safely.

**Outputs:** `$COMMIT_TYPE`, `$COMMIT_MSG`.

### 2.5 Commit

```bash
git commit \
  -m "<type> : <한국어 메시지>" \
  -m "<선택적 본문: 왜 바뀌었는지>" \
  -m "<repository-required native trailer block>"
```

- `--amend` MUST NOT be used unless the user explicitly asks.
- `--no-verify` MUST NOT be used unless the user explicitly asks.
- If a pre-commit hook fails, fix the underlying issue and create a **new** commit. Do not amend.

---

## 3. Stage 2 — Push

### 3.1 Divergence check

```bash
git fetch origin "$BRANCH_NAME" 2>/dev/null || true
git status -sb
```

**Stop condition:** local branch is behind or diverged from origin → stop and report (no auto-rebase/merge — user resolves explicitly).

### 3.0 Cross-stage binding (MUST — the push-option trap)

GitLab honors `-o merge_request.*` push options **only when the push actually updates a ref**. Up-to-date pushes silently drop them.

| `$TRANSPORT` | §3.2 push form | When are MR fields collected? |
|---|---|---|
| `glab` or `REST` | plain `git push` | Stage 3 (§4.2), independent of push |
| `push-option` | `git push` **with all `-o merge_request.*` flags** | Stage 3 (§4.2/§4.3) runs **before** §3.2 — push and MR creation are atomic |

**Stop condition:** if §3.2 has already completed without options and `$TRANSPORT == push-option` was picked by mistake → stop. Do not invent recovery via `--allow-empty` unless user explicitly approves a noise commit.

### 3.2 Push each completed group

Proceed without asking when the branch is safe, not behind/diverged, and the transport is viable. Push after each
coherent commit group so completed work is preserved remotely before starting the next group.

```bash
# First push (no upstream tracked):
git push -u origin "$BRANCH_NAME"

# Subsequent push:
git push
```

`--force`, `--force-with-lease`, `--no-verify` MUST NOT be used unless explicitly requested.

---

## 4. Stage 3 — MR creation

GitLab host: derived from `origin`, never hardcoded. MR operations dispatch on `$TRANSPORT` bound in §1.3.

### 4.0 Transport setup

For `$TRANSPORT == REST`, set up project context once. Derive the host from the remote so the skill stays instance-agnostic:

```bash
PROJECT_PATH=$(git remote get-url origin | sed -E 's#^https?://[^/]+/##; s#\.git$##')
PROJECT_ID=$(printf '%s' "$PROJECT_PATH" | python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.stdin.read(),safe=""))')
GITLAB_HOST=$(git remote get-url origin | sed -E 's#^https?://##; s#/.*$##')

# Keep the token out of curl argv/process listings. Fail closed on characters
# that could alter curl's config syntax, and never enable shell xtrace here.
gitlab_api() {
  case "${GITLAB_TOKEN:-}" in ''|*[!A-Za-z0-9_-]*) return 64 ;; esac
  curl -fsSL \
    --config <(printf 'header = "PRIVATE-TOKEN: %s"\n' "$GITLAB_TOKEN") \
    "$@"
}
```

All REST calls MUST use `gitlab_api`, keep shell tracing disabled, and target
`https://$GITLAB_HOST/api/v4/projects/$PROJECT_ID/...`.

### 4.1 Discover existing MR

- `$TRANSPORT == glab`:

  ```bash
  glab mr list --source-branch "$BRANCH_NAME" --output json
  ```

- `$TRANSPORT == REST`:

  ```bash
  gitlab_api \
    "https://$GITLAB_HOST/api/v4/projects/$PROJECT_ID/merge_requests?source_branch=$(printf '%s' "$BRANCH_NAME" | python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.stdin.read(),safe=""))')&state=opened"
  ```

  **Extract:** first element's `.iid` and `.web_url`. If non-empty, bind to `$MR_IID` / `$MR_URL`. Skip creation.

- `$TRANSPORT == push-option`: no pre-creation discovery — MR is created as a side effect of the Stage 2 push. Run discovery **after** §4.5.

If a discovered MR exists, reuse it and update its title/body/assignee/reviewer from the current run defaults unless
the user explicitly requested preserving existing metadata.

**Outputs (if found):** `$MR_IID`, `$MR_URL`.

### 4.2 Bind MR fields

Bind all four automatically. User-provided values override these defaults.

1. **`$MR_TARGET`** — default `$BASE_BRANCH` from §0.7. Verify the branch exists on origin before proceeding.
2. **`$MR_TITLE`** — default = latest commit subject from this push group. Korean, ≤ 70 chars where possible.
3. **`$MR_ASSIGNEE`** (default **`@me`**) — `@me` | other username (e.g. `someone.dev`) | empty.
4. **`$MR_REVIEWERS`** (default **`@me`**) — same as assignee, plus: multiple reviewers MAY be comma-separated; `@me` self-review allowed.

**Username resolution rule (MUST)** — when the user picks `@me`, resolve per transport. Never guess from `git config user.email`:

| `$TRANSPORT` | Resolve `@me` via |
|---|---|
| `glab` | `glab api /user` → read `.username` |
| `REST` | `GET https://$GITLAB_HOST/api/v4/user` (with `PRIVATE-TOKEN`) → read `.username` |
| `push-option` | Cannot safely resolve `@me`; ask once for the username together with fallback acceptance |

**Outputs:** `$MR_TARGET`, `$MR_TITLE`, `$MR_ASSIGNEE`, `$MR_REVIEWERS`.

### 4.3 MR body — slim template

Render `$MR_BODY` from this template. Korean body. Auto-fill checkboxes per rules below and proceed without asking.

```markdown
## 변경사항 설명

{{1–3줄 — 무엇이 왜 바뀌었는지. 커밋 본문이 충분하면 본문 인용}}

## 변경 영향 주요 비즈니스 영역

* [{{x or space}}] *-api (API 모듈)
* [{{x or space}}] *-worker (백그라운드/배치 모듈)

## 변경 여파 주요 배포 Module

* [{{x or space}}] {{변경된 모듈 1}}
* [{{x or space}}] {{변경된 모듈 2}}
* [{{x or space}}] (해당 없음 — 스킬/문서/설정/CI만 변경)

## 위험도 / 롤백

- 위험도: {{Low | Medium | High}} — {{1줄 사유}}
- 롤백  : {{revert 가능 / 마이그레이션 역방향 / 피처 플래그 / 해당 없음}}

## 검증

* [{{x or space}}] 로컬 빌드/테스트 통과
* [{{x or space}}] 관련 E2E 시나리오 통과 (또는 해당 없음)
* [{{x or space}}] 수동 검증 완료 (또는 해당 없음)

## 리뷰어를 위한 가이드

* {{먼저 볼 파일/패키지 1–3개 — diff 기준 가장 의미 있는 변경 지점}}
* {{관련 Jira / Wiki / 이전 MR 링크가 있으면 추가, 없으면 "해당 없음"}}
```

**Checkbox auto-fill rules** — derive from `git diff --name-only origin/$MR_TARGET...HEAD`:

| Pattern in any changed file path | Auto-check |
|---|---|
| path contains an API module folder (e.g. `*-api/`) | `*-api` |
| path contains a worker/batch module folder (e.g. `*-worker/`) | `*-worker` |
| under a domain/deploy module folder | matching module(s) under "주요 배포 Module" |
| **no pattern above matches any line** | `(해당 없음 — 스킬/문서/설정/CI만 변경)` |

**`$RISK_LEVEL` default proposal:**

| Change scope | `$RISK_LEVEL` |
|---|---|
| Only `.claude/**`, `*.md`, `.gitignore`, CI config | `Low` |
| API/worker source touching public endpoints / message contracts | `Medium` |
| DB migration, dependency major bump, security-sensitive paths | `High` (ask only if execution needs an unsupported external/destructive action) |

**"검증" boxes:** propose checked **only** when there is evidence in this session (build/test ran, E2E ran). Otherwise leave unchecked and tell the user to verify before opening the MR. Do not auto-check on absence-of-failure.

**Outputs:** `$MR_BODY`, `$RISK_LEVEL`.

### 4.4 Create the MR

- `$TRANSPORT == glab`:

  ```bash
  glab mr create \
    --title "$MR_TITLE" \
    --description "$(cat <<'EOF'
  $MR_BODY
  EOF
  )" \
    --target-branch "$MR_TARGET" \
    --assignee "$MR_ASSIGNEE" \
    --reviewer "$MR_REVIEWERS" \
    --yes
  ```

- `$TRANSPORT == REST`: assignee/reviewer go in as **user IDs** (integers), not usernames. Resolve once via `GET /users?username=...`, then POST the MR. Build JSON with `jq` so Korean / quotes are escaped correctly:

  ```bash
  resolve_uid() {
    local u="$1"
    if [ "$u" = "@me" ]; then
      gitlab_api "https://$GITLAB_HOST/api/v4/user" | jq '.id'
    else
      gitlab_api "https://$GITLAB_HOST/api/v4/users?username=$u" | jq '.[0].id'
    fi
  }

  ASSIGNEE_ID=$(resolve_uid "$MR_ASSIGNEE")
  REVIEWER_IDS=$(printf '%s\n' "$MR_REVIEWERS" | tr ',' '\n' | while read -r u; do resolve_uid "$u"; done | jq -s '.')

  MR_BODY_FILE="$(mktemp "${TMPDIR:-/tmp}/vulpora-mr-body.XXXXXX")" || exit 1
  trap 'rm -f "$MR_BODY_FILE"' EXIT HUP INT TERM
  printf '%s' "$MR_BODY" > "$MR_BODY_FILE"
  jq -n \
    --arg src "$BRANCH_NAME" \
    --arg tgt "$MR_TARGET" \
    --arg title "$MR_TITLE" \
    --rawfile desc "$MR_BODY_FILE" \
    --argjson assignee "$ASSIGNEE_ID" \
    --argjson reviewers "$REVIEWER_IDS" \
    '{source_branch:$src, target_branch:$tgt, title:$title, description:$desc, assignee_id:$assignee, reviewer_ids:$reviewers, remove_source_branch:false, squash:false}' \
    | gitlab_api -X POST \
        --header "Content-Type: application/json" \
        --data @- \
        "https://$GITLAB_HOST/api/v4/projects/$PROJECT_ID/merge_requests"
  ```

  **Edge cases:**
  - `$MR_ASSIGNEE == empty` → omit `assignee_id` key entirely (glab: omit `--assignee`). Empty string MUST NOT be sent.
  - Multiple reviewers: glab comma-separated usernames; REST JSON array of integer user IDs in `reviewer_ids`.
  - `--draft` / `"draft":true` only when user explicitly requested.

- `$TRANSPORT == push-option`: MR is created as a side effect of §3.2 push. §4.2/§4.3 MUST have completed earlier. The push command carries the MR fields:

  ```bash
  git push -u origin "$BRANCH_NAME" \
    -o merge_request.create \
    -o merge_request.target="$MR_TARGET" \
    -o merge_request.title="$MR_TITLE" \
    -o merge_request.description="<single-line summary; multi-line not safe>" \
    -o merge_request.assign="$MR_ASSIGNEE" \
    -o merge_request.label="<optional,csv>"
  ```

  In this path the §4.3 template **cannot** be sent verbatim — send a single-line summary and tell the user the full template must be pasted in the browser. Reviewer must also be added afterwards (no push option exists for it).

### 4.5 Post-creation verification (MUST — all transports)

Output filters (RTK, custom shells) can swallow the MR URL printed by glab / REST / push response. **Always** re-query after creation to capture canonical `$MR_IID` and `$MR_URL`:

- `$TRANSPORT == glab`:

  ```bash
  glab mr list --source-branch "$BRANCH_NAME" --output json \
    | jq -r '.[0] | "\(.iid)\t\(.web_url)"'
  ```

- `$TRANSPORT == REST`:

  ```bash
  gitlab_api \
    "https://$GITLAB_HOST/api/v4/projects/$PROJECT_ID/merge_requests?source_branch=<encoded-branch>&state=opened&order_by=created_at&sort=desc" \
    | jq -r '.[0] | "\(.iid)\t\(.web_url)"'
  ```

- `$TRANSPORT == push-option` (no token, no glab): programmatic re-query is not possible. Build a deterministic search URL and report it:

  ```
  https://<gitlab-host>/<project-path>/-/merge_requests?source_branch=<url-encoded-branch>
  ```

  Build `<gitlab-host>`/`<project-path>` from `git remote get-url origin` (do not hardcode the instance). Tell the user explicitly that `$MR_IID`/`$MR_URL` were not captured locally and that the search URL is the only handle.

**Outputs:** `$MR_IID`, `$MR_URL` (or search URL fallback).

---

## 5. Stop conditions and safety (MUST)

- User interrupts → stop the current stage immediately and report the partial state (e.g., commit landed, push pending).
- Push fails (rejected, hook failure) → report `git`/`glab` output verbatim, do not retry automatically.
- `glab mr create` / REST POST fails (auth, target missing, template parsing, HTTP 401/403/404/409) → report error and HTTP status verbatim, do not retry without user instruction.
- Never run `git reset --hard`, `git checkout <file>` to discard, `git branch -D`, or `git push --force*` from this skill.

## 6. Final report format

```
✅ git-flow 완료
- Transport : $TRANSPORT
- 커밋     : <sha> "$COMMIT_MSG (subject)"
- 푸시     : $BRANCH_NAME → origin (commits ahead: <n>)
- MR       : !$MR_IID  $MR_URL
             target=$MR_TARGET  assignee=$MR_ASSIGNEE  reviewer=$MR_REVIEWERS
- 본문 슬롯 자동 채움: api=<bool>  worker=<bool>  modules=[..]  risk=$RISK_LEVEL
- 후처리 TODO:
  * ($TRANSPORT == push-option) 본문 체크박스 템플릿을 브라우저에서 채움
  * ($TRANSPORT == push-option) Reviewer를 MR 페이지에서 직접 추가
  * 검증 체크박스(로컬 빌드 / E2E / 수동) 미체크 항목 확인
```

If stopped early:

```
⏸ git-flow 중단 (단계: Pre-check | Commit | Push | MR)
- 완료한 작업    : <한 줄>
- 이유          : <한 줄>
- 다음 행동 후보 : <옵션 1>, <옵션 2>
```

## Checklist

- [ ] `$BRANCH_NAME` is not `master`/`develop`/`release-*`
- [ ] If working tree clean **and** branch in sync with origin → reported "변경 사항이 없습니다" and stopped (no automatic empty-commit fallback)
- [ ] `$TRANSPORT` bound in §1.3 **before Stage 2**; if `push-option`, all 4 limits explicitly acknowledged
- [ ] If `$TRANSPORT == push-option`: §4.2/§4.3 ran before §3.2, all `-o merge_request.*` flags attached, no after-the-fact `--allow-empty` retries
- [ ] No secret-file patterns in `$STAGED_FILES`
- [ ] `$STAGED_FILES` explicit (no `git add -A`)
- [ ] `$COMMIT_TYPE` chosen per §2.4 heuristic; `$COMMIT_MSG` matches `<type> : <한국어 메시지>` (space before colon)
- [ ] No `--amend`, `--no-verify`, `--force*` used without explicit user request
- [ ] Push succeeded; origin tracks `$BRANCH_NAME`
- [ ] `$MR_TARGET=develop`, `$MR_ASSIGNEE=@me`, `$MR_REVIEWERS=@me` applied unless explicitly overridden
- [ ] Large or multi-theme diffs were split into coherent commits, each verified and pushed before MR creation
- [ ] `@me` resolved per transport (not guessed from git config); push-option path asked the user directly
- [ ] `$MR_BODY` rendered from §4.3 slim template; checkboxes auto-filled per rules; `$RISK_LEVEL` set
- [ ] §4.5 re-query ran; final report carries canonical `$MR_IID` + `$MR_URL` (or, for push-option without token, the search URL)


## 리뷰 훅

- [ ] Root SKILL.md retains the routing and safety summary.
- [ ] This contract is read before detailed execution.
- [ ] Rule identifiers and stop conditions remain unchanged.
