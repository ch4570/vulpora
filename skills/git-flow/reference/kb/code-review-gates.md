---
title: 코드 리뷰 게이트 (승인/리뷰어)
source: https://docs.gitlab.com/user/project/merge_requests/reviews/
last_fetched: 2026-06-24
skills: [git-flow]
---

# KB: 코드 리뷰 게이트

> 근거: GitLab Docs "Merge request reviews"(위 source), "Merge request approvals"
> (https://docs.gitlab.com/user/project/merge_requests/approvals/).

## reviewer vs assignee
- **assignee**: MR의 작업/책임 주체.
- **reviewer**: 리뷰 요청 대상. 리뷰 상태(approved/requested changes)를 남긴다.
- 둘 다 git-flow에서 사용자 확정(기본 `@me`).

## 승인(approval) 규칙
- 프로젝트는 **필요 승인 수**, **승인 규칙(코드오너/특정 그룹)**, "작성자 본인 승인 금지" 등을 강제할 수 있다.
- 승인 규칙을 만족하지 못하면 머지 버튼이 비활성(머지 차단).
- CODEOWNERS가 설정된 경로를 건드리면 해당 오너의 승인이 요구될 수 있다.

## 리뷰가 막는 것
- 미해결 스레드(unresolved threads)가 있으면 "모든 스레드 해결" 설정 하에서 머지 차단.
- Draft/WIP 상태 MR은 머지 불가 → 준비되면 Draft 해제.

## git-flow 범위
- git-flow는 **MR 생성까지**. 리뷰 진행/승인/머지는 범위 밖(필요 시 `/ship` 안내).
- 단, MR 본문에 "리뷰어를 위한 가이드"(먼저 볼 파일, 관련 링크)를 채워 리뷰를 돕는다.

## 리뷰 훅
- [ ] reviewer가 지정됐는가(셀프 리뷰 `@me`라도 의도적이어야 함).
- [ ] CODEOWNERS/승인 규칙이 걸리는 경로를 건드렸다면 적절한 오너를 reviewer로 넣었는가.
- [ ] MR 본문에 "먼저 볼 파일 1–3개"와 관련 링크가 있는가.
- [ ] Draft가 의도된 게 아니라면 Draft로 만들지 않았는가.
