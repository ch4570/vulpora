---
title: 엔티티 equals/hashCode
source: https://docs.jboss.org/hibernate/orm/6.6/userguide/html_single/Hibernate_User_Guide.html#entity-pojo-equalshashcode
last_fetched: 2026-06-24
skills: [entity]
---

# KB: 엔티티 equals/hashCode (정체성 함정)

> 근거: Hibernate User Guide — "Implementing equals() and hashCode()"

## 리뷰 훅
- [ ] equals/hashCode를 **DB 생성 id(@GeneratedValue)에 의존하지 않는다**.
- [ ] **불변 비즈니스 키**(또는 앱이 미리 할당한 UUID)로 equals를 구현했다.
- [ ] `hashCode`는 **모든 상태에서 일정**하다(고정 상수 또는 불변 키 기반).
- [ ] equals에서 타입 비교를 `getClass()`가 아닌 **Hibernate 프록시 대응 방식**으로 했다
      (`instanceof` + `Hibernate.getClass()` 고려).
- [ ] `data class`로 자동 생성한 equals/hashCode를 엔티티에 쓰지 않았다(`kotlin-entity-pitfalls.md`).

## 왜 생성 id 기반 equals가 위험한가
| 시점 | id 값 | 문제 |
|------|------|------|
| 영속 전(transient) | `null` | 두 신규 객체가 모두 id=null → 서로 같다고 판정될 수 있음 |
| flush 후 | 할당됨 | 같은 객체가 영속 전후로 **hashCode가 바뀜** |

→ 영속 전에 `Set`/`Map`에 담았다가 flush되면, hashCode가 바뀌어 **컬렉션에서 해당 객체를
다시 찾지 못한다**. 정체성이 깨진다.

## 권장 패턴 1: 불변 비즈니스 키
```kotlin
@Entity
@Table(schema = "membership", name = "member")
class MemberEntity(
    @Id @Column(name = "member_id", updatable = false) val id: String,
    @Column(name = "email", nullable = false) val email: String,
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is MemberEntity) return false   // 프록시 대응
        return id == other.id                        // 불변 키
    }
    override fun hashCode(): Int = id.hashCode()
}
```

## 권장 패턴 2: 고정 hashCode
적절한 불변 자연키가 없으면 **hashCode를 상수**로 두는 방법도 표준적이다.
```kotlin
override fun hashCode(): Int = javaClass.hashCode()
```
- 장점: 영속 전후로 hashCode 불변 → 컬렉션 정체성 안전.
- 단점: 같은 타입이 같은 버킷에 몰림(대량 컬렉션 시 약간의 성능 비용). 대부분 허용 가능한 trade-off.

## Hibernate 프록시 주의
지연 로딩된 연관은 **프록시 서브클래스**다. `this.javaClass == other.javaClass`로 비교하면
프록시 vs 실제 클래스가 달라 equals가 깨진다. `instanceof`/`is` 또는 `Hibernate.getClass(obj)`
로 실제 타입을 풀어 비교한다.
