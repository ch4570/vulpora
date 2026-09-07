---
title: Enum Persistence (@Enumerated)
source: https://jakarta.ee/specifications/persistence/3.2/jakarta-persistence-spec-3.2
last_fetched: 2026-06-24
skills: [enum]
---

# Enum Persistence — `@Enumerated`

Jakarta Persistence 3.2 스펙(`@Enumerated`) + Hibernate User Guide(enum mapping) distill.
(Hibernate 참고: https://docs.jboss.org/hibernate/orm/6.6/userguide/html_single/Hibernate_User_Guide.html#basic-enums)

## STRING vs ORDINAL

`@Enumerated`는 enum 필드를 DB에 어떻게 저장할지 정한다.

```kotlin
@Entity
class Order(
    @Enumerated(EnumType.STRING)   // ✅ 이름을 저장: 'PAID'
    @Column(length = 20, nullable = false)
    var status: OrderStatus,
)
```

- **`EnumType.STRING`** — enum **이름**을 문자열로 저장. 항상 이걸 쓴다.
- **`EnumType.ORDINAL`**(스펙 **기본값**) — enum **선언 순서(0,1,2…)** 를 정수로 저장. **금지.**

## ORDINAL이 위험한 이유

```kotlin
// v1
enum class OrderStatus { PENDING, PAID, SHIPPED }   // PAID = 1

// v2 — 중간에 삽입
enum class OrderStatus { PENDING, HOLD, PAID, SHIPPED }  // PAID = 2 가 됨!
```

- ORDINAL이면 기존에 `1`로 저장된 모든 행이 의미가 **PAID → HOLD**로 뒤바뀐다. 코드 변경만으로
  운영 데이터가 조용히 오염된다. STRING은 이름을 저장하므로 순서 변경에 영향이 없다.

## DB 저장 길이 / 제약

- STRING 컬럼은 **가장 긴 상수 이름**을 수용할 `length`로 잡는다(잘리면 저장 실패).
- 유효 값만 들어오도록 `CHECK (status IN (...))` 또는 코드 테이블 + FK로 DB 차원 제약을 건다.

## AttributeConverter 대안

이름이 아니라 **명시적 코드**(예: `'P'`, `'C'`)로 저장하거나 표시값을 분리하고 싶을 때.

```kotlin
@Converter(autoApply = true)
class OrderStatusConverter : AttributeConverter<OrderStatus, String> {
    override fun convertToDatabaseColumn(v: OrderStatus) = v.code      // "P"
    override fun convertToEntityAttribute(c: String) =
        OrderStatus.entries.first { it.code == c }
}
```

- 컨버터를 쓰면 `@Enumerated`를 같은 필드에 함께 쓰지 않는다(택일).

## 값 추가/제거 마이그레이션 주의

- **추가**: 비교적 안전. 단 `CHECK`/코드테이블이 있으면 그쪽도 함께 갱신.
- **제거/리네이밍**: DB에 남아 있는 옛 이름은 로딩 시 매핑 실패(예외)를 일으킨다. 제거 전
  **데이터 백필/매핑**을 먼저 수행한다. 제거는 코드와 데이터의 2단계 작업이다.

## 리뷰 훅

- [ ] 모든 영속 enum 필드에 `@Enumerated(EnumType.STRING)`이 명시돼 있는가(기본값 ORDINAL 회피)?
- [ ] STRING 컬럼 `length`가 가장 긴 상수 이름을 수용하는가?
- [ ] enum 값 추가/제거가 DB `CHECK`/코드테이블/기존 데이터와 함께 마이그레이션되는가?
- [ ] ORDINAL로 저장된 레거시 컬럼이 남아 순서 변경 리스크를 안고 있지 않은가?
- [ ] 컨버터를 쓴다면 `@Enumerated`와 중복 적용하지 않았는가?
