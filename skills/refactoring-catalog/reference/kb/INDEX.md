# 리팩터링 카탈로그 Knowledge Base — 색인 (INDEX)

> Martin Fowler 『Refactoring』(2nd ed.) 카탈로그와 코드 스멜을 distill한 인용 가능한 KB.
> 각 파일은 frontmatter에 `source`(책 장/공식 URL)·`last_fetched`·`skills`를 담는다.
> **사용법**: 작업 유형에 맞는 KB를 먼저 읽고, 그 "리뷰 훅"으로 점검하며, 지적할 때
> KB의 `source`(정본 카탈로그 이름)를 근거로 인용한다. (예: "Fowler ch.10 Replace Conditional with Polymorphism 기준 …")

## 작업 유형 → 읽을 KB
| 작업 유형 | 먼저 읽을 KB |
|-----------|--------------|
| 코드 냄새 탐지 / 무엇을 고칠지 판단 | [code-smells](code-smells.md) → 해당 처방 KB |
| 긴 함수·중복·임시변수 정리 | [composing-methods](composing-methods.md) |
| Feature Envy·반복문·죽은 코드, 책임 위치 이동 | [moving-features](moving-features.md) |
| 가변 데이터·기본형 집착·캡슐화·파생값 | [organizing-data](organizing-data.md) |
| 복잡/중첩 조건, 타입 분기, null 처리 | [simplifying-conditionals](simplifying-conditionals.md) |
| 리팩터링 안전성·절차·테스트 안전망·우선순위 | [refactoring-safety](refactoring-safety.md) |

## KB 한 줄 요약
| KB | 다룸 | source |
|----|------|--------|
| [code-smells](code-smells.md) | 스멜 분류(중복/긴 함수/Feature Envy/Primitive Obsession 등) → 처방 매핑표 | ch.3 + CodeSmell.html |
| [composing-methods](composing-methods.md) | Extract/Inline Function·Variable, Change Declaration, Split Phase, Replace Temp with Query, Combine into Class/Transform | ch.6 |
| [moving-features](moving-features.md) | Move Function/Field, Move/Slide Statements, Split Loop, Replace Loop with Pipeline, Remove Dead Code | ch.8 |
| [organizing-data](organizing-data.md) | Split Variable, Rename Field, Replace Primitive with Object, Replace Derived with Query, Reference↔Value, Encapsulate Variable/Record/Collection | ch.9 + ch.7 |
| [simplifying-conditionals](simplifying-conditionals.md) | Decompose/Consolidate Conditional, Guard Clauses, Polymorphism, Introduce Special Case/Assertion, Replace Control Flag | ch.10 |
| [refactoring-safety](refactoring-safety.md) | 정의, 두 모자, 작은 단계, 특성화 테스트, 빌드시스템 자동감지, 가치÷위험, 비-리팩터링 시점 | ch.1-2 + ch.4 |

## 원칙 문서와의 관계
- 상위 판단 원칙("왜·언제")은 `../principles.md`(헌법). KB는 그 원칙의 **카탈로그 사실·메커니즘 근거**("무엇을·어떻게").
- **충돌 시 KB(카탈로그 사실)가 principles를 이긴다.** principles는 책 기반 판단 통찰을 보탠다.

## 갱신 정책
- 각 파일 `last_fetched` 기준. 카탈로그 이름/메커니즘은 책 정본이므로 안정적 → 신판 출간 또는
  refactoring.com 카탈로그 변경 시 `source`를 다시 확인해 갱신.

## TODO (차기)
- 상속·API 리팩터링(Pull/Push, Extract Superclass, Replace Subclass with Delegate, Replace Inheritance with Delegation) 전용 KB.
- 대규모 리팩터링(Branch by Abstraction, Strangler Fig) KB.
- 언어별(Kotlin/Java) IDE 자동 리팩터링 매핑 표.
