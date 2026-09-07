---
title: "@Transactional 기본 — 선언적 트랜잭션 & 프록시 AOP"
source: https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative.html
last_fetched: 2026-06-24
skills: [service]
---

# @Transactional 기본 — 선언적 트랜잭션 & 프록시 AOP

선언적 트랜잭션 관리는 코드에 트랜잭션 경계 코드를 직접 쓰지 않고 **메타데이터(`@Transactional`)**로 경계를 지정하는 방식이다. Spring은 이를 **프록시 기반 AOP**로 구현한다. 이 프록시 모델이 서비스 설계의 모든 제약(왜 `open`인가, 자기 호출은 왜 안 되는가, 가시성은 무엇인가)을 결정한다.

## 프록시 기반 AOP의 핵심 결과

- **외부 진입만 인터셉트된다.** `@Transactional`은 프록시가 가로채는 호출에만 적용된다. 즉 **다른 빈 또는 컨테이너를 거쳐 들어오는 호출**에만 트랜잭션이 시작된다.
- **자기 호출(self-invocation) 함정.** 같은 클래스 안에서 `this.otherMethod()`로 호출하면 프록시를 우회하므로 `otherMethod`의 `@Transactional`이 **적용되지 않는다.** 트랜잭션 경계가 필요한 메서드는 외부에서 빈을 통해 호출해야 한다. 분리가 필요하면 별도 빈으로 추출한다.
- **`open`/non-final 필요(Kotlin).** Kotlin 클래스/메서드는 기본 `final`이라 CGLIB 프록시가 서브클래싱할 수 없다. 그래서 `@Transactional`이 붙는 클래스와 메서드는 `open`이어야 한다(`OrderService`의 `open class`/`open fun`).
- **가시성.** 프록시 모드에서 `@Transactional`은 **public 메서드**에만 적용하는 것이 안전하다. protected/private/package-visible 메서드에 붙여도 프록시가 적용하지 않으며 오류도 없이 조용히 무시된다.

## 클래스 레벨 vs 메서드 레벨

- 클래스 레벨 `@Transactional`은 그 클래스의 모든 (대상) 메서드에 적용되는 **기본값**이다.
- 메서드 레벨 애너테이션은 클래스 레벨을 **재정의(override)**한다.
- 권장 패턴: 클래스 레벨 `@Transactional(readOnly = true)`로 안전한 기본값을 두고, 쓰기 메서드만 메서드 레벨에서 재정의한다.

```kotlin
@Service
@Transactional(readOnly = true)              // 기본: 읽기 전용
open class OrderService(
    private val orderRepository: OrderEntityRepository,
) {
    @Transactional                            // 재정의: 쓰기 트랜잭션
    open fun place(order: Order) { /* ... */ }

    open fun findById(id: Long): Order? =      // 클래스 기본(readOnly) 상속
        orderRepository.findById(id)?.let(OrderMapper::toModel)
}
```

## 롤백 규칙 (rollback rules) — 매우 중요

기본 동작: **`RuntimeException`(비검사 예외)과 `Error`만 롤백을 트리거한다.** **검사 예외(checked exception)는 기본적으로 롤백하지 않고 커밋된다.**

- 검사 예외에서 롤백하려면 `@Transactional(rollbackFor = [SomeCheckedException::class])`로 명시한다.
- 특정 예외에서 롤백을 막으려면 `noRollbackFor`를 쓴다.
- 트랜잭션이 "rollback-only"로 표시된 뒤 커밋을 시도하면 예외가 발생한다(`REQUIRES_NEW`로 분리된 내부 트랜잭션이 외부에 미치는 영향 주의).

> Kotlin은 검사/비검사 예외 구분이 없지만, **JVM 런타임의 롤백 규칙은 동일하게 적용된다.** `RuntimeException` 계열만 자동 롤백된다.

## 리뷰 훅
- [ ] `@Transactional` 클래스/메서드가 `open`인가? (Kotlin 프록시)
- [ ] 트랜잭션이 필요한 메서드를 같은 클래스 내부에서 `this`로 호출하고 있지 않은가? (자기 호출 함정)
- [ ] `@Transactional`이 public 메서드에 붙어 있는가? (private/protected에 붙어 무시되지 않는가)
- [ ] 클래스 레벨 `readOnly = true` 기본 + 쓰기 메서드만 재정의 패턴을 지키는가?
- [ ] 검사 예외에서 롤백이 필요하면 `rollbackFor`를 명시했는가? (기본은 비검사만 롤백)
