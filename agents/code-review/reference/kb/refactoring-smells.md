---
title: 리팩터링 · 코드 스멜 (Martin Fowler)
source: https://refactoring.com/catalog/
sources_extra:
  - https://martinfowler.com/bliki/CodeSmell.html
  - https://martinfowler.com/books/refactoring.html
  - https://martinfowler.com/bliki/TwoHardThings.html
  - https://martinfowler.com/bliki/FunctionLength.html
versions: Refactoring 2nd ed. (Fowler)
last_fetched: 2026-06-22
consumers: [kotlin-spring-reviewer]
---

# KB: 리팩터링 · 코드 스멜 (Fowler)

## 리뷰 훅
- [ ] **중복 코드(Duplicated Code)** — 같은 구조가 반복되는가 → Extract Function/Class.
- [ ] **긴 함수(Long Function)/긴 매개변수(Long Parameter List)** — 한 가지 일만 하는가 → Extract, Parameter Object.
- [ ] **큰 클래스(Large Class)** — 책임이 여럿인가(SRP) → Extract Class.
- [ ] **Feature Envy** — 한 메서드가 다른 객체의 데이터를 과도하게 쓰는가 → Move Function.
- [ ] **Data Class/Primitive Obsession** — 의미 있는 개념이 원시 타입으로 흩어졌는가 → Value Object.
- [ ] **Shotgun Surgery / Divergent Change** — 한 변경이 여러 곳을 건드리거나 한 클래스가 여러 이유로 바뀌는가.
- [ ] 네이밍이 의도를 드러내는가(Two Hard Things — 캐시 무효화와 **네이밍**).

## 근거 (Fowler 요지)
- **리팩터링 정의**: 겉보기 동작을 바꾸지 않고 내부 구조를 개선하는 작은 단계의 연속. **테스트가 안전망** — 테스트 없이 대규모 리팩터링 금지. (books/refactoring)
- **Code Smell**: 더 깊은 문제를 가리키는 표면 신호. smell 자체가 버그는 아니지만 "여기를 보라"는 휴리스틱. (bliki/CodeSmell)
- **함수 길이**: 길이보다 **"의도와 구현의 분리"** 가 기준 — 이름이 무엇을, 본문이 어떻게. 짧고 잘 명명된 함수가 가독성을 높인다. (bliki/FunctionLength)
- 리팩터링 카탈로그(Extract Function, Move Function, Replace Conditional with Polymorphism 등)를 처방으로 인용. (refactoring.com/catalog)

## 인용 시
"Fowler `Code Smell`(Duplicated Code) → Extract Function" / "`Refactoring` 카탈로그 Replace Conditional with Polymorphism" 식으로.

## 보조
- 책 기반 세부(Clean Code 장별)는 스킬 내부 `references/clean-code.md` 병용.
