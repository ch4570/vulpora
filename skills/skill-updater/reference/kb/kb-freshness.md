---
title: 스킬 KB 신선도 유지
source: ../../../../STANDARD.md
last_fetched: 2026-07-14
skills: [skill-updater]
---

# KB: 스킬 reference KB 신선도 유지

근거: 이 저장소 `STANDARD.md`(§2 KB frontmatter·INDEX 규약, "갱신" 정책) + Diátaxis 레퍼런스
유형(https://diataxis.fr/). 공식 소스 재확인은 각 KB의 `source` URL을 기준으로 한다.

## frontmatter 신선도 추적
- 모든 KB는 `source`(근거 URL)와 `last_fetched`(YYYY-MM-DD)를 가진다.
- `last_fetched`는 source를 마지막으로 가져온 날짜다. 내용이 정확하거나 현재 적용 version에
  유효하다고 검증한 날짜로 해석하지 않는다.
- 검증 증거는 metadata v2의 `last_verified`, `verified_by`, source version/locator, `status`,
  `evals`, `revalidate_on`으로 분리한다. schema/linter 도입 전에는 해당 정보를 본문이나 PR
  evidence에 남긴다.

## 재-fetch 케이던스(주기)
| 트리거 | 행동 |
|--------|------|
| 대상 표준/문서의 메이저 개정 | `source`를 다시 fetch → 본문 갱신 → `last_fetched` 갱신 → 별도 검증. |
| 기술 스택 메이저 업그레이드 | 영향받는 KB를 새 적용 version에서 재검증. |
| 정기 점검(낡음 의심) | 오래된 fetch와 verification을 구분해 우선순위를 정한다. |

> 단정은 항상 `source`에 근거한다. 근거 없는 주장은 KB에 넣지 않는다.

## 낡은 KB 처리
- 틀렸거나 더는 유효하지 않은 KB는 방치보다 **삭제·교체**가 낫다(낡은 정보가 오답을 유도).
- 삭제 시 `INDEX.md`의 해당 행도 같은 변경에서 제거(파생물 동기화).

## INDEX 유지
- `INDEX.md`는 "작업유형→KB" 표 + 각 KB 한 줄 요약 + principles 관계 + 갱신/TODO를 담는다.
- KB 추가/삭제/개명 시 INDEX를 같은 변경에서 갱신해 실제 파일과 일치시킨다.

## `## 리뷰 훅` 의무
- 모든 KB 파일은 점검 가능하도록 **반드시 `## 리뷰 훅`** 체크리스트 섹션을 포함한다(이 저장소 규약).
- 리뷰 훅 없는 KB는 미완성으로 간주한다.

## 리뷰 훅
- [ ] 모든 KB에 `source`와 `last_fetched`가 있는가.
- [ ] 본문 단정이 `source`에 실제로 근거하는가(추측 없음).
- [ ] `last_fetched`를 검증일로 오해하지 않고 검증자·version·status를 별도로 남겼는가.
- [ ] 대상 소스 개정/스택 업그레이드 시 재-fetch 후 별도 재검증했는가.
- [ ] 낡거나 틀린 KB를 삭제·교체하고 INDEX 행도 함께 정리했는가.
- [ ] 모든 KB가 `## 리뷰 훅` 섹션을 포함하는가.
- [ ] INDEX 표가 실제 KB 파일 목록과 일치하는가.
