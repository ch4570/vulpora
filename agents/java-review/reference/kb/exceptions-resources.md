---
title: Java 예외·리소스 관리
source: https://docs.oracle.com/javase/tutorial/essential/exceptions/
last_fetched: 2026-06-24
consumers: [java-reviewer]
---

# KB: Java 예외·리소스 관리

## 리뷰 훅 (이걸 점검하라)
- [ ] **예외를 삼키지 않는가**(EJ Item 77). 빈 `catch {}`·`catch { /* ignore */ }`·로그만 찍고 정상
      흐름 지속 금지. 최소한 로깅 + 적절한 전파/변환.
- [ ] **try-with-resources를 쓰는가**(EJ Item 9). `Closeable`/`AutoCloseable`(Stream·Connection·
      InputStream 등)은 try-with-resources로 자동 닫음. 수동 `finally close()`는 누수·억제예외 손실
      위험(close 중 예외가 본문 예외를 가림).
- [ ] **리소스 누수**: `new FileInputStream`·`Connection`·`Statement`·`ResultSet`·소켓이 모든 경로(예외
      포함)에서 닫히는가. 루프 안 미닫힌 리소스 누적 → 핸들 고갈(CRITICAL 후보).
- [ ] **checked vs unchecked 적절**(EJ Item 70·71): 호출자가 복구 가능하면 checked, 프로그래밍 오류
      (계약 위반·null)는 unchecked(`IllegalArgumentException`/`IllegalStateException`/`NPE`). checked 남용은
      API를 무겁게 함.
- [ ] **예외 변환·연쇄**(EJ Item 73): 저수준 예외를 추상화 수준에 맞게 변환하되 **원인 보존**
      (`new XException(msg, cause)`). 원인 없이 삼키고 새 예외 던지면 디버깅 정보 손실.
- [ ] **finally 함정**: `finally`에서 `return`/`throw` 금지(본문 예외를 덮어씀). 리소스 정리는
      try-with-resources로 대체.
- [ ] **예외로 흐름 제어** 금지(EJ Item 69) — 예외는 예외적 상황에만. 루프 종료를 예외로 처리하지 말 것.
- [ ] **`Throwable`/`Error`/`Exception` 광범위 캐치** 주의 — `InterruptedException`을 삼키면 인터럽트
      상태 손실(다시 던지거나 `Thread.currentThread().interrupt()`로 복원).
- [ ] **상세 메시지에 진단 정보**(EJ Item 75) 포함, 단 민감정보(시크릿·PII) 노출 금지.

## 근거 (요지)
- **try-with-resources**(Oracle 튜토리얼): try 괄호에 선언한 `AutoCloseable`은 정상/예외 종료 모두에서
  역순으로 자동 close. 본문과 close가 둘 다 예외면 close 예외는 **억제(suppressed)** 되어 본문 예외에
  부착되므로 정보 손실이 없다 — 수동 finally의 고전적 함정을 제거한다.
- **예외 분류**: checked는 메서드 시그니처로 복구 가능성을 알린다. unchecked(런타임)는 프로그래밍 오류.
- **예외 연쇄**: cause를 보존하면 근본 원인 추적이 가능하다.
- **인터럽트**: `InterruptedException`은 협력적 취소 신호 — 삼키면 취소가 무력화된다.

## 인용 시
"EJ Item 9 / Oracle try-with-resources — 수동 finally close로 예외 경로 누수 + 억제예외 손실" 식.
모든 경로에서 닫히는지 grep/Read로 확인 후 누수를 단정(미확인이면 MEDIUM 상한).
