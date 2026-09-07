# Repository(영속 접근) 핵심 원칙 (Principles)

> 이 문서는 Spring Data JPA·Jakarta Persistence·Spring Framework 공식 문서로 검증한 영속 접근 계층의
> 실무 원칙 모음이다. 에이전트와 스킬이 판단의 근거로 삼는 "헌법" 역할을 한다. 상충 시 KB(공식 문서
> 근거, `kb/`)가 우선하고, 본 원칙은 상위 통찰을 보탠다.
>
> **출처(Sources)**
> - Spring Data JPA Reference (docs.spring.io/spring-data/jpa/reference)
> - Jakarta Persistence 3.2 Specification (jakarta.ee/specifications/persistence/3.2)
> - Spring Framework — Data Access / Transaction Management (docs.spring.io/spring-framework/reference)

---

## 1. 리포지토리는 영속 접근만 책임진다 (트랜잭션은 서비스가 소유)

- 리포지토리의 단일 책임은 **저장소 접근(CRUD·조회)** 이다. 도메인 규칙·여러 집계의 조율·트랜잭션
  경계는 **서비스 계층**이 소유한다.
- 컨트롤러/리스너가 리포지토리를 직접 의존하지 않는다. 항상 서비스를 경유한다(계층 경계 유지).

## 2. 추상화(인터페이스)·파생 쿼리 우선, 복잡하면 @Query/QueryDSL

- 기본은 `JpaRepository`를 상속한 **인터페이스**. Spring Data가 구현체를 자동 생성한다.
- 단순 조회는 **파생 쿼리 메서드**(`findBy…`, `existsBy…`, `countBy…`)로 표현한다.
- 메서드 이름이 길어지거나 표현이 어려워지면 **`@Query`(JPQL/native)** 로, 동적·복합 조회는
  **QueryDSL**(`*AggregateRepository` 클래스)로 분리한다.

## 3. 페이지네이션은 필수 (무한 조회 금지)

- 다건 조회는 `Pageable`/`Page`/`Slice`로 반드시 페이징한다. 경계 없는 `findAll()` 류는 금지.
- 전체 건수(`count`)가 불필요하면 **`Slice`** 로 count 쿼리를 회피한다.
- 대용량에서 깊은 `OFFSET`은 비용이 크다 → **keyset/cursor 페이지네이션**을 우선 고려한다.

## 4. N+1은 fetch join / @EntityGraph로 제거한다

- LAZY 연관을 반복 접근하면 N+1 쿼리가 터진다. **`join fetch`(JPQL)** 또는 **`@EntityGraph`** 로
  필요한 연관을 한 번에 적재한다.
- 컬렉션 fetch join + 페이징은 **메모리 페이징** 경고를 유발한다 → batch size·DTO projection으로 대응.

## 5. 읽기 전용 트랜잭션을 명시한다

- 조회 전용 경로는 **`@Transactional(readOnly = true)`** 로 표시한다(flush·dirty checking 생략으로 최적화).
- 트랜잭션 전파(`propagation`)와 경계는 서비스에서 의식적으로 설계한다.

## 6. JPA 우선, 표현 불가할 때만 JDBC (대량 ON CONFLICT)

- 기본은 JPA/JPQL. **JPA/JPQL로 표현 불가한 것**(대량 `INSERT ... ON CONFLICT DO UPDATE` 배치 upsert)에만
  JDBC(`*JdbcRepository` 클래스)를 쓴다.
- `ON CONFLICT`는 **mutable 컬럼만 갱신**하고 `created_at` 같은 불변 컬럼은 보존한다. SQL은 상수로 관리.

## 7. 타입 기반 주입·빈명 충돌 회피

- 생성자 주입 + **타입 기반**(문자열 `@Qualifier` 지양)으로 의존성을 받는다.
- 빈 이름은 인프라/내장 빈과 충돌하지 않게 짓는다(예: 엔티티가 "Job"이면 리포지토리 이름이 Spring Batch
  내장 `jobRepository` 빈과 충돌). 기본 `allowBeanDefinitionOverriding=false`에서 충돌은 **부팅 실패**다.

---

## KB 우선

세부 규칙·코드 근거는 `kb/` 파일에 있다. 판단 시 해당 KB를 먼저 읽고, 그 "리뷰 훅"으로 점검하며,
지적할 때 KB의 `source` URL을 근거로 인용한다. 색인은 [`kb/INDEX.md`](kb/INDEX.md).
