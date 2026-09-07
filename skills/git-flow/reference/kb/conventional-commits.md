---
title: Conventional Commits (커밋 메시지 규약)
source: https://www.conventionalcommits.org/en/v1.0.0/
last_fetched: 2026-06-24
skills: [git-flow]
---

# KB: Conventional Commits 1.0.0

## 구조
```
<type>[optional scope][!] : <description>

[optional body]

[optional footer(s)]
```
- 본 저장소 하우스 스타일: **콜론 앞 공백 1칸** (`feat : ...`). 설명은 한국어.

## type (행동 성격)
| type | 의미 | SemVer |
|------|------|--------|
| `feat` | 새 기능(공개 surface 추가) | MINOR |
| `fix` | 버그 수정 | PATCH |
| `refactor` | 동작 보존 구조 변경 | — |
| `perf` | 성능 개선 | — (PATCH 취급 가능) |
| `docs` | 문서/주석만 | — |
| `test` | 테스트만 | — |
| `chore` | 빌드/메타/도구 등 | — |
| `ci` | CI 설정만 | — |

## 파괴적 변경 (BREAKING CHANGE)
- type 뒤 `!` (`feat! : ...`) **또는** 푸터 `BREAKING CHANGE: <설명>`.
- 어느 쪽이든 SemVer **MAJOR**에 대응. 둘은 함께 써도 된다.

## scope
- 영향 범위를 괄호로(`feat(parser) : ...`). 선택. 본 저장소는 모듈/영역 이름을 권장.

## 규칙(스펙 요지)
- type/description은 필수. type은 명사, description은 변경 요약.
- 본문은 빈 줄 뒤 자유 서술("왜"). 푸터는 `토큰: 값` 또는 `토큰 #값`.
- `BREAKING CHANGE`는 대문자 고정. 다른 푸터 토큰은 `-`로 연결(`Reviewed-by`).

## 리뷰 훅
- [ ] 메시지가 `<type> : <설명>` 형식이고 type이 표의 허용값인가.
- [ ] type이 diff의 가장 큰 행동 영향을 반영하는가(여러 테마면 강한 것 선택).
- [ ] 파괴적 변경이면 `!` 또는 `BREAKING CHANGE:` 푸터가 있는가.
- [ ] 본문이 "왜"를 설명하는가(무엇은 diff가 말함). 한국어인가.
- [ ] 콜론 앞 공백 1칸 하우스 스타일을 지켰는가.
