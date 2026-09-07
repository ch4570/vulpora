---
title: 멱등성 — 재시도/중복 전달에 안전한 서비스
source: https://www.rfc-editor.org/rfc/rfc9110.html#section-9.2.2
last_fetched: 2026-06-24
skills: [service]
---

# 멱등성 — 재시도/중복 전달에 안전한 서비스

> 멱등성의 표준 정의: "동일한 요청을 한 번 보낸 효과와 여러 번 보낸 효과가 서버 상태 관점에서 동일하다." (RFC 9110 §9.2.2, HTTP idempotent methods)
> 추가 참조: Spring Retry 개념 — <https://docs.spring.io/spring-batch/reference/retry.html>

## 왜 필요한가

분산 시스템에서 **재시도와 중복 전달은 정상**이다. 이런 작업은 핸들러가 멱등하지 않으면 중복 처리로 이어진다.

- **at-least-once 전달**(Kafka 등 메시지 소비)은 같은 메시지를 한 번 이상 전달할 수 있다 → 소비 핸들러는 반드시 멱등해야 한다.
- 배치 재실행, 클라이언트/게이트웨이 재시도, 네트워크 타임아웃 후 재전송도 같은 입력을 다시 적용한다.

## 멱등하게 만드는 기법

1. **Upsert (`ON CONFLICT` / merge)**
   - 키 충돌 시 삽입 대신 갱신 → 같은 입력을 여러 번 적용해도 행이 하나로 수렴.
   ```kotlin
   @Transactional(propagation = Propagation.REQUIRES_NEW)
   open fun bulkUpsert(members: List<Member>) {
       memberJdbcRepository.upsert(members)   // INSERT ... ON CONFLICT ... DO UPDATE
   }
   ```
2. **멱등성 키(idempotency key)**
   - 요청/메시지마다 고유 키를 부여하고, 처리 전 키 존재를 확인(unique 제약 또는 처리 기록 테이블). 이미 처리된 키면 no-op으로 반환.
3. **중복 제거(dedup)**
   - 이벤트 ID/오프셋/버전으로 이미 처리한 항목을 건너뛴다(예: `processed_event` 테이블, `WHERE version > current`).
4. **자연 멱등 연산**
   - "상태를 X로 설정" 같은 절대값 설정은 멱등. "수량 +1" 같은 상대 증감은 멱등이 아니므로 멱등성 키와 함께 보호한다.

## 재시도 + REQUIRES_NEW 상호작용

- 항목 단위로 **자체 커밋**되는 쓰기(`REQUIRES_NEW`)는 부분 실패 후 실패 항목만 재시도하기 좋다(`transaction-propagation.md`).
- 단, 재시도되는 핸들러가 멱등하지 않으면 "이미 커밋된 항목 + 재시도"가 중복을 만든다 → **재시도 경로는 항상 멱등 연산 위에 올린다.**
- 멱등성 키 확인과 쓰기를 **같은 트랜잭션** 안에서 원자적으로 처리해 "확인 후 쓰기" 사이의 경쟁을 막는다(unique 제약을 안전망으로 둔다).

## 리뷰 훅
- [ ] at-least-once 소비(Kafka 등) 핸들러가 멱등한가?
- [ ] 중복 입력에 대해 upsert / 멱등성 키 / dedup 중 하나로 보호하는가?
- [ ] 상대 증감(+1 등) 연산을 멱등성 키 없이 재시도 경로에 노출하지 않았는가?
- [ ] 멱등성 키 확인과 쓰기가 원자적인가? (unique 제약 안전망 포함)
- [ ] `REQUIRES_NEW` 자체 커밋 + 재시도 조합이 멱등 연산 위에서 동작하는가?
