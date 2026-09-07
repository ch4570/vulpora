---
title: 오케스트레이션 vs 도메인 로직 — 얇은 서비스, 단일 진입점
source: https://docs.spring.io/spring-framework/reference/core/beans/dependencies/factory-collaborators.html
last_fetched: 2026-06-24
skills: [service]
---

# 오케스트레이션 vs 도메인 로직 — 얇은 서비스, 단일 진입점

> 계층형 아키텍처 원칙(서비스가 응용 흐름을 조정하고, 비즈니스 규칙은 도메인 모델에 둔다)은 Eric Evans, *Domain-Driven Design* 및 일반 계층형 설계 통념에 근거한다. Spring DI(생성자 협력자) 근거는 위 공식 문서를 따른다.

## 책임 분리

| 서비스(오케스트레이션) | 도메인 모델/엔티티(비즈니스 규칙) |
|---|---|
| 트랜잭션 경계 시작/종료 | 불변식(invariant) 보장 |
| 호출 순서 제어, 단계 조정 | 상태 전이 규칙(예: 주문은 결제 후 배송) |
| 애그리거트 간 조정 | 값 검증, 계산 |
| 경계에서 model ↔ entity 매핑 | 도메인 행위(메서드)로 캡슐화 |
| 영속(repository) 호출 | 영속을 모름 |

- **서비스에 비즈니스 규칙을 쌓지 않는다.** 규칙은 도메인 모델 안 행위로 옮긴다.
- 반대로 도메인이 게터/세터만 있는 **빈약한 모델(anemic model)**이 되지 않게 한다.

```kotlin
// 좋음: 서비스는 조정만, 규칙은 도메인 모델에
@Transactional
open fun place(orderId: Long) {
    val order = orderRepository.find(orderId) ?: throw OrderNotFoundException(orderId)
    order.markPlaced()                       // 상태 전이 규칙은 도메인 모델 안
    orderRepository.save(order)
}
```

## 얇은 서비스 vs 두꺼운 서비스

- **얇은(thin) 서비스**가 기본: 조정 + 트랜잭션 + 매핑.
- 여러 애그리거트를 가로지르는 진짜 응용 흐름(여러 단계의 조정)은 서비스에 둔다 — 이건 정당한 "두께"다.
- 한 도메인의 규칙이 서비스에 흩어지면 신호: 도메인 모델로 끌어올린다.

## 단일 진입점 + 생성자 주입

- 서비스는 해당 엔티티 영속의 **유일한 진입점**이다. 컨트롤러/리스너/다른 도메인은 repository를 직접 부르지 않고 서비스를 통한다(`ControllerRepositoryAccessArchTest`).
- 협력자는 **생성자 주입만**. 필드 주입 금지(`InjectionStyleArchTest`). 생성자 주입은 불변 의존성·테스트 용이성·누락 빈 조기 발견을 준다.

## 왜 entity가 아니라 model을 들고 다니나

- 서비스 경계에서 `mapper`로 entity ↔ model을 변환하고, **외부에는 model만** 노출한다.
- 이유: 영속 세부(JPA 지연 로딩, 영속성 컨텍스트 수명, 컬럼 매핑)가 도메인/상위 계층으로 누출되지 않게 한다. 트랜잭션 밖에서 lazy 프록시를 건드리는 사고를 막는다.
- JSON/직렬화는 repository가 아니라 서비스의 책임이다.

## 리뷰 훅
- [ ] 비즈니스 규칙이 서비스가 아니라 도메인 모델/엔티티 안에 있는가?
- [ ] 도메인 모델이 게터/세터뿐인 빈약한 모델로 전락하지 않았는가?
- [ ] 서비스가 영속의 단일 진입점인가? (컨트롤러/리스너가 repo 직접 호출 안 함)
- [ ] 모든 의존성이 생성자 주입인가? (필드 주입 없음)
- [ ] 서비스가 entity가 아닌 model을 외부에 노출하는가? (경계 매핑)
