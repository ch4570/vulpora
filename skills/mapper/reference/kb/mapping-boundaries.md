---
title: 매핑 경계와 엔티티 누수 방지
source: https://jakarta.ee/specifications/persistence/3.2/jakarta-persistence-spec-3.2
last_fetched: 2026-06-24
skills: [mapper]
---

# 매핑 경계 (엔티티 ↔ model/DTO)

## 왜 매핑이 필요한가
JPA 엔티티는 영속 컨텍스트에 묶인 **영속 상태(persistence-managed)** 객체다(Jakarta Persistence 3.2,
entity/lifecycle 정의). 이를 경계 밖으로 그대로 노출하면 다음 문제가 생긴다.

- **지연 로딩 직렬화 문제**: 영속 컨텍스트가 닫힌 뒤 lazy 연관에 접근하면 `LazyInitializationException`이
  나거나, 직렬화 중 의도치 않게 추가 쿼리가 발생한다.
- **API 계약 분리 부재**: 엔티티 구조 변경이 곧 외부 API 응답 변경이 된다. DB 스키마와 API 계약이 결합된다.
- **불변식 누수**: 엔티티의 식별자·연관 관리 책임이 외부 계층으로 새어 나간다.

해결책: **영속 경계(persistence boundary)에서 변환**한다. 엔티티는 영속 계층 안에서만 살고, 밖으로는
model/DTO로 바꿔 내보낸다.

## 계층 규칙
- **repository**: entity를 다룬다(영속 상태).
- **service**: model을 다룬다(영속 비의존). 경계에서 매퍼로 변환한다.
- **controller / 외부 API**: model 또는 DTO만 본다. 엔티티를 직접 직렬화하지 않는다.

추가로 응답 DTO를 도메인 model과 분리하면(Spring MVC 컨트롤러 메서드는 임의 객체를 반환·바인딩할 수 있다)
API 계약을 독립적으로 진화시킬 수 있다 — 참고: Spring MVC controller methods
(https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller/ann-methods.html).

## 단방향 의존
의존 방향은 한쪽으로만 흐른다.

```
controller -> service(model) -> mapper -> repository(entity)
```

서비스가 엔티티를 알지 못하게 하고, 매퍼만 양쪽 타입을 안다. 이렇게 하면 영속 기술 교체나 DTO 변경의
영향 범위가 매퍼 한 곳으로 좁혀진다.

## 예시 (Order)
```kotlin
// service는 model만 본다
fun findOrder(id: Long): Order =
    OrderMapper.toModel(orderRepository.findByIdOrNull(id) ?: throw OrderNotFound(id))
```

## 리뷰 훅
- [ ] 엔티티가 service 경계 밖(controller/외부 API/직렬화)으로 새어 나가지 않는가?
- [ ] repository는 entity, service는 model을 다루는가?
- [ ] lazy 연관을 경계 밖에서 접근하지 않는가(직렬화 시점 포함)?
- [ ] DTO/model이 엔티티 스키마 변경으로부터 분리돼 있는가?
- [ ] 의존 방향이 단방향(service→mapper→repository)인가?
