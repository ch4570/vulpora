---
title: 엔티티 생명주기와 상태
source: https://docs.spring.io/spring-data/jpa/reference/jpa/entity-persistence.html
last_fetched: 2026-06-24
skills: [entity]
---

# KB: 엔티티 생명주기와 상태 (영속 컨텍스트 / Persistable / 감사)

> 근거:
> - Jakarta Persistence 3.2 Spec (EntityManager) — https://jakarta.ee/specifications/persistence/3.2/jakarta-persistence-spec-3.2
> - Spring Data JPA — Persisting Entities — https://docs.spring.io/spring-data/jpa/reference/jpa/entity-persistence.html

## 리뷰 훅
- [ ] 엔티티 상태(transient/managed/detached/removed)를 의식하고 코드를 짰다.
- [ ] managed 상태 변경은 **dirty checking**으로 반영됨을 안다(명시적 save 없이도 flush).
- [ ] 동시성 갱신이 있는 엔티티에 **`@Version` 낙관적 락**을 고려했다.
- [ ] auditing이 필요하면 `@EntityListeners(AuditingEntityListener)` + `@CreatedDate`/`@LastModifiedDate`.
- [ ] JDBC 대량 upsert/할당 키 엔티티는 **`Persistable`** 로 new 판단을 명확히 했다.
- [ ] 읽기 전용 미러 엔티티는 auditing을 **생략**하고 소스 시각을 `val`로 보존했다.

## 엔티티 상태
| 상태 | 의미 | 영속 컨텍스트 |
|------|------|--------------|
| transient | 새로 생성, 아직 영속 안 됨 | 추적 안 함 |
| managed | 영속 컨텍스트가 추적 중 | dirty checking 대상 |
| detached | 한때 managed였으나 분리됨 | 변경 미반영 |
| removed | 삭제 예약 | flush 시 DELETE |

- **dirty checking**: managed 엔티티의 필드를 바꾸면, flush 시점에 변경 컬럼이 자동 UPDATE된다.
- **flush**: 영속 컨텍스트의 변경을 DB로 내보냄(트랜잭션 커밋·쿼리 직전 등).

## @Version 낙관적 락
```kotlin
@Version
@Column(name = "version", nullable = false)
var version: Long = 0
```
- UPDATE 시 버전 불일치면 `OptimisticLockException` → 동시 수정 충돌을 감지.

## auditing
```kotlin
@Entity @Table(schema = "commerce", name = "orders")
@EntityListeners(AuditingEntityListener::class)
class OrderEntity(
    @Id @Column(name = "order_id", updatable = false) val id: String,
    @CreatedDate @Column(name = "created_at", updatable = false) var createdAt: Instant? = null,
    @LastModifiedDate @Column(name = "updated_at") var updatedAt: Instant? = null,
)
```
- 활성화: 설정에 `@EnableJpaAuditing` 필요.

## Persistable: Spring Data의 "new" 판단
Spring Data JPA의 `save()`는 엔티티가 **새 것인지 기존인지**로 INSERT vs UPDATE(merge)를 가른다.
기본 판단은 "식별자가 null/0이면 new". **앱이 키를 미리 할당**하면 식별자가 비어 있지 않아
Spring이 잘못 UPDATE(merge)로 가서 불필요한 SELECT가 생긴다. 이때 `Persistable`을 구현한다:
```kotlin
@Entity @Table(schema = "commerce", name = "order_outbox")
class OrderOutboxEntity(
    @Id @Column(name = "id", updatable = false) val id: String,
) : Persistable<String> {
    @Transient private var _persisted: Boolean = false
    override fun getId(): String = id
    override fun isNew(): Boolean = !_persisted          // 로드/영속 전이면 new
    @PostLoad @PostPersist fun markPersisted() { _persisted = true }
}
```
- JDBC `ON CONFLICT` upsert 대상에 특히 유용(불필요한 존재 확인 SELECT 제거).

## 읽기 전용 미러 엔티티
- 외부 시스템에서 동기화된 읽기 전용 미러 엔티티는 **소스 타임스탬프를 `val`로 보존**하고,
  로컬 auditing(`@CreatedDate`/`@LastModifiedDate`)은 **생략**한다. 로컬이 시각의 출처가 아니므로.
