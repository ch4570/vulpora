---
title: glab MR 워크플로 (생성/탐색/assignee·reviewer)
source: https://gitlab.com/gitlab-org/cli
last_fetched: 2026-06-24
skills: [git-flow]
---

# KB: glab MR 워크플로

> 근거: glab(GitLab CLI) 문서, GitLab REST API "Merge requests"
> (https://docs.gitlab.com/api/merge_requests/), "Push options"
> (https://docs.gitlab.com/topics/git/commit/#push-options).

## 전송 방식 우선순위 (인스턴스 비종속)
1. **glab**(선호): `glab --version` + `glab auth status`가 활성 토큰. 평범한 `git push`.
2. **REST**(폴백): env `GITLAB_TOKEN`(api scope). 평범한 `git push`.
3. **push-option**(최후): 위 둘 실패 + 사용자가 4개 한계 수용. push에 `-o merge_request.*` 부착.

> 호스트·사용자명을 **하드코딩하지 않는다.** 호스트는 `git remote get-url origin`에서 유도,
> 사용자는 인증 컨텍스트(`@me`)로 해석.

## 생성 (glab)
```bash
glab mr create --title "<title>" --description "<body>" \
  --target-branch "<target>" --assignee "<user>" --reviewer "<a,b>" --yes
```

## `@me` 해석 (이메일 추측 금지)
| 전송 | 해석 |
|------|------|
| glab | `glab api /user` → `.username` |
| REST | `GET /api/v4/user` (PRIVATE-TOKEN) → `.username` (POST 시엔 user **ID** 필요: `/users?username=`) |
| push-option | 토큰·glab 없음 → **사용자에게 직접 질의** |

## push-option 한계 (수용 전 명시)
1. **reviewer 지정 불가**(push option 없음 → 사후 추가).
2. description 사실상 **단일 라인**(셸 quoting으로 멀티라인 템플릿 깨짐).
3. **ref 업데이트 push에만** 적용(up-to-date면 옵션이 조용히 버려짐).
4. 응답 URL 라인이 출력 필터에 삼켜질 수 있음 → 사후 재조회 필수.

## 사후 검증 (모든 전송)
- 생성 후 source-branch로 재조회해 정식 `iid`/`web_url`을 캡처(출력 필터 대비).

## 리뷰 훅
- [ ] `$TRANSPORT`를 우선순위대로 바인딩했고 묵시적 강등이 없는가.
- [ ] 호스트/사용자명을 하드코딩하지 않고 origin·인증 컨텍스트에서 유도했는가.
- [ ] assignee/reviewer override가 없으면 `@me`를 적용했고, 이메일로 추측하지 않았는가.
- [ ] REST면 reviewer를 **user ID 배열**로, glab이면 콤마 username으로 전달했는가.
- [ ] push-option이면 4개 한계를 사용자가 수용했고, MR 필드가 push **이전에** 준비됐는가.
- [ ] 생성 후 재조회로 iid/url을 확보했는가.
