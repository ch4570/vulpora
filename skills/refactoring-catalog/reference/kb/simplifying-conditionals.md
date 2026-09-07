---
title: 조건문 단순화 리팩터링 (Simplifying Conditional Logic)
source: Refactoring 2nd ed. (Fowler) ch.10 — https://martinfowler.com/books/refactoring.html
sources_extra:
  - https://refactoring.com/catalog/
last_fetched: 2026-06-24
skills: [refactoring-catalog]
---

# KB: 조건문 단순화 (Fowler ch.10)

> 복잡·중첩·중복 조건을 정리한다. 타입 분기는 다형성으로, null/특수값은 특수 케이스로.
> 예시는 Order, PaymentType, Member 등 중립 엔티티(Kotlin).

## 카탈로그 (이름 · 무엇을 / 언제 · 메커니즘 요약)
| 리팩터링 | 무엇을 / 언제 | 메커니즘(작은 단계) |
|----------|---------------|---------------------|
| **Decompose Conditional** | 복잡한 조건/분기 본문에 이름 부여 | 조건식을 함수로 추출 → then/else 본문을 각각 함수로 추출 → 의도 드러나는 이름 |
| **Consolidate Conditional Expression** | 결과가 같은 조건들이 흩어져 있을 때 합침 | 부수효과 없는지 확인 → `&&`/`||`로 결합 → 결합 조건을 함수로 추출 |
| **Replace Nested Conditional with Guard Clauses** | 정상/예외 흐름이 깊게 중첩 | 예외/경계 조건을 **이른 반환(guard)** 으로 먼저 처리 → 중첩 해소 → 정상 경로를 평탄하게 |
| **Replace Conditional with Polymorphism** | 타입에 따른 같은 분기가 반복 | 타입을 sealed/계층으로 모델링 → 각 분기 본문을 해당 타입 메서드로 Move → 호출부를 다형 호출로 → 남은 분기 제거 |
| **Introduce Special Case** | 특정 값(null/누락)에 대한 동일 처리가 흩어짐 | 특수 케이스 클래스/객체 생성(Null Object) → 공통 동작을 그 객체에 → 검사 코드를 특수 객체 사용으로 치환 |
| **Introduce Assertion** | 코드가 암묵 가정을 둘 때 명시 | 항상 참이어야 할 조건을 assert로 표현 → 가정을 문서화(동작은 불변) |
| **Replace Control Flag** | break/return 대신 쓰는 제어 플래그 변수 | 플래그 설정 지점을 break/return/Extract Function으로 대체 → 플래그 제거 |

## 적용 예 (Guard Clauses)
```kotlin
// before: 중첩
fun payAmount(member: Member): Money {
    var result: Money
    if (member.isActive) {
        if (!member.isSuspended) result = normalPay(member) else result = Money.ZERO
    } else result = Money.ZERO
    return result
}
// after: 이른 반환
fun payAmount(member: Member): Money {
    if (!member.isActive) return Money.ZERO
    if (member.isSuspended) return Money.ZERO
    return normalPay(member)
}
```

## 판단 포인트
- **Guard Clause vs 단일 출구**: Fowler는 예외/경계는 guard로 빼고 핵심 경로를 강조하는 쪽을 권장. "한 함수=한 return" 도그마보다 가독성 우선.
- **Replace Conditional with Polymorphism은 모든 분기에 쓰지 말 것.** 타입별로 동작이 다른 경우에만. 단순 분기는 오히려 다형성이 과설계(Speculative Generality).
- Introduce Special Case는 `if (x == null)` 검사가 **여러 곳에 중복**될 때 가치가 크다(Null Object 패턴).
- Consolidate는 조건들이 **같은 결과**일 때만. 결과가 다르면 합치면 안 된다.

## 리뷰 훅
- [ ] 조건식 자체가 복잡해 한눈에 의미를 모르는가(Decompose Conditional / Extract Variable).
- [ ] 서로 다른 조건이 결국 같은 결과로 가는가 → Consolidate Conditional Expression.
- [ ] if 중첩이 3단 이상이고 그중 일부가 예외/경계 처리인가(Guard Clauses로 평탄화).
- [ ] 같은 `when`/`switch` 타입 분기가 여러 함수에 복제됐는가(Replace Conditional with Polymorphism).
- [ ] null/누락값 검사가 여러 호출부에 중복되는가(Introduce Special Case / Null Object).
- [ ] 반복문에서 `found`/`done` 같은 제어 플래그를 쓰는가(Replace Control Flag → break/return).
- [ ] 암묵적 전제(절대 음수 아님 등)가 주석으로만 있는가(Introduce Assertion).
