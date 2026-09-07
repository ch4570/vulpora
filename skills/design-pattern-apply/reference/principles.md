# 디자인 패턴 적용 원칙 (Principles)

> 이 문서는 GoF와 refactoring.guru의 정전(canonical) 정의, Martin Fowler의 설계 통찰을
> 기반으로 한 **패턴 적용 판단 기준**이다. 에이전트와 스킬이 "이 패턴을 지금 도입할 것인가"를
> 판단하는 헌법 역할을 한다. 세부 사실·규칙은 `kb/` 각 파일에 있다.
>
> **출처(Sources)**
> - GoF, 『Design Patterns: Elements of Reusable Object-Oriented Software』(Addison-Wesley, 1994)
> - refactoring.guru, Design Patterns 카탈로그 — https://refactoring.guru/design-patterns
> - Martin Fowler, "Yagni" — https://martinfowler.com/bliki/Yagni.html
> - Martin Fowler, "Refactoring" 2nd ed. (냄새→리팩터링 매핑)
> - Spring Framework Reference, Core/IoC Container — https://docs.spring.io/spring-framework/reference/core/beans.html
>
> 예시 코드는 모두 **중립 도메인**(Order, Member, Article, Product, Money, DiscountPolicy,
> PaymentType 등)을 쓴다. 특정 서비스 도메인 용어를 절대 사용하지 않는다.

---

## 0. 대전제: 패턴은 목표가 아니라 처방이다

> GoF 서문: 디자인 패턴은 *"반복적으로 나타나는 설계 문제에 대한, 검증된 해법의 기술"* 이다.

- 패턴은 **실재하는 문제**가 있을 때만 쓴다. "좋은 코드처럼 보이려고" 도입하지 않는다.
- 모든 패턴은 **간접화(indirection)** 라는 비용을 치른다(클래스 증가, 추적성 저하, 진입장벽).
  도입 결정은 항상 *"이 간접화의 비용을 확장 이득이 정당화하는가?"* 로 환원된다.
- 더 단순한 처방(함수 추출, `sealed` + `when`, 생성자 정리)으로 충분하면 패턴을 쓰지 않는다.

---

## 1. 적용 판단 기준 (이 순서로 자문한다)

1. **변경/확장 축이 실재하는가?**
   - 과거에 실제로 변경된 이력이 있거나, 확정된 가까운 미래 케이스가 있는가.
   - "언젠가 결제수단이 늘 수도 있다" 같은 추측은 축이 아니다(→ YAGNI, 원칙 2).
2. **변하는 것과 변하지 않는 것이 분리되는가?**
   - 패턴의 본질은 "변하는 부분을 캡슐화"하는 것이다. 무엇이 변하는지 한 문장으로 말할 수
     없으면 패턴 선택이 이르다.
3. **합성으로 풀리는가, 상속이 필요한가?**
   - GoF 원칙: *"클래스 상속보다 객체 합성을 선호하라."* 행동 교체·조합은 합성(전략 주입,
     데코레이터)으로 푼다.
4. **인터페이스에 프로그래밍하는가?**
   - 구체 타입이 아니라 추상(인터페이스)에 의존하게 만든다(DIP). 단, **구현이 하나뿐이면**
     인터페이스 자체가 과설계일 수 있다(원칙 2, `kb/pattern-misuse-signals.md`).
5. **간접화 비용 < 확장 이득 인가?**
   - 클래스 수 증가, 흐름 추적 난이도, 신규 입사자 학습 비용을 이득과 저울질한다.

---

## 2. YAGNI / 과설계 가드레일

> Fowler "Yagni": *"presumptive feature(추측성 기능)를 미리 만들지 마라. 들 비용은 build
> cost·delay cost·carry cost·repair cost로 누적된다."*

- **단일 구현 + 인터페이스 + 팩토리** 세트는 거의 항상 과설계다. 구현이 둘 이상 실재할 때
  도입한다.
- "확장 포인트"를 미리 만들지 않는다. 두 번째 케이스가 실제로 도착했을 때 리팩터링으로
  패턴을 **사후 도입**하는 것이 정석이다(패턴은 리팩터링의 목적지다).
- 추상화는 **틀린 추상화의 비용**이 크다. 잘못 추상화하면 그것을 되돌리는 repair cost가
  중복 코드보다 비싸다. 확신이 없으면 중복을 잠시 허용하고 패턴 도입을 미룬다.
- Kotlin에서는 다형 분기 대부분이 `sealed class`/`sealed interface` + `when`(exhaustive)으로
  충분하다. 클래스 폭증 전에 이 경량 수단을 먼저 검토한다.

---

## 3. 패턴 분류와 선택의 큰 그림

| 분류 | 해결하는 문제 | 대표 패턴 |
|------|---------------|-----------|
| **생성(Creational)** | 객체를 *어떻게 만들지* 를 캡슐화 | Factory Method, Abstract Factory, Builder, Prototype, Singleton |
| **구조(Structural)** | 객체를 *어떻게 조립/연결* 할지 | Adapter, Bridge, Composite, Decorator, Facade, Flyweight, Proxy |
| **행위(Behavioral)** | 객체 간 *책임 분배와 상호작용* | Strategy, Template Method, Observer, State, Command, Chain, Iterator, Mediator, Visitor |

- "객체 생성이 흩어진다" → 생성 패턴.
- "타입이 안 맞거나 구조가 복잡하다" → 구조 패턴.
- "분기가 흩어지고 행동이 변한다" → 행위 패턴.

---

## 4. 프레임워크와의 관계 (Spring DI)

- 현대 Java/Spring 환경에서는 GoF의 여러 생성 패턴이 **IoC 컨테이너로 흡수**된다.
  - Strategy의 구현 선택·주입 → 생성자 주입(constructor injection).
  - Factory → `@Bean` 메서드, `FactoryBean`, `ObjectProvider`.
  - Singleton → 컨테이너의 싱글톤 스코프(직접 구현 금지).
- 그래서 "직접 Singleton/Factory를 손으로 짜기 전에, 컨테이너가 이미 제공하지 않는가"를
  먼저 묻는다. 상세는 `kb/di-strategy-factory-spring.md`.

---

## 5. 충돌 시 우선순위

- **KB(`kb/*.md`)가 이 문서보다 우선한다.** KB는 GoF/refactoring.guru/Spring 공식문서의
  사실·규칙을 직접 인용하므로, principles의 통찰과 충돌하면 KB를 따른다.
- 인용 시 KB의 `source` URL을 근거로 댄다. 예: "refactoring.guru Strategy 기준 — 알고리즘
  변형이 실재하므로 전략으로 분리".
