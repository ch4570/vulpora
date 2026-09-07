---
title: 브랜칭 모델 (master/develop/feature/release)
source: https://nvie.com/posts/a-successful-git-branching-model/
last_fetched: 2026-06-24
skills: [git-flow]
---

# KB: 브랜칭 모델

> 근거: Vincent Driessen, "A successful Git branching model"(git-flow). 보조: GitLab Docs
> "Protected branches" (https://docs.gitlab.com/user/project/protected_branches/).

## 브랜치 역할
| 브랜치 | 성격 | 직접 커밋 |
|--------|------|-----------|
| `master`(또는 `main`) | 항상 배포 가능 상태. 릴리스 = 태그 지점 | **금지(보호)** |
| `develop` | 다음 릴리스 통합 브랜치. feature가 모이는 곳 | **금지(보호)** |
| `feature/*` | 단일 기능 개발. `develop`에서 분기, `develop`로 머지 | 허용 |
| `release-*` | 릴리스 안정화(버그픽스·메타). `develop`에서 분기, `master`+`develop`로 머지 | 제한 |
| `hotfix/*` | 운영 긴급 수정. `master`에서 분기, `master`+`develop`로 머지 | 제한 |

## 흐름
- 기능: `develop` → `feature/x` → (MR) → `develop`.
- 릴리스: `develop` → `release-1.2` → 안정화 → `master`(태그) + `develop` 역머지.
- 핫픽스: `master` → `hotfix/x` → `master`(태그) + `develop`.

## 작업 시작 시 base 선택과 최신화

- 사용자가 target branch를 지정하지 않으면 `$BASE_BRANCH=develop`이다.
- 사용자가 target branch를 지정하면 그 값을 `$BASE_BRANCH`와 이후 MR target으로 사용한다.
- 구현 전에 origin의 exact base ref를 fetch하고 로컬 base를 fast-forward-only로 최신화한다.
- 로컬 base가 없으면 `origin/$BASE_BRANCH`를 추적하는 로컬 브랜치를 만든다.
- dirty working tree, 존재하지 않는 base, fast-forward할 수 없는 divergence는 자동 stash/reset/rebase/merge로
  해결하지 않는다. 기존 상태를 보존하고 중단한다.
- 최신 base에서 작업 종류와 저장소 관례에 맞는 하위 브랜치를 만든 뒤에만 파일을 수정한다.
- 보호 브랜치는 base로 잠시 checkout할 수 있지만 구현 commit과 push는 하위 작업 브랜치에서만 한다.

## 보호 브랜치 (GitLab)
- 보호 브랜치는 직접 push가 차단되고, 변경은 **MR을 통해서만** 들어간다.
- "Allowed to merge / Allowed to push" 권한을 분리해 리뷰·CI 게이트를 강제할 수 있다.

## 리뷰 훅
- [ ] 사용자 target override가 없을 때 base가 `develop`인가.
- [ ] target override가 있을 때 해당 branch를 최신화하고 그 하위 branch를 만들었는가.
- [ ] base 최신화가 fetch + fast-forward-only로 수행되었고 기존 변경을 stash/reset/rebase하지 않았는가.
- [ ] 작업 브랜치가 보호 브랜치(`master`/`develop`/`release-*`)가 **아니다**. 맞다면 git-flow 중단.
- [ ] feature 브랜치는 `develop`에서 분기했고 MR 타깃도 `develop`인가(릴리스/핫픽스는 예외).
- [ ] 브랜치 이름이 의도(`feature/`·`hotfix/`·`release-`)를 드러내는가.
- [ ] 보호 브랜치에 직접 push를 시도하지 않았는가(MR 경유).
