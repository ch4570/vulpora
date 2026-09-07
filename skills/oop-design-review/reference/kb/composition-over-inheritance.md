---
title: 상속보다 합성
source: GoF "Design Patterns"(1994) 서론 원칙 "Favor object composition over class inheritance" + Joshua Bloch, "Effective Java"(3rd ed.) Item 18
last_fetched: 2026-06-24
skills: [oop-design-review]
---

# KB: 상속보다 합성 (Composition over Inheritance)

GoF의 두 핵심 원칙 중 하나: **"클래스 상속보다 객체 합성을 선호하라."** 구현 상속은 캡슐화를
깨고 기반 클래스 변경에 취약하다(fragile base class). is-a가 진짜 성립할 때만 상속, 그 외엔 합성.

## 상속이 깨지는 지점
- **캡슐화 위반**: 하위 클래스가 상위 클래스의 **구현 세부에 의존**한다. 상위 클래스가 다음 릴리스에서
  내부 호출 방식을 바꾸면(자기-사용 self-use 패턴 변경) 하위 클래스가 조용히 깨진다(Bloch Item 18의 `InstrumentedHashSet` 사례).
- **fragile base class**: 기반 클래스 수정이 모든 하위 클래스에 예측 못 한 파급.
- **LSP 위반**: 하위 타입이 상위 계약을 못 지킴(`composition`으로 가야 할 신호 — `solid.md` LSP).
- **단일 상속 한계 / 조합 폭발**: 직교적 변형을 상속으로 표현하면 클래스 수가 곱셈으로 폭발.

## 합성 + 위임 (Forwarding)
- 새 클래스가 기존 클래스를 **private 필드로 보유(has-a)** 하고, 필요한 호출을 그 인스턴스로 **전달(forward)** 한다.
- 기존 클래스의 내부 구현 변경에 영향받지 않음(블랙박스 재사용). 데코레이터/전략 패턴의 토대.
```kotlin
// 상속(취약): class CountingList<E> : ArrayList<E>() { ... }  // ArrayList 내부 self-use에 의존
// 합성(견고):
class CountingList<E>(private val inner: MutableList<E> = mutableListOf()) : MutableList<E> by inner {
    var addCount = 0; private set
    override fun add(element: E): Boolean { addCount++; return inner.add(element) }
    override fun addAll(elements: Collection<E>): Boolean { addCount += elements.size; return inner.addAll(elements) }
}
```
> Kotlin의 `by` 위임은 forwarding 보일러플레이트를 언어 차원에서 제거한다.

## is-a vs has-a 판별
| 질문 | 상속 | 합성 |
|------|------|------|
| B가 정말 A의 **하위 유형**인가(모든 맥락에서 A로 대체 가능)? | 예 → 상속 후보 | 아니오 |
| "B는 A의 **기능을 사용/포함**한다"가 더 맞나? | | 예 → 합성 |
| A와 B가 **다른 패키지**고 A가 상속용으로 설계·문서화되었나? | 아니오면 상속 위험 | 합성 안전 |

- 상속을 쓸 거면 상위 클래스를 **상속용으로 설계·문서화**(self-use 패턴 문서화)하거나, 아니면 `final/sealed`로 막아라(Bloch Item 19).

## 리뷰 훅
- [ ] 상속 관계가 **진짜 is-a**인가(모든 맥락에서 상위 타입으로 치환 가능). 단지 코드 재사용 목적이 아닌가.
- [ ] 하위 클래스가 상위 클래스의 **구현 세부/self-use 패턴**에 의존하지 않는가(fragile base class).
- [ ] 구현 재사용이 목적이라면 **합성 + 위임(has-a)** 으로 바꿀 수 있는가(Kotlin `by`).
- [ ] 상속을 유지한다면 상위 클래스가 상속용으로 설계·문서화되었는가, 아니면 `final/sealed`로 봉인되었는가.
- [ ] 직교 변형을 상속으로 표현해 클래스 수가 곱셈 폭발하지 않는가 → 전략/데코레이터 합성.
- [ ] 상속으로 인한 LSP 위반 징후(오버라이드에서 예외/빈 구현)가 없는가.
