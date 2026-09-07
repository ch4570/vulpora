---
title: 스킬 버전 관리 & 변경 관리
source: https://semver.org/
last_fetched: 2026-07-14
skills: [skill-updater]
---

# KB: 버전 관리 & 변경 관리

근거: Semantic Versioning 2.0.0(https://semver.org/) + Keep a Changelog 1.1.0
(https://keepachangelog.com/). 스킬에는 명시적 `version` 필드가 없을 수 있으나, **SemVer식 사고**로
변경의 파급도를 판단한다.

## SemVer식 변경 분류 (스킬에 적용)
| 등급 | 스킬에서의 의미 | 예 |
|------|----------------|-----|
| MAJOR (호환 파괴) | 호출 트리거/규칙 ID/계약 변경, 규칙 제거 | description 트리거 의미 변경, 규칙 ID 삭제 |
| MINOR (호환 추가) | 새 규칙·새 절차·새 KB 추가 | 새 체크 항목 추가 |
| PATCH (호환 수정) | 오타·문구 정리·예시 보정 | 문장 다듬기 |

> "호환 파괴"는 그 스킬을 신뢰하던 호출자/문서가 깨질 수 있는 변경을 뜻한다. 신중히 다룬다.

## 하위 호환 우선
- 가능하면 **추가(MINOR)** 로 해결한다. 기존 규칙 ID·트리거를 함부로 바꾸지 않는다.
- 규칙 ID는 안정적 식별자다. 의미를 바꾸려면 **새 ID 발급** 후 옛 ID를 deprecate.

## Deprecation(폐기) 절차
1. 규칙/절차를 **deprecated로 표시**(즉시 삭제 금지)하고 대체안을 명시.
2. 유예 기간 동안 양립.
3. 다음 호환 파괴 시점(MAJOR)에 제거.

## 변경 기록 (Keep a Changelog)
- 의미 있는 변경은 기록을 남긴다. 권장 카테고리: `Added / Changed / Deprecated / Removed / Fixed / Security`.
- 사람이 읽기 위한 것 — 커밋 덤프가 아니라 변경의 **의도와 영향**을 적는다.

```markdown
## [Unreleased]
### Changed
- order-export: description 트리거에 "back up" 추가(라우팅 개선).
### Deprecated
- 규칙 OE-3: OE-7로 대체 예정.
```

## 리뷰 게이트
- 호환 파괴(MAJOR) 변경은 **리뷰 필수**. 트리거/규칙 ID 변경은 단독 머지 금지.
- 변경이 manifest dependency, INDEX, eval, 사용자 inventory에 미치는 영향까지 같은 변경에서 반영한다.

## 리뷰 훅
- [ ] 이 변경의 등급(MAJOR/MINOR/PATCH)을 판정했는가.
- [ ] 트리거·규칙 ID·계약을 깨는가(깨면 리뷰 게이트 적용).
- [ ] 규칙 제거를 즉시 삭제가 아니라 deprecate→유예→제거로 처리했는가.
- [ ] 의미 있는 변경에 changelog/기록을 남겼는가.
- [ ] manifest·INDEX·eval·사용자 문서 영향까지 같은 변경에서 반영했는가.
