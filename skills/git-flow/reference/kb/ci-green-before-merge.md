---
title: 머지 전 CI green
source: https://docs.gitlab.com/ci/pipelines/merge_request_pipelines/
last_fetched: 2026-06-24
skills: [git-flow]
---

# KB: 머지 전 CI green

> 근거: GitLab Docs "Merge request pipelines"(위 source), "Merge when pipeline succeeds"
> (https://docs.gitlab.com/user/project/merge_requests/merge_when_pipeline_succeeds/),
> "Merge methods"(https://docs.gitlab.com/user/project/merge_requests/methods/).

## 파이프라인 상태
- MR에는 파이프라인 상태(`pending`/`running`/`success`/`failed`)가 붙는다.
- 프로젝트가 **"Pipelines must succeed"**를 켜면 파이프라인 성공 전에는 머지 차단.
- "Merge when pipeline succeeds(MWPS)"로 성공 시 자동 머지를 예약할 수 있다.

## 로컬 검증 → CI 신뢰
- MR 본문 "검증" 체크박스는 **이 세션에서 실제로 실행된 증거**가 있을 때만 체크.
  로컬 빌드/테스트는 빌드시스템 자동감지로 실행(gradle/maven/npm/pnpm/yarn).
- "별일 없어 보임"으로 자동 체크 금지 — CI가 최종 게이트다.

## 빌드시스템 자동감지(로컬 사전 검증)
| 마커 | 빌드/테스트 |
|------|-------------|
| `gradlew`/`build.gradle(.kts)` | `./gradlew build` / `./gradlew test` |
| `pom.xml` | `mvn verify` |
| `package.json` (lock으로 PM 판별) | `<pm> run build` / `<pm> test` |

## 리뷰 훅
- [ ] MR 생성 후 파이프라인이 트리거됐고 상태를 확인할 수 있는가.
- [ ] "Pipelines must succeed"가 켜진 프로젝트면 머지 전 green을 기다리는가.
- [ ] "검증" 체크박스는 실제 실행 증거가 있을 때만 체크했는가.
- [ ] 로컬 사전 검증을 빌드시스템 자동감지로(특정 도구 고정 없이) 돌렸는가.
- [ ] 머지 자동화가 필요하면 MWPS를 안내했는가(머지 자체는 git-flow 범위 밖).
