---
title: 엔티티 매핑 기본
source: https://jakarta.ee/specifications/persistence/3.2/jakarta-persistence-spec-3.2
last_fetched: 2026-06-24
skills: [entity]
---

# KB: 엔티티 매핑 기본 (@Entity / @Table / @Column / @Id)

> 근거: Jakarta Persistence 3.2 Spec, Hibernate User Guide
> https://docs.jboss.org/hibernate/orm/6.6/userguide/html_single/Hibernate_User_Guide.html#entity

## 리뷰 훅
- [ ] 클래스에 `@Entity`, **인자 없는(no-arg) 생성자**가 있다(Kotlin은 no-arg 플러그인).
- [ ] `@Table`에 **`schema`와 `name`을 모두** 명시했다(스키마 한정).
- [ ] **PK가 있다** — `@Id` 단일키 또는 `@EmbeddedId`/`@IdClass` 복합키.
- [ ] access type을 한 엔티티 안에서 **일관**되게 썼다(필드 접근 vs 프로퍼티 접근 혼용 금지).
- [ ] `@Column`에 `nullable`, `length`, 불변 컬럼이면 `updatable = false`를 명시했다.
- [ ] 열거형은 `@Enumerated(EnumType.STRING)`(서수 `ORDINAL`은 순서 바뀌면 데이터 깨짐).
- [ ] 영속 대상이 아닌 필드는 `@Transient`로 제외했다.

## 기본 매핑 규칙
| 어노테이션 | 의미 | 비고 |
|-----------|------|------|
| `@Entity` | 영속 클래스 | name 미지정 시 클래스 단순명 |
| `@Table` | 매핑 테이블 | `schema`+`name` 권장 |
| `@Id` | 단일 PK | |
| `@EmbeddedId`/`@IdClass` | 복합 PK | `identity-strategies.md` |
| `@Column` | 컬럼 매핑 | `nullable/length/updatable/unique` |
| `@Enumerated` | 열거형 | **STRING 고정** |
| `@Transient` | 영속 제외 | DB에 매핑 안 함 |

## access type: field vs property
- **field access**: 필드에 직접 어노테이션 → Hibernate가 리플렉션으로 필드 read/write.
- **property access**: getter에 어노테이션 → getter/setter 경유.
- Kotlin에서는 보통 **프로퍼티(필드)에 어노테이션** → field access로 동작. 한 엔티티에서
  섞으면 동작이 모호해지므로 **하나로 통일**한다.

## 스키마 한정 @Table 예시
```kotlin
@Entity
@Table(schema = "commerce", name = "orders")
class OrderEntity(
    @Id
    @Column(name = "order_id", length = 126, nullable = false, updatable = false)
    val id: String,

    @Column(name = "member_id", length = 126, nullable = false)
    val memberId: String,

    @Enumerated(EnumType.STRING)
    @Column(name = "status", length = 50, nullable = false)
    val status: OrderStatus,
)
```

## 주의
- 기본 컬럼명/테이블명을 **암묵 추론에 의존하지 말 것** — 명시적으로 `name`을 적어야 스키마
  마이그레이션과 일치 여부를 사람이 검증할 수 있다.
- `@Column(updatable = false)`는 불변 의도를 **DB가 아니라 영속 계층**에서 막는 장치다. 진짜
  무결성은 DB 제약으로 보강한다(`constraints` 개념은 마이그레이션에서).
