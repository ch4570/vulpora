---
title: 리팩터링 카탈로그 · 코드 스멜 (Martin Fowler)
source: https://refactoring.com/catalog/
sources_extra:
  - https://martinfowler.com/bliki/CodeSmell.html
  - https://martinfowler.com/books/refactoring.html
  - https://martinfowler.com/bliki/FunctionLength.html
versions: Refactoring 2nd ed. (Fowler)
last_fetched: 2026-06-22
consumers: [code-refactor-agent]
---

# KB: 리팩터링 카탈로그 · 코드 스멜 (Fowler)

## 리뷰 훅
- [ ] **중복 코드(Duplicated Code)** → **Extract Function** / Pull Up Method / 공통화.
- [ ] **긴 함수(Long Function)** → **Extract Function**(질의/명령 분리), Replace Temp with Query.
- [ ] **긴 매개변수 목록(Long Parameter List)** → **Introduce Parameter Object** / Preserve Whole Object.
- [ ] **큰 클래스(Large Class)** — 책임이 여럿(SRP) → **Extract Class** / Extract Subclass.
- [ ] **기능 욕심(Feature Envy)** — 남의 데이터를 과하게 씀 → **Move Function** / Move Field.
- [ ] **데이터 뭉치(Data Clumps)** · **기본형 집착(Primitive Obsession)** → **Replace Primitive with Object**(Value Object).
- [ ] **반복되는 switch/조건문(Repeated Switches)** → **Replace Conditional with Polymorphism**.
- [ ] **산탄총 수술(Shotgun Surgery)** — 한 변경이 여러 곳을 건드림 → **Move**로 한곳에 모음.
- [ ] **확산적 변경(Divergent Change)** — 한 클래스가 여러 이유로 바뀜 → 책임별 **Extract Class**.
- [ ] **임시 필드 / 메시지 체인 / 중개자(Middle Man)** → Hide Delegate / Remove Middle Man.
- [ ] **주석(Comments)** — 설명이 필요하면 먼저 **Extract Function + 의도 드러내는 이름**.

## 핵심 카탈로그 (처방 시 이름으로 인용)
- **Extract Function / Inline Function** — 의도(이름)와 구현(본문)을 분리/통합.
- **Extract Variable / Inline Variable** — 복잡한 식에 설명적 이름 부여.
- **Change Function Declaration** — 이름·매개변수 개선(작은 단계로 시그니처 변경).
- **Move Function / Move Field** — 책임이 있어야 할 곳으로 이동(Feature Envy 해소).
- **Replace Conditional with Polymorphism** — 타입 분기 → 다형성(sealed/전략).
- **Replace Primitive with Object / Introduce Parameter Object** — 의미를 타입으로.
- **Decompose Conditional / Consolidate Conditional Expression** — 복잡 조건 정리.
- **Replace Nested Conditional with Guard Clauses** — 중첩 → 이른 반환(early return).
- **Separate Query from Modifier** — 질의와 부수효과(명령) 분리.

## 근거 (Fowler 요지)
- **리팩터링 정의**: 겉보기 동작을 바꾸지 않고 내부 구조를 개선하는 작은 단계의 연속. **테스트가 안전망** — 테스트 없는 대규모 리팩터링 금지.
- **Code Smell**: 더 깊은 문제를 가리키는 표면 신호. 스멜 자체가 버그는 아니지만 "여기를 보라"는 휴리스틱.
- **함수 길이**: 길이보다 **"의도와 구현의 분리"**가 기준 — 짧고 잘 명명된 함수가 가독성을 높인다.

## 인용 시
"Fowler `Duplicated Code` → Extract Function" / "`Refactoring` 카탈로그 Replace Conditional with Polymorphism" 식으로.

## 적용 순서 (작은 단계 예: Replace Conditional with Polymorphism)
1. 분기되는 타입을 **sealed class/interface**로 모델링(또는 전략 인터페이스 도입).
2. 각 분기 본문을 해당 구현 타입의 메서드로 **Move**(한 케이스씩, 매번 테스트).
3. 호출부의 `when`을 **다형 호출**로 치환, 남은 `when`은 `else` 제거로 망라성 확보.
