---
title: 코드 스멜 분류 → 처방 카탈로그
source: Refactoring 2nd ed. (Fowler) ch.3 — https://martinfowler.com/books/refactoring.html
sources_extra:
  - https://refactoring.com/catalog/
  - https://martinfowler.com/bliki/CodeSmell.html
last_fetched: 2026-06-24
skills: [refactoring-catalog]
---

# KB: 코드 스멜 분류 → 처방 (Fowler ch.3)

> 스멜은 "더 깊은 문제일 수 있으니 여기를 보라"는 표면 신호다(휴리스틱). 각 스멜을
> **카탈로그 리팩터링 이름**으로 처방한다. 인용은 `Fowler ch.3 <스멜>` 형식.

## 스멜 → 처방 매핑 (정본 카탈로그 이름)
| 스멜 | 신호 | 처방 리팩터링 |
|------|------|----------------|
| Mysterious Name | 이름이 의도를 못 드러냄 | Rename Variable/Field, Change Function Declaration |
| Duplicated Code | 같은 구조가 여러 곳 | Extract Function, Slide Statements, Pull Up Method |
| Long Function | 함수가 길고 의도 불명 | Extract Function, Replace Temp with Query, Decompose Conditional |
| Long Parameter List | 매개변수 과다 | Introduce Parameter Object, Preserve Whole Object, Replace Parameter with Query |
| Global Data | 어디서든 변경 가능 | Encapsulate Variable |
| Mutable Data | 갱신이 추적 불가 | Encapsulate Variable, Split Variable, Replace Derived Variable with Query, Combine Functions into Transform |
| Divergent Change | 한 모듈이 여러 이유로 바뀜 | Split Phase, Extract Class, Move Function |
| Shotgun Surgery | 한 변경이 여러 모듈에 흩어짐 | Move Function/Field, Combine Functions into Class/Module, Inline (한곳에 모음) |
| Feature Envy | 남 데이터를 과하게 씀 | Move Function, Extract Function |
| Data Clumps | 늘 함께 다니는 값 묶음 | Extract Class, Introduce Parameter Object, Preserve Whole Object |
| Primitive Obsession | 원시 타입으로 도메인 표현 | Replace Primitive with Object, Replace Type Code with Subclasses, Replace Conditional with Polymorphism |
| Repeated Switches | 같은 분기가 곳곳에 | Replace Conditional with Polymorphism |
| Loops | 의도가 안 드러나는 반복 | Replace Loop with Pipeline |
| Lazy Element | 가치 없는 클래스/함수 | Inline Function, Inline Class, Collapse Hierarchy |
| Speculative Generality | "혹시 몰라서" 만든 추상 | Collapse Hierarchy, Inline Function/Class, Change Function Declaration, Remove Dead Code |
| Temporary Field | 가끔만 채워지는 필드 | Extract Class, Move Function, Introduce Special Case |
| Message Chains | `a.b().c().d()` 연쇄 | Hide Delegate, Extract Function + Move Function |
| Middle Man | 위임만 하는 객체 | Remove Middle Man, Inline Function |
| Insider Trading | 모듈 간 과도한 결탁 | Move Function/Field, Hide Delegate, Replace Subclass with Delegate |
| Large Class | 책임·필드 과다(SRP 위반) | Extract Class, Extract Superclass, Replace Type Code with Subclasses |
| Alternative Classes w/ Different Interfaces | 유사 클래스 인터페이스 불일치 | Change Function Declaration, Move Function, Extract Superclass |
| Data Class | 데이터만 있고 행위 없음 | Move Function, Encapsulate Record, 행위를 데이터 곁으로 |
| Refused Bequest | 서브클래스가 상속을 거부 | Push Down Method/Field, Replace Subclass with Delegate |
| Comments | 주석이 나쁜 코드를 변명 | Extract Function, Rename, Introduce Assertion (먼저 코드로 설명) |

## 판단 포인트
- **Divergent Change(한 모듈이 여러 이유로 변경) ↔ Shotgun Surgery(한 변경이 여러 모듈에 분산)** 는
  반대 증상이다. 전자는 쪼개고, 후자는 모은다.
- Feature Envy와 Inappropriate Intimacy(Insider Trading)는 "데이터와 행위가 떨어져 있다"는 같은 뿌리.
- Comments 스멜: 좋은 주석(왜)을 지우라는 게 아니라, **나쁜 코드를 설명하려는** 주석을 먼저 코드로 흡수하라는 뜻.

## 리뷰 훅
- [ ] 같은 코드 구조가 2곳 이상 반복되는가 → Extract Function 후보인가.
- [ ] 함수가 화면 한 눈을 넘고 의도/구현이 안 분리됐는가(Long Function).
- [ ] 매개변수가 3~4개를 넘거나 늘 함께 다니는 값 묶음(Data Clumps)이 있는가.
- [ ] 메서드가 자기 클래스보다 **남의 클래스 데이터**를 더 많이 쓰는가(Feature Envy).
- [ ] 동일한 `when`/`switch` 분기가 여러 곳에 복제됐는가(Repeated Switches → 다형성).
- [ ] 금액/식별자/코드값을 String·Int 원시형으로만 다루는가(Primitive Obsession).
- [ ] 한 변경 요청이 여러 파일을 흩뿌려 건드리는가(Shotgun Surgery).
- [ ] 주석이 "이게 뭐 하는 코드인지" 변명하고 있는가 → 이름/추출로 흡수 가능한가.
