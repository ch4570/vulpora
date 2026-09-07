---
title: Java 동시성 (메모리 모델·java.util.concurrent)
source: https://docs.oracle.com/javase/specs/jls/se21/html/jls-17.html (JMM) + Effective Java 3rd Items 78-84
last_fetched: 2026-06-24
consumers: [java-reviewer]
---

# KB: Java 동시성 (메모리 모델·java.util.concurrent)

## 리뷰 훅 (이걸 점검하라)
- [ ] **공유 가변 상태에 동기화가 있는가**(EJ Item 78). 읽기·쓰기 **양쪽** 동기화 — 한쪽만이면 가시성
      미보장. 동기화 없으면 다른 스레드가 변경을 영원히 못 볼 수 있다(JLS §17 happens-before 부재).
- [ ] **`volatile`을 원자성에 오용**하지 않는가. volatile은 **가시성만** 보장하고 복합연산(`count++`,
      check-then-act)은 원자 아님 → `AtomicInteger`/`AtomicLong`/락 사용.
- [ ] **싱글톤/static 가변 필드 공유** → 스레드 안전 점검. 가능하면 **불변** 또는 **thread confinement**
      (스레드 국소화). 가변 공유면 `synchronized`/`Atomic`/`Concurrent*`.
- [ ] **`HashMap`을 다중 스레드에서 쓰는가** → `ConcurrentHashMap`. `Collections.synchronizedMap`은 복합
      연산(반복 중 수정·putIfAbsent) 미보호.
- [ ] **check-then-act 레이스**(예: `if (!map.containsKey) map.put`) → `computeIfAbsent`/`putIfAbsent` 원자 연산.
- [ ] **락 순서 일관**한가(데드락 회피). 중첩 락 획득 순서가 코드마다 다르면 데드락. 락 보유 중 외계
      메서드(콜백·오버라이드) 호출 금지(EJ Item 79 과도한 동기화).
- [ ] **스레드 직접 생성보다 `ExecutorService`**(EJ Item 80). `wait/notify`보다 `java.util.concurrent`
      고수준 유틸(`CountDownLatch`·`BlockingQueue`·`CompletableFuture`)(EJ Item 81).
- [ ] **이중검사 락(DCL) 안티패턴** — 필요하면 대상 필드 `volatile`. 더 단순한 대안(holder idiom·enum) 우선.
- [ ] **`Thread.stop`/`suspend`** 등 폐기 API, **busy-wait** 루프 금지.

## 근거 (요지)
- **JMM happens-before(JLS §17.4)**: 한 스레드의 쓰기가 다른 스레드에 보이려면 happens-before 관계가
  필요하다. 동기화(`synchronized` 모니터 진입/해제, `volatile` 읽기/쓰기, 스레드 시작/조인)가 이 관계를
  성립시킨다. 없으면 **가시성 미보장**(낡은 값·재정렬 관찰 가능).
- **synchronized = 상호배제 + 가시성**(Item 78). 둘 다 필요. 읽기만 하는 쪽도 동기화해야 최신값을 본다.
- **volatile = 가시성 only**: 단일 읽기/쓰기 가시성은 보장하나 복합연산 원자성은 아니다.
- **불변 객체는 본질적으로 스레드 안전**(Item 17) — 안전 발행 후 동기화 없이 공유 가능.
- **고수준 동시성 유틸 선호**(Item 80·81): Executor 프레임워크·동시성 컬렉션·동기화 장치가 저수준
  `wait/notify`보다 안전하고 명확하다.

## 인용 시
"JLS §17.4 / EJ Item 78 — 읽기 측 동기화 부재로 happens-before 미성립, 가시성 미보장" 식으로 근거를 단다.
정상 경로에서 재현되는 레이스만 HIGH+로, 공유 여부 미확인이면 MEDIUM + 의도 확인.
