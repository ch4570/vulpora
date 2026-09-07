---
title: 연관관계와 페치
source: https://jakarta.ee/specifications/persistence/3.2/jakarta-persistence-spec-3.2
last_fetched: 2026-06-24
skills: [entity]
---

# KB: 연관관계와 페치 (관계·소유·N+1)

> 근거: Jakarta Persistence 3.2 Spec, Hibernate User Guide (associations / fetching)
> https://docs.jboss.org/hibernate/orm/6.6/userguide/html_single/Hibernate_User_Guide.html#associations

## 리뷰 훅
- [ ] `@ManyToOne`/`@OneToOne`을 **`fetch = FetchType.LAZY`로 명시**했다(기본 EAGER 위험).
- [ ] 양방향 관계에 **소유측이 하나**고, 비소유측에 `mappedBy`가 붙었다.
- [ ] 컬렉션을 루프에서 접근하는 경로에 **fetch join 또는 `@EntityGraph`** 를 적용했다(N+1 차단).
- [ ] `cascade`/`orphanRemoval`은 **생명주기가 진짜 종속**인 부모-자식에만 걸었다.
- [ ] `@ManyToMany`를 가급적 피하고 **연결 엔티티**로 분해했다(추가 컬럼·제어 용이).
- [ ] 양방향 편의 메서드로 **양쪽 상태를 함께 갱신**한다.

## 관계 유형과 기본 fetch
| 관계 | 기본 FetchType | 권장 |
|------|---------------|------|
| `@ManyToOne` | **EAGER** | `LAZY` 명시 |
| `@OneToOne` | **EAGER** | `LAZY` 명시(주의: nullable·소유측 조건) |
| `@OneToMany` | LAZY | 유지 |
| `@ManyToMany` | LAZY | 연결 엔티티로 분해 권장 |

## 소유측(owning) vs 비소유(mappedBy)
- FK 컬럼을 들고 있는 쪽이 **소유측**. 소유측의 변경만 DB에 반영된다.
- `mappedBy = "..."` 가 붙은 쪽은 **비소유(inverse)** — 읽기용 거울. 여기만 바꾸면 DB에 반영 안 됨.

```kotlin
@Entity @Table(schema = "commerce", name = "orders")
class OrderEntity(
    @Id @Column(name = "order_id", updatable = false) val id: String,
    @OneToMany(mappedBy = "order", cascade = [CascadeType.ALL], orphanRemoval = true)
    val lines: MutableList<OrderLineEntity> = mutableListOf(),  // 비소유
)

@Entity @Table(schema = "commerce", name = "order_line")
class OrderLineEntity(
    @Id @Column(name = "line_id", updatable = false) val id: String,
    @ManyToOne(fetch = FetchType.LAZY)              // 소유측(FK 보유), LAZY 명시
    @JoinColumn(name = "order_id", nullable = false)
    val order: OrderEntity,
)
```

## N+1 문제와 해법
- 증상: `orders` N건을 가져온 뒤 각각 `order.lines`를 접근 → 자식 조회 쿼리가 N번 추가 발생.
- 해법:
  - **fetch join**: `select o from OrderEntity o join fetch o.lines where ...`
  - **`@EntityGraph`**: 리포지토리 메서드에 그래프 지정으로 한 번에 로딩.
  - 컬렉션 fetch join은 **페이징과 충돌**할 수 있으니(메모리 페이징 경고) batch size·서브쿼리 고려.

## cascade / orphanRemoval
| 옵션 | 의미 | 주의 |
|------|------|------|
| `cascade = ALL` | 영속/병합/삭제 전파 | 독립 엔티티엔 금지 |
| `orphanRemoval = true` | 컬렉션에서 빠진 자식 삭제 | 부모-자식 진짜 종속일 때만 |

남용하면 **의도치 않은 연쇄 삭제**가 일어난다. 관계의 생명주기 종속성을 먼저 확인한다.
