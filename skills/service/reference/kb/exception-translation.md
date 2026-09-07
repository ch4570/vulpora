---
title: 예외 번역 — DataAccessException 계층과 도메인 예외
source: https://docs.spring.io/spring-framework/reference/data-access/dao.html
last_fetched: 2026-06-24
skills: [service]
---

# 예외 번역 — DataAccessException 계층과 도메인 예외

## Spring의 DataAccessException 계층

Spring은 다양한 영속 기술의 예외를 **일관된 비검사(unchecked) 예외 계층**인 `org.springframework.dao.DataAccessException`으로 번역한다.

- JDBC `SQLException`, JPA provider 예외(Hibernate 등)는 기술마다 다르고 대부분 검사 예외이거나 provider 고유 타입이다.
- Spring은 이를 기술 독립적인 의미 단위로 번역한다: 예) `DataIntegrityViolationException`, `DuplicateKeyException`, `OptimisticLockingFailureException`, `CannotAcquireLockException`, `DataAccessResourceFailureException`.
- 모두 **비검사 예외**라서 상위 계층이 강제로 catch할 필요가 없고, 의미 단위로 선택적으로 처리할 수 있다.

## 번역은 어떻게 켜지나 — @Repository

- `@Repository`가 붙은 빈은 `PersistenceExceptionTranslationPostProcessor`에 의해 프록시되어 provider 예외를 Spring `DataAccessException` 계층으로 자동 번역한다.
- 즉 repository 구현은 `@Repository`로 표시되어야 이 번역 혜택을 받는다(Spring Data repository는 기본 적용).

## 서비스의 책임: 다시 도메인 예외로 번역

영속 계층 예외(`DataAccessException`)를 **상위로 그대로 누출하지 않는다.** 서비스가 의미 있는 **도메인 예외**로 한 번 더 번역해 호출자에게 안정적 계약을 준다.

```kotlin
@Transactional
open fun register(member: Member) {
    try {
        memberRepository.save(member)
    } catch (e: DuplicateKeyException) {            // Spring 번역된 비검사 예외
        throw MemberAlreadyExistsException(member.email, e)   // 도메인 예외로 재번역
    }
}
```

원칙:
- 컨트롤러/리스너는 `SQLException`이나 JPA provider 타입을 **알면 안 된다.** 영속 세부가 계층을 넘지 않는다.
- 낙관적 락 실패(`OptimisticLockingFailureException`)처럼 **재시도 가능한** 예외와 영구 실패(제약 위반)를 구분해 호출자가 적절히 대응하도록 한다.
- 예외 메시지에 SQL/스키마 같은 내부 세부를 노출하지 않는다(정보 누출 방지).

## 멱등성과의 연결

- `DuplicateKeyException`은 멱등성의 안전망이기도 하다(`idempotency.md`). unique 제약 위반을 "이미 처리됨"으로 해석해 no-op 처리할 수 있다.

## 리뷰 훅
- [ ] repository가 `@Repository`(또는 Spring Data)로 예외 번역이 적용되는가?
- [ ] 서비스가 `DataAccessException`을 도메인 예외로 재번역하는가?
- [ ] 컨트롤러/리스너로 `SQLException`/JPA provider 예외가 누출되지 않는가?
- [ ] 재시도 가능 예외(낙관적 락 등)와 영구 실패를 구분 처리하는가?
- [ ] 예외 메시지에 SQL/스키마 등 내부 세부를 노출하지 않는가?
