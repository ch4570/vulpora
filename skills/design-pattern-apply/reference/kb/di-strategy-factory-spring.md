---
title: DI · Strategy · Factory (Spring 실현)
source: Spring Framework Reference — Core/IoC Container https://docs.spring.io/spring-framework/reference/core/beans.html + GoF Strategy/Factory
last_fetched: 2026-06-24
skills: [design-pattern-apply]
---

# KB: 의존성 주입과 GoF 패턴의 Spring 실현

> Spring의 **IoC 컨테이너**는 GoF의 여러 생성·행위 패턴을 프레임워크 차원으로 흡수한다.
> "직접 Singleton/Factory를 손으로 짜기 전에, 컨테이너가 이미 제공하지 않는가"를 먼저 묻는다.

## IoC / DI 핵심 사실 (Spring 공식)
- **IoC(제어의 역전)**: 객체가 자기 의존성을 직접 `new` 하지 않고, **컨테이너가 생성·주입**한다.
  DI는 IoC를 구현하는 방식이다.
- **생성자 주입(constructor injection)이 권장 기본값**이다(공식 문서 권고).
  - 불변(final/val) 의존성 보장, 필수 의존성 누락을 **생성 시점에 발견**.
  - 필드 주입은 숨은 의존성·테스트 곤란으로 지양. 선택적 의존성에만 setter 주입.
- **빈 스코프**: 기본은 **singleton**(컨테이너당 인스턴스 1개). 요청/세션 등 다른 스코프 선택 가능.
  → 직접 Singleton 패턴을 구현할 필요가 거의 없다(전역 가변 상태 함정도 회피).

```kotlin
@Service
class OrderService(
    private val discountPolicy: DiscountPolicy,   // 생성자 주입 = Strategy 주입
    private val paymentClient: PaymentClient,
)
```

## Strategy → DI로 실현
- GoF Strategy의 "알고리즘을 외부에서 교체"는 Spring에서 **인터페이스 타입 주입**으로 끝난다.
- **다중 구현 선택 전략**:

| 상황 | 방법 |
|------|------|
| 구현 중 하나를 기본으로 | `@Primary` 또는 `@Qualifier("name")` |
| 모든 구현을 함께 받기 | `List<DiscountPolicy>` 또는 `Map<String, DiscountPolicy>` 주입 |
| 키로 런타임 선택 | `Map<String, Strategy>` 주입 후 key로 조회(전략 레지스트리) |

```kotlin
@Component
class DiscountResolver(private val policies: Map<String, DiscountPolicy>) {
    fun resolve(type: String): DiscountPolicy =
        policies[type] ?: error("no policy: $type")   // 빈 이름이 곧 전략 키
}
```
> 이 패턴이면 **수작업 Strategy 팩토리/switch가 사라진다**. 신규 전략은 `@Component` 추가만.

## Factory → Spring 실현
GoF Factory의 "생성 캡슐화"를 Spring이 제공하는 세 가지 도구로 대체한다.

| 도구 | 용도 | 비고 |
|------|------|------|
| `@Bean` 메서드 | `@Configuration`에서 생성 로직을 담아 빈 등록 | 가장 흔한 팩토리. 생성 시 의존성 조립 |
| `FactoryBean<T>` | 복잡한 생성 로직을 빈 자체로 캡슐화 | `getObject()`가 실제 빈 반환 |
| `ObjectProvider<T>` | **지연/선택적/다중** 조회 | `getIfAvailable()`, `getIfUnique()`, 스트림 순회 |

```kotlin
@Configuration
class PaymentConfig {
    @Bean
    fun paymentClient(props: PaymentProperties): PaymentClient =   // @Bean = 팩토리 메서드
        PaymentClient(endpoint = props.endpoint, timeout = props.timeout)
}
```
- **지연 생성/순환 회피**가 필요하면 생성자에 `ObjectProvider<T>`를 받아 사용 시점에 `getObject()`.
- 런타임 조건으로 만들 빈이 갈리면 `@Conditional`/`@Profile` 또는 `@Bean` 내부 분기.

## Prototype 스코프 주의
- prototype 빈을 singleton 빈에 직접 주입하면 **싱글톤 생성 시 1회만 주입**되어 매번 새 인스턴스가
  안 생긴다. 매 호출 새 인스턴스가 필요하면 `ObjectProvider`/lookup으로 받아온다.

## 빌드/실행 환경 메모
- 의존성·플러그인 추가가 필요하면 **빌드시스템 자동감지(gradle/maven 등)** 후 해당 매니페스트에
  반영한다. 특정 빌드 도구를 가정하지 않는다.

## GoF ↔ Spring 대응표
| GoF | Spring 실현 |
|-----|-------------|
| Strategy | 인터페이스 생성자 주입, `@Qualifier`, `Map`/`List` 주입 |
| Factory Method / Abstract Factory | `@Bean` 메서드, `FactoryBean`, `@Configuration` |
| Singleton | 빈 singleton 스코프(직접 구현 금지) |
| Proxy | AOP 프록시(트랜잭션 `@Transactional`, 보안, 캐시 `@Cacheable`) |
| Observer | `ApplicationEvent` + `@EventListener` |
| Prototype(생성) | prototype 스코프 + `ObjectProvider` lookup |

## 리뷰 훅
- [ ] **생성자 주입**을 기본으로 쓰는가(필드 주입 지양, final/val 불변).
- [ ] Strategy를 수작업 switch/팩토리 대신 **인터페이스 주입(+`Map`/`@Qualifier`)** 으로 실현했는가.
- [ ] 직접 Singleton을 구현하지 않고 **빈 스코프**를 쓰는가(전역 가변 상태 회피).
- [ ] Factory가 필요하면 `@Bean`/`FactoryBean`/`ObjectProvider` 중 적합한 것을 골랐는가.
- [ ] prototype 빈을 싱글톤에 주입할 때 lookup(`ObjectProvider`)으로 매번 새로 받는가.
- [ ] 지연/선택적/다중 의존성에 `ObjectProvider`를 적절히 활용했는가.
- [ ] 빌드 변경 시 **자동감지된 빌드시스템**(gradle/maven 등)에 맞춰 반영했는가.
