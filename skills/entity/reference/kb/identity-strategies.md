---
title: 식별자 생성 전략
source: https://jakarta.ee/specifications/persistence/3.2/jakarta-persistence-spec-3.2
last_fetched: 2026-06-24
skills: [entity]
---

# KB: 식별자 생성 전략 (@GeneratedValue / 복합키 / 자연키)

> 근거: Jakarta Persistence 3.2 Spec, Hibernate User Guide (identifiers)
> https://docs.jboss.org/hibernate/orm/6.6/userguide/html_single/Hibernate_User_Guide.html#identifiers

## 리뷰 훅
- [ ] 대량 INSERT가 중요한 테이블에 **`IDENTITY`를 쓰지 않았다**(batch insert 무력화).
- [ ] `SEQUENCE` 사용 시 `allocationSize`와 DB 시퀀스 `INCREMENT BY`가 **일치**한다.
- [ ] 애플리케이션이 직접 키를 만드는 경우(UUID/자연키) `@GeneratedValue` 없이 **할당 키**로 둔다.
- [ ] 복합키는 `@EmbeddedId`(권장) 또는 `@IdClass`, 키 클래스는 `Serializable` + equals/hashCode.
- [ ] 인조키를 써도 **비즈니스 유일성은 `UNIQUE` 제약**으로 별도 강제한다.
- [ ] 복합키 컬럼은 `@Column(updatable = false)`(키는 변경 불가).

## 전략 비교
| 전략 | 키 결정 시점 | batch insert | 비고 |
|------|-------------|-------------|------|
| `AUTO` | 공급자 위임 | 방언 의존 | 명시 전략 권장 |
| `IDENTITY` | INSERT 직후 | **불가**(키를 미리 못 받음) | auto-increment |
| `SEQUENCE` | INSERT 전 선할당 | **가능** | `allocationSize`로 풀링 |
| `TABLE` | 별도 테이블 | 가능하나 느림 | 락 경합 |
| `UUID` | 앱/DB | 가능 | 분산 친화, 인덱스 단편화 주의 |

## IDENTITY가 batch를 막는 이유
`IDENTITY`는 INSERT가 실행돼야 키를 알 수 있다. Hibernate는 영속 시점에 식별자가 필요한데,
키를 미리 확보할 수 없으니 **INSERT를 모아 한 번에 보내는 JDBC batch를 끌 수밖에 없다**.
대량 적재 경로에서는 `SEQUENCE`가 유리하다.

## SEQUENCE + allocationSize
```kotlin
@Id
@GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "order_seq")
@SequenceGenerator(name = "order_seq", sequenceName = "order_seq", allocationSize = 50)
val id: Long? = null
```
- `allocationSize = 50` → 한 번에 50개 키를 선점해 시퀀스 접근 횟수↓.
- **주의**: DB 시퀀스의 `INCREMENT BY`가 50과 다르면 키 충돌/구멍 발생. 둘을 맞춰야 한다.

## 복합키: @EmbeddedId vs @IdClass
```kotlin
@Embeddable
data class OrderLineId(
    @Column(name = "order_id", updatable = false) val orderId: String = "",
    @Column(name = "line_no", updatable = false) val lineNo: Int = 0,
) : Serializable

@Entity
@Table(schema = "commerce", name = "order_line")
class OrderLineEntity(
    @EmbeddedId val id: OrderLineId = OrderLineId(),
)
```
- `@EmbeddedId`: 키를 **값 객체 하나**로 응집(권장).
- `@IdClass`: 키 필드를 엔티티에 펼치고 별도 id 클래스를 짝지음 — 중복 선언이 많다.

## 자연키 vs 인조키
- **인조키(surrogate)**: 안정·단순·join 효율. 단 유일성 의미가 없으니 `UNIQUE` 필수.
- **자연키(natural)**: 의미가 있으나 값이 바뀌면 FK 전파 비용·정체성 위험.
- equals/hashCode는 가능하면 **불변 자연키 기반**(원칙 1, `equals-hashcode.md`).
