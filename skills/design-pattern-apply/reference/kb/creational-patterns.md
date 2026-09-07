---
title: 생성 패턴 (Creational)
source: 'GoF "Design Patterns: Elements of Reusable OO Software" (Creational ch.) + https://refactoring.guru/design-patterns/creational-patterns'
last_fetched: 2026-06-24
skills: [design-pattern-apply]
---

# KB: 생성 패턴 (Creational)

> 생성 패턴은 **객체 생성 로직을 캡슐화**해 클라이언트가 구체 클래스에 직접 의존(`new`)하지
> 않게 한다. 핵심 효용은 "무엇을 만드는가"와 "어떻게 쓰는가"의 분리.

## 패턴 요약표

| 패턴 | 의도(1줄) | 적용 신호 | 오용/과설계 신호 |
|------|-----------|-----------|------------------|
| **Factory Method** | 생성할 구체 타입 결정을 서브클래스/메서드에 위임 | 생성 분기가 호출부에 흩어짐, 타입군이 확장됨 | 구현이 하나뿐인데 팩토리 계층 도입 |
| **Abstract Factory** | 관련 객체 *제품군* 을 함께 생성 | 일관된 변형 묶음(테마/플랫폼)이 여럿 | 제품군이 하나뿐, 변형축이 없음 |
| **Builder** | 복잡한 객체를 단계적으로 조립 | 생성자 파라미터 폭증, 선택 필드 다수 | 필드 2~3개를 빌더로 감쌈 |
| **Prototype** | 기존 인스턴스 복제로 생성 | 생성 비용이 크거나 런타임 구성 복제 필요 | 단순 객체에 clone 도입 |
| **Singleton** | 인스턴스 1개 보장 + 전역 접근점 | 진짜 단일 자원(설정 레지스트리 등) | 전역 가변 상태 은닉, DI로 대체 가능 |

## Factory Method
- **의도**: 객체를 만들되, 어떤 구체 클래스를 만들지는 분리된 생성 지점이 결정한다.
- **적용 신호**: `when(type) { PaymentType.CARD -> CardPayment() ... }` 같은 생성 분기가
  여러 곳에 복붙되어 신규 타입 추가 시 전부 고쳐야 한다.
- **오용 신호**: 구현이 하나뿐인데 인터페이스+팩토리만 늘림(→ `pattern-misuse-signals.md`).

```kotlin
interface Payment { fun pay(amount: Money) }
object PaymentFactory {
    fun create(type: PaymentType): Payment = when (type) {
        PaymentType.CARD -> CardPayment()
        PaymentType.POINT -> PointPayment()
    }
}
```
> Kotlin에서는 `sealed` + `when` 으로 충분한 경우가 많다. 생성 로직에 의존성 주입/설정이
> 끼면 그때 팩토리(또는 Spring `@Bean`)로 승격한다.

## Abstract Factory
- **의도**: 서로 **호환되어야 하는 객체들의 묶음**(제품군)을 일관되게 생성.
- **적용 신호**: "OS별 위젯 세트", "테마별 UI 컴포넌트 세트"처럼 변형이 *세트 단위* 로 바뀜.
- **오용 신호**: 제품이 한 종류이거나 변형축이 단 하나면 Factory Method로 충분.

## Builder
- **의도**: 동일한 생성 절차로 서로 다른 표현을 만들고, **불변 객체를 안전하게 조립**.
- **적용 신호**: 생성자 인자가 많고(텔레스코핑 생성자), 선택적/순서 무관 필드가 많다.
- **오용 신호**: 필드 소수 + 모두 필수면 일반 생성자/`data class`가 명확하다.
- Kotlin은 **named/default 인자**가 빌더 상당수를 대체한다. 불변 + 검증 로직이 클 때만 빌더.

```java
Order order = Order.builder()
    .memberId(id).addLine(productId, qty)
    .discountPolicy(DiscountPolicy.NONE)
    .build(); // build() 안에서 불변식 검증
```

## Prototype
- **의도**: 클래스가 아니라 **프로토타입 인스턴스를 복제**해 새 객체를 만든다.
- **적용 신호**: 객체 초기화 비용이 크거나, 런타임에 구성된 인스턴스를 그대로 여러 벌 필요.
- **오용 신호**: 단순 생성으로 충분한 객체에 clone 도입(얕은/깊은 복사 버그 위험만 추가).
- 깊은 복사 vs 얕은 복사 구분을 반드시 문서화한다(공유 참조 변형은 흔한 버그).

## Singleton
- **의도**: 인스턴스가 정확히 하나임을 보장하고 전역 접근점을 제공.
- **적용 신호**: 본질적으로 하나여야 하는 자원(전역 설정 레지스트리, ID 생성기).
- **오용 신호(중요)**: 사실상 **전역 가변 상태**를 숨기는 도구로 전락 → 테스트 격리 불가,
  숨은 결합, 동시성 버그. refactoring.guru도 안티패턴 논쟁을 명시한다.
- **현대 처방**: Spring 환경에서는 직접 구현하지 말고 **컨테이너 싱글톤 스코프 + 생성자
  주입**으로 대체한다(상세: `di-strategy-factory-spring.md`). Kotlin은 `object` 가 언어 차원
  싱글톤이지만, 가변 상태를 담으면 같은 함정에 빠진다.

## 리뷰 훅
- [ ] 생성 분기(`new`/`when`)가 호출부에 **흩어져** 있는가 → Factory 후보.
- [ ] 도입하려는 팩토리/인터페이스의 **구현이 둘 이상 실재**하는가(아니면 YAGNI).
- [ ] Builder를 쓰는데 필드가 소수 + 전부 필수는 아닌가(named 인자로 충분?).
- [ ] Prototype의 복사 깊이(얕은/깊은)와 공유 참조 위험이 문서화됐는가.
- [ ] Singleton이 **전역 가변 상태**를 숨기지 않는가, DI(컨테이너 스코프)로 대체 가능한가.
- [ ] 제품군 변형축이 실재하지 않는데 Abstract Factory를 쓰지 않는가.
