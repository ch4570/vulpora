---
title: Versioned vs Repeatable 마이그레이션
source: https://documentation.red-gate.com/fd/migrations-184127470.html
last_fetched: 2026-06-24
skills: [flyway]
---

# KB: Versioned vs Repeatable

## 두 종류
| 종류 | prefix | 적용 시점 | 용도 |
|------|--------|-----------|------|
| **Versioned** | `V` | 버전 순으로 **딱 한 번** | DDL(테이블/컬럼/인덱스), 일회성 데이터 변경 |
| **Repeatable** | `R` (버전 없음) | 모든 versioned **이후**, 체크섬이 바뀌면 **재적용** | 뷰·함수·프로시저·시드 등 "최신 정의로 덮어쓰기" |

## 적용 순서
1. 미적용 versioned를 버전 오름차순으로 적용.
2. 그 다음 repeatable을 적용(파일이 바뀐 것만). repeatable끼리는 description 순.

## Versioned 규칙
- 한 번 적용되면 **불변**. 파일을 고치면 체크섬 불일치로 `validate` 실패.
- 같은 버전 번호 중복 금지.

## Repeatable 규칙
- 버전이 없으므로 순서 의존 로직을 넣지 말 것(항상 마지막에, 매번 덮어쓰기 가능해야).
- 본문은 `CREATE OR REPLACE ...`처럼 **재적용 안전**하게 작성.

## 선택 기준
- "한 번 일어나는 변화"(컬럼 추가) → Versioned.
- "정의를 계속 갱신"(뷰/함수) → Repeatable.

## 리뷰 훅
- [ ] 일회성 DDL을 `V`로, 재정의 객체(뷰/함수)를 `R`로 올바르게 분류했는가.
- [ ] 이미 적용된 `V` 파일을 수정하지 않았는가(새 버전으로 전진).
- [ ] `R` 본문이 `CREATE OR REPLACE` 등 재적용 안전한가.
- [ ] `R`에 순서 의존 로직이 없는가.
