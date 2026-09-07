---
title: 응답 DTO 설계와 model→DTO 매핑
source: https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller/ann-methods/responsebody.html
last_fetched: 2026-06-24
skills: [response]
---

# 응답 DTO 설계와 매핑 (Response DTO & Mapping)

> 출처: Spring MVC — `@ResponseBody` / `HttpMessageConverter` 직렬화, Kotlin `data class` 관용.
> 핵심 규칙: **응답 DTO가 model→DTO 매핑을 소유하고, 도메인 엔티티를 직접 직렬화하지 않는다.**

## 1. `from(model)` 팩토리 패턴

- 응답 DTO는 `data class` + `val` + `companion object { fun from(model) }` 형태로 만든다.
- 매핑 로직은 **컨트롤러가 아니라 응답 DTO**가 소유한다. 컨트롤러는 `OrderResponse.from(order)`를
  호출만 한다.

```kotlin
data class OrderResponse(
    /** 주문 식별자 */
    val id: String,
    /** 주문 상태 (예: CREATED, PAID) */
    val status: String,
    /** 총 결제 금액 */
    val totalAmount: Long,
    /** 생성 시각 (ISO-8601) */
    val createdAt: Instant,
) {
    companion object {
        fun from(model: Order): OrderResponse =
            OrderResponse(
                id = model.id,
                status = model.status.name,
                totalAmount = model.totalAmount,
                createdAt = model.createdAt,
            )
    }
}
```

## 2. 엔티티 직접 노출 금지 (Entity Leakage)

- 도메인 엔티티/모델을 응답 본문으로 **직접 반환하지 않는다**. 이유:
  - 내부 필드(감사 컬럼, 비밀, 외부에 의미 없는 식별자)가 의도치 않게 노출됨.
  - 지연 로딩(lazy) 프록시 직렬화 중 예외/추가 쿼리(N+1) 발생.
  - 양방향 연관에서 **순환 참조 직렬화** 위험.
  - 엔티티 구조 변경이 곧 API 계약 깨짐으로 직결됨.
- 항상 명시적 응답 DTO를 거쳐 **노출 필드를 화이트리스트**로 관리한다.

## 3. 불변성 (Immutability)

- `val`만 사용한다. 가변(`var`)·노출된 가변 컬렉션을 응답에 담지 않는다.
- 컬렉션 필드는 `List<T>` 같은 읽기 전용 타입으로 노출한다.

## 4. null 처리

- 의미 있는 "값 없음"만 nullable로 둔다. **불확실해서 null**이 아니라 **계약상 선택적**일 때만.
- 빈 컬렉션은 `null`이 아니라 **빈 리스트(`emptyList()`)**로 반환해 클라이언트 분기를 단순화한다.
- null 직렬화 포함/제외 정책은 한 API 안에서 일관되게 (→ `content-negotiation-serialization.md`).

## 5. 매핑 시 주의

- enum은 `name`/코드 등 **안정적 표현**으로 변환한다(ordinal 노출 금지).
- 금액/수량 등은 도메인 타입을 그대로 노출하되 단위를 필드명/문서로 명확히(`totalAmount`).
- 중첩 DTO도 각자 `from(...)`을 가진다(`OrderResponse.from`이 `OrderLineResponse.from`을 호출).

## 6. 예시 엔티티 매핑 표

| 도메인(model) | 응답 DTO | 변환 포인트 |
|---------------|----------|-------------|
| `Order` | `OrderResponse` | `status.name`, 금액 단위 명시 |
| `Member` | `MemberResponse` | 비밀번호/내부 ID 제외 |
| `Article` | `ArticleResponse` | 본문 요약 여부, 작성시각 ISO-8601 |
| `Product` | `ProductResponse` | 가격/통화 분리, 재고 노출 정책 |

## 리뷰 훅

- [ ] 컨트롤러가 직접 매핑하지 않고 `<Entity>Response.from(model)`을 호출하는가?
- [ ] 도메인 엔티티/JPA 엔티티를 응답 본문으로 직접 반환하지 않는가?
- [ ] `data class` + `val`(불변)인가? 가변 컬렉션을 노출하지 않는가?
- [ ] 노출 필드가 화이트리스트인가(내부/비밀 필드 제외)?
- [ ] 빈 컬렉션을 `null` 대신 빈 리스트로 반환하는가?
- [ ] enum을 ordinal이 아닌 안정적 이름/코드로 노출하는가?
- [ ] 중첩 DTO도 각자 `from(...)` 매핑을 가지는가?
