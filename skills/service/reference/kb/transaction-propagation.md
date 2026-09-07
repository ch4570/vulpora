---
title: 트랜잭션 전파(Propagation) 의미와 선택
source: https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/tx-propagation.html
last_fetched: 2026-06-24
skills: [service]
---

# 트랜잭션 전파(Propagation) 의미와 선택

전파는 "서비스 메서드가 호출될 때 **기존 트랜잭션과 어떻게 결합/분리**되는가"를 정한다. 기본값에 기대지 말고 의도적으로 고른다.

## 전파 옵션 의미

| Propagation | 기존 트랜잭션 있을 때 | 없을 때 |
|---|---|---|
| `REQUIRED` (기본) | 기존 트랜잭션에 **참여** | 새 트랜잭션 시작 |
| `REQUIRES_NEW` | 기존을 **중단(suspend)**하고 **새 독립 트랜잭션** 시작 | 새 트랜잭션 시작 |
| `NESTED` | 기존 트랜잭션 안에 **세이브포인트** 생성(부분 롤백 가능) | 새 트랜잭션 시작 |
| `SUPPORTS` | 참여 | 트랜잭션 없이 실행 |
| `NOT_SUPPORTED` | 기존을 중단하고 **비트랜잭션**으로 실행 | 비트랜잭션으로 실행 |
| `MANDATORY` | 참여 | **예외**(트랜잭션 필수) |
| `NEVER` | **예외**(트랜잭션이 있으면 안 됨) | 비트랜잭션으로 실행 |

## 언제 REQUIRES_NEW인가

호출자 트랜잭션과 **독립적으로 자체 커밋**되어야 하는 쓰기에 쓴다.

- 배치 chunk의 resourceless(자원 없는) 트랜잭션, 또는 Kafka 리스너 컨텍스트와 **분리**해 항목별 쓰기가 호출자 롤백에 휘말리지 않게 한다.
- 호출자가 실패해도 보존되어야 하는 기록(감사 로그, 이벤트 적재).
- 멱등 핸들러가 항목 단위로 커밋·재시도되어야 할 때(`idempotency.md` 참조).

```kotlin
// 호출자(배치/리스너) 트랜잭션과 분리되어 자체 커밋
@Transactional(propagation = Propagation.REQUIRES_NEW)
open fun bulkUpsert(models: List<Order>) {
    orderJdbcRepository.upsert(models)
}
```

## 중단(suspension) 비용 주의

- `REQUIRES_NEW`/`NOT_SUPPORTED`는 기존 트랜잭션을 **중단**시킨다. 이때 트랜잭션 리소스(커넥션)를 추가로 잡으므로 비용이 있다. 외부 트랜잭션이 살아있는 동안 내부 `REQUIRES_NEW`가 별도 커넥션을 점유 → **커넥션 풀 고갈** 위험. 남용하지 않는다.
- 외부 트랜잭션이 롤백되어도 이미 커밋된 `REQUIRES_NEW` 결과는 **롤백되지 않는다.** 이 분리가 의도된 것인지 항상 확인한다.

## NESTED vs REQUIRES_NEW

- `NESTED`는 같은 물리 트랜잭션 내 **세이브포인트**다. 외부가 롤백되면 함께 롤백된다(부분 롤백만 독립). JDBC 세이브포인트를 지원하는 드라이버/매니저가 필요하다.
- `REQUIRES_NEW`는 **완전히 별개의 물리 트랜잭션**으로 독립 커밋된다.

## 리뷰 훅
- [ ] 전파를 기본값에 맡기지 않고 의도적으로 선택했는가?
- [ ] `REQUIRES_NEW`를 쓴 이유(호출자와 분리·자체 커밋)가 분명한가?
- [ ] `REQUIRES_NEW`/`NOT_SUPPORTED`의 중단 비용·커넥션 점유를 고려했는가? (풀 고갈)
- [ ] 외부 롤백 시 내부 `REQUIRES_NEW`가 살아남는 것이 의도된 동작인가?
- [ ] 부분 롤백만 필요하면 `NESTED`가 더 적합하지 않은가?
