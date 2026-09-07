---
title: 패턴 오용 신호 (안티패턴 → 단순 대안)
source: refactoring.guru 각 패턴 "Relations/criticism" 섹션 + Martin Fowler "Yagni" https://martinfowler.com/bliki/Yagni.html
last_fetched: 2026-06-24
skills: [design-pattern-apply]
---

# KB: 패턴 오용 신호 (Over-engineering)

> 패턴 적용보다 **패턴 회피**가 정답인 경우가 더 많다. 이 파일은 흔한 오용 냄새와 그에 대한
> **더 단순한 대안**을 매핑한다. 원칙: *틀린 추상화는 중복보다 비싸다*(Fowler, repair cost).

## 오용 냄새 → 단순 대안 (핵심표)

| 오용 냄새 | 왜 문제인가 | 더 단순한 대안 |
|-----------|-------------|----------------|
| **패턴을 위한 패턴** (적용 자체가 목표) | 간접화 비용만 추가, 이득 없음 | 패턴 제거, 직접 코드 |
| **추측성 일반화**(speculative generality) | 안 올지 모를 미래에 비용 선지불 | YAGNI — 두 번째 케이스 도착 시 리팩터링 |
| **단일 구현 인터페이스+팩토리** | 구현 1개인데 추상층 2겹 | 구체 클래스 직접 사용, 필요해지면 추출 |
| **Singleton = 전역 가변 상태** | 숨은 결합, 테스트 격리 불가, 동시성 버그 | DI(생성자 주입) + 컨테이너 싱글톤 스코프 |
| **안정적 계층에 과한 Visitor**가 아니라 *불안정* 계층에 Visitor | 요소 추가마다 모든 Visitor 수정 | Kotlin `sealed` + exhaustive `when` |
| **변형 1개인데 Strategy/State** | 클래스만 늘고 분기 추적만 어려움 | `when` / `enum` 유지 |
| **Decorator 래핑 체인 남발** | 호출 흐름 추적 난해 | 조합이 소수면 단순 상속/직접 호출 |
| **다단계 위임만 하는 Facade/Proxy** | 부가가치 없이 한 겹 더 | 래퍼 제거 |
| **Template Method인데 재정의 스텝 없음** | 상속만 강요 | 람다/콜백(전략) 또는 함수 추출 |
| **God Mediator** | 중재자가 모든 로직 흡수 | 책임 재분배, 일부 직접 통신 |

## 상세 진단

### 1. 추측성 일반화 (Fowler "Yagni")
- *"presumptive feature를 미리 만들면 build/delay/carry/repair 4중 비용이 든다."*
- 신호: "나중에 결제수단/정책이 늘 수도 있으니" 같은 가정만으로 추상층을 깐다.
- 처방: **두 번째 변형이 실제로 도착**할 때 리팩터링으로 패턴을 사후 도입한다. 패턴은
  설계의 출발점이 아니라 리팩터링의 도착점이다.

### 2. 단일 구현 인터페이스 + 팩토리
- 신호: `interface FooService` + `FooServiceImpl`(유일) + `FooFactory`.
- 비용: 정의로 점프 시 항상 한 단계 우회, 변경 시 두 파일 동기화.
- 처방: 구체 클래스를 직접 쓰고, **두 번째 구현이 생기면** 그때 인터페이스 추출(IDE 자동).
  (테스트 더블이 필요한 경계라면 인터페이스가 정당화될 수 있으니 그 근거를 명시.)

### 3. Singleton을 전역 상태 보관소로
- 신호: `object Cache { var data = ... }` 처럼 가변 필드를 전역에서 공유.
- 처방: 의존성으로 **주입**한다. Spring이면 빈 스코프(싱글톤)가 생명주기를 관리하고,
  테스트에서 교체 가능해진다(`di-strategy-factory-spring.md`).

### 4. Visitor를 불안정한 계층에 적용
- Visitor의 트레이드오프: **연산 추가는 쉽고, 요소(타입) 추가는 비싸다**(모든 Visitor 수정).
- 신호: 도메인 타입이 자주 추가되는데 Visitor로 더블 디스패치를 구현.
- 처방: Kotlin `sealed interface` + `when`. 컴파일러가 누락 분기를 강제(exhaustive)하여
  Visitor의 안전성 이점은 얻고 보일러플레이트는 없앤다.

```kotlin
sealed interface Article
data class Notice(val title: String) : Article
data class Column(val body: String) : Article
fun summarize(a: Article) = when (a) {        // 새 타입 추가 시 컴파일 에러로 강제
    is Notice -> a.title
    is Column -> a.body.take(20)
}
```

### 5. 가장 싼 리팩터링부터
- 패턴 도입 전에 **Extract Function**, **명명 개선**, **중복 제거**, `when` 정리로 충분한지
  먼저 확인한다. 이것으로 냄새가 사라지면 패턴은 불필요하다.

## 리뷰 훅
- [ ] 도입하려는 패턴의 **변형/확장 축이 실재**하는가(과거 변경 또는 확정된 미래).
- [ ] 인터페이스/팩토리의 **구현이 둘 이상**인가, 아니면 테스트 더블 등 명시적 근거가 있는가.
- [ ] Singleton/`object`가 **전역 가변 상태**를 숨기지 않는가 → DI로 대체 가능한가.
- [ ] Visitor 대상 **계층이 안정적**인가(불안정하면 `sealed when`).
- [ ] Strategy/State가 변형 **1개에 과적용**되지 않았는가.
- [ ] Facade/Proxy/Decorator가 단순 위임을 넘어 **실제 가치**(복잡도 은닉·부가책임)를 주는가.
- [ ] 패턴 전에 Extract Function/`when` 정리 같은 **더 싼 처방**을 시도했는가.
