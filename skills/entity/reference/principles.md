# JPA 엔티티 설계 핵심 원칙 (Principles)

> 이 문서는 JPA/Hibernate/Kotlin **공식 문서**로 검증한 엔티티 설계 실무 원칙 모음이다.
> 에이전트와 스킬이 판단의 근거로 삼는 "헌법" 역할을 한다. KB는 그 원칙의 공식 문서 근거·세부 규칙.
>
> **출처(Sources)**
> - Jakarta Persistence 3.2 Specification — https://jakarta.ee/specifications/persistence/3.2/jakarta-persistence-spec-3.2
> - Hibernate ORM 6/7 User Guide — https://docs.jboss.org/hibernate/orm/6.6/userguide/html_single/Hibernate_User_Guide.html
> - Kotlin Language Documentation — https://kotlinlang.org/docs/home.html
> - Spring Framework Kotlin Support / Spring Data JPA Reference
>
> **충돌 시 우선순위**: KB(공식문서)가 principles보다 **우선**한다. principles는 통찰·판단 기준을
> 보태고, 구체적 규칙·버전별 동작은 KB의 `source`를 근거로 삼는다.

---

## 1. 엔티티 식별성: equals/hashCode는 비즈니스 키로 (생성 id 금지)

- 엔티티의 동일성(identity)은 **영속 생애주기 내내 안정적**이어야 한다. `equals`/`hashCode`를
  **DB가 생성하는 id(@GeneratedValue)** 에 의존하면, 영속 전에는 id가 `null`이라 같은 객체가
  영속 전후에 서로 다르게 취급된다. `Set`/`Map`에 담아둔 뒤 flush되면 정체성이 깨진다.
- 권장: **불변 비즈니스 키(natural key)** 로 equals/hashCode를 정의한다. 적절한 자연키가 없으면
  **애플리케이션이 생성·할당하는 UUID 등 안정 식별자**를 사용한다(영속 전에 이미 값이 있음).
- `hashCode`는 **모든 상태에서 동일한 상수**를 돌려주는 패턴도 허용된다(컬렉션 버킷팅 비용 ↔
  정체성 안정성의 trade-off). 상세는 `kb/equals-hashcode.md`.

## 2. 식별자 생성 전략 trade-off

- `IDENTITY`는 INSERT 시점에 키가 결정되므로 Hibernate의 **JDBC batch insert를 비활성화**한다
  (대량 삽입 성능 저하). 대량 적재가 중요하면 `SEQUENCE` + 적절한 `allocationSize`를 고려한다.
- `SEQUENCE`는 키를 미리 받아올 수 있어 batch에 유리하나, `allocationSize`와 실제 시퀀스
  `INCREMENT BY`가 어긋나면 키 충돌·구멍이 생긴다.
- **자연키 vs 인조키(surrogate)**: 인조키는 안정적이고 join이 단순하지만, 비즈니스 유일성은
  별도 `UNIQUE` 제약으로 반드시 강제해야 한다. 자연키는 의미가 있으나 변경 가능성이 위험.
- 상세는 `kb/identity-strategies.md`.

## 3. 연관관계의 방향성과 소유(owning side)

- 모든 양방향 연관관계는 **소유측이 단 하나**다. `mappedBy`가 붙은 쪽은 **비소유(inverse)** 이며,
  FK를 들고 있는 쪽이 소유측이다. 소유측의 변경만 DB에 반영된다.
- 양방향을 쓸 때는 **양쪽 컬렉션/참조를 함께 갱신**하는 편의 메서드를 두어 메모리 상태와 DB
  상태가 어긋나지 않게 한다.
- `cascade`와 `orphanRemoval`은 **부모-자식 생명주기가 진짜 종속일 때만** 건다. 남용하면 의도치
  않은 삭제가 전파된다. 상세는 `kb/associations-fetching.md`.

## 4. 지연 로딩이 기본, N+1을 항상 의심하라

- `@ManyToOne`/`@OneToOne`의 기본 fetch는 **EAGER**라 위험하다 — 명시적으로 `LAZY`로 두는 것을
  기본 원칙으로 삼는다(`@OneToMany`/`@ManyToMany`는 이미 LAZY 기본).
- 컬렉션을 루프에서 접근하면 **N+1 쿼리**가 터진다. 필요한 그래프는 **fetch join 또는
  `@EntityGraph`** 로 한 번에 가져온다. "지연 로딩 + 필요 시 명시적 fetch"가 정석.

## 5. 영속성 경계: 엔티티는 도메인 모델/DTO와 분리한다

- 엔티티는 **영속 계층의 구현 세부**다. API 응답·도메인 로직·외부 모듈에 엔티티를 그대로
  노출하지 않는다. 도메인 **model** + `mapper`로 경계를 긋는다.
- 이유: (a) 지연 로딩 프록시가 영속 컨텍스트 밖에서 터지는 `LazyInitializationException`,
  (b) 직렬화 시 의도치 않은 연관 그래프 로딩, (c) DB 스키마 변경이 외부 계약으로 새어나가는 결합.

## 6. Kotlin `data class`를 엔티티로 쓰면 안 되는 이유

- `data class`는 `equals`/`hashCode`/`toString`/`copy`를 **모든 프로퍼티 기준으로 자동 생성**한다.
  이는 (a) 연관 필드를 건드려 **지연 로딩을 강제 트리거**하고, (b) 생성 id 기반 정체성을
  깨뜨리며(원칙 1 위반), (c) `copy`로 엔티티를 복제하는 안티패턴을 유도한다.
- 엔티티는 **일반 `class`** 로 선언하고, JPA가 프록시·리플렉션을 쓸 수 있도록 **`open`**
  (all-open / kotlin-jpa 플러그인)과 **no-arg 생성자**(no-arg 플러그인)를 갖춰야 한다.
- 상세는 `kb/kotlin-entity-pitfalls.md`.

## 7. 불변 지향, 그러나 식별자·가변 상태는 현실적으로

- 변경되지 않는 필드는 `val` + `@Column(updatable = false)` 로 못박아 의도를 코드와 스키마 양쪽에
  표현한다(불변 지향: 공용 코딩 규약과 일치).
- 단, 엔티티는 **dirty checking**과 식별자 지연 할당 때문에 일부 가변성이 불가피하다. auditing
  타임스탬프, 낙관적 락 `@Version`, 상태 전이 필드는 `var`가 정당하다.
- 원칙: **기본은 불변(`val`)**, 가변은 **영속 메커니즘이 요구하는 최소 범위**로 한정한다.

## 8. 무결성은 DB에 건다 (애플리케이션 검증만 믿지 않는다)

- `nullable = false`, `length`, `unique`, `@Column(updatable = false)`, FK 제약은 **DB 스키마에서
  강제**한다. 애플리케이션 검증은 UX이고, 데이터 정합성의 최후 보루는 DB다.
- 영속 변경(컬럼 추가/제약 변경)은 **같은 변경 단위에 DB 마이그레이션**을 동반한다.

---

## 원칙 ↔ KB 매핑

| 원칙 | 근거 KB |
|------|---------|
| 1. 식별성 | `equals-hashcode.md` |
| 2. 식별자 전략 | `identity-strategies.md` |
| 3·4. 연관/페치 | `associations-fetching.md` |
| 5·8. 경계/상태 | `entity-lifecycle-state.md`, `entity-mapping-basics.md` |
| 6. Kotlin | `kotlin-entity-pitfalls.md` |
