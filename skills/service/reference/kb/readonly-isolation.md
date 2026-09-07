---
title: readOnly 의미와 격리 수준(Isolation) / timeout
source: https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/annotations.html
last_fetched: 2026-06-24
skills: [service]
---

# readOnly 의미와 격리 수준(Isolation) / timeout

## readOnly = true 의미와 최적화

`@Transactional(readOnly = true)`는 "이 트랜잭션은 쓰기를 하지 않는다"는 **힌트**다. 강제 차단이 아니라 하위 계층에 최적화 여지를 주는 신호다.

- **JPA/Hibernate:** 영속성 컨텍스트를 읽기 전용 모드로 두어 더티 체킹(flush) 비용과 스냅샷 보관을 줄일 수 있다.
- **JDBC 드라이버/DB:** 일부 드라이버·DB는 read-only 연결로 표시되어 최적화하거나, 읽기 복제본 라우팅 같은 전략의 신호로 쓰인다.
- 주의: `readOnly`가 실제 쓰기를 **물리적으로 막아준다고 보장하지는 않는다.** 안전 기본값일 뿐, 쓰기 메서드는 명시적으로 `readOnly`를 해제해야 한다.

권장: 클래스 레벨 기본 `readOnly = true`, 쓰기 메서드만 메서드 레벨 재정의(`transactional-basics.md` 참조).

## 격리 수준(Isolation)

`@Transactional(isolation = Isolation.X)`로 지정. Spring의 `Isolation` enum과 표준 격리 수준 대응:

| Spring `Isolation` | 의미 | 막는 현상 |
|---|---|---|
| `DEFAULT` | 하위 DataSource/DB 기본값 사용 | — |
| `READ_UNCOMMITTED` | 커밋 안 된 데이터 읽기 허용 | (없음 — dirty read 발생) |
| `READ_COMMITTED` | 커밋된 데이터만 읽음 | dirty read |
| `REPEATABLE_READ` | 같은 행 재조회 시 동일 | dirty read, non-repeatable read |
| `SERIALIZABLE` | 직렬 실행과 동등 | dirty/non-repeatable read, phantom read |

- 대부분의 DB 기본값은 `READ_COMMITTED`다(일부 엔진은 `REPEATABLE_READ`가 기본). 정확한 기본은 사용하는 DB에 따른다.
- 격리 수준이 높을수록 일관성은 강해지지만 **락·경합·직렬화 실패(재시도 필요)**가 늘어난다. 필요한 보장만 선택한다.
- DB 차원의 격리/이상현상(anomaly) 일반론은 사용 중인 DB 문서와 교차 참조한다.

## timeout

`@Transactional(timeout = N)`(초)로 트랜잭션 최대 시간을 건다. 장시간 락/커넥션 점유를 방지하는 안전장치다. 외부 I/O를 트랜잭션 안에 두지 않는다는 원칙(`transaction-boundaries.md`)과 함께 적용한다.

```kotlin
@Transactional(isolation = Isolation.READ_COMMITTED, timeout = 5)
open fun reserveStock(productId: Long, qty: Int) { /* ... */ }
```

## 리뷰 훅
- [ ] 읽기 메서드/클래스에 `readOnly = true`가 적용되어 있는가?
- [ ] 쓰기 메서드가 `readOnly` 기본값을 명시적으로 해제했는가?
- [ ] 격리 수준을 올렸다면 그 보장이 정말 필요한가? (경합·재시도 비용 인지)
- [ ] 높은 격리(`SERIALIZABLE`/`REPEATABLE_READ`)에서 직렬화 실패 시 재시도 전략이 있는가?
- [ ] 장시간 가능 트랜잭션에 `timeout`을 걸었는가?
