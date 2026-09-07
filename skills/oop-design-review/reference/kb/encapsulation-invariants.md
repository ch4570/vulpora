---
title: 캡슐화·정보은닉·불변식
source: David Parnas, "On the Criteria To Be Used in Decomposing Systems into Modules"(CACM 1972) + Joshua Bloch, "Effective Java"(3rd ed.) Item 15·16·17·50
last_fetched: 2026-06-24
skills: [oop-design-review]
---

# KB: 캡슐화 · 정보은닉 · 불변식

핵심 명제: **변경될 가능성이 높은 결정(설계 비밀)을 모듈 안에 숨겨라**(Parnas). 클래스는
자신의 **불변식(invariant)** 을 스스로 보장하는 자율적 단위여야 한다. 빈약한 데이터 가방이 아니다.

## 정보은닉 (Parnas, 1972)
- 모듈 분해 기준은 "처리 순서(flowchart)"가 아니라 **"각 모듈이 감추는 설계 결정"**.
- 한 모듈은 자신의 비밀(자료 표현, 알고리즘, 외부 포맷 등)을 인터페이스 뒤로 숨긴다. 비밀이 바뀌어도 외부 불변.
- 효과: 변경 파급 국소화, 병렬 개발, 이해 용이.

## 캡슐화 (Effective Java Item 15)
- **접근 제어를 최소화**하라: 가능한 한 `private`. public 필드 금지(가변이면 불변식·스레드안전·표현 변경 불가).
- public 클래스는 필드를 직접 노출하지 말고 **접근자(메서드)** 로. 단 게터/세터를 기계적으로 다는 것은
  캡슐화가 아니다 — 행동을 노출하라(Tell, Don't Ask).
- public **가변** 정적 필드, public 가변 컬렉션 노출 금지.

## 클래스 불변식 (Class Invariant)
- 정의: 객체가 **생성 직후부터 소멸까지 항상 참**이어야 하는 조건(예: 잔액 ≥ 0, 시작일 ≤ 종료일).
- 보장 위치: **생성자에서 검증**하고, 상태를 바꾸는 모든 메서드가 불변식을 유지한다. 무효 상태의 객체가 존재하지 못하게.
- 세터를 무분별하게 두면 불변식을 항상 깰 수 있게 되어 위험 → 변경은 의도 드러내는 메서드로만.
```kotlin
class Period(val start: LocalDate, val end: LocalDate) {
    init { require(!start.isAfter(end)) { "start must be <= end" } } // 불변식
}
```

## 불변성 (Immutability, Effective Java Item 17)
- 불변 클래스 규칙: ① 상태 변경 메서드 없음 ② 상속 차단(`final`/`sealed`) ③ 모든 필드 `final/val`
  ④ 모든 필드 `private` ⑤ 가변 컴포넌트는 외부와 공유 금지.
- 장점: 스레드 안전(공유 가능), 검증·캐싱·자유로운 공유, 실패 원자성(failure atomicity) 자연 확보.
- 가변이 꼭 필요하면 변경 가능 범위를 최소화.

## 방어적 복사 (Defensive Copy, Effective Java Item 50)
- 생성자/접근자에서 **가변 컴포넌트를 그대로 저장/반환하지 마라** — 외부가 내부 불변식을 깨뜨린다.
- 생성자: 매개변수를 **복사한 뒤 검증 순서**(복사본 검증, TOCTOU 방지). 게터: 내부 가변 객체의 복사본 반환 또는 읽기전용 뷰.
```kotlin
class Reservation(items: List<Item>) {
    private val items = items.toList()                  // 입력 방어 복사
    fun getItems(): List<Item> = items.toList()         // 반환 방어 복사 (또는 불변 뷰)
}
```

## Tell, Don't Ask
- 객체의 상태를 **꺼내 와서 호출자가 판단**(Ask)하지 말고, 객체에게 **시켜라**(Tell). 데이터와 그 데이터를 쓰는 로직을 같은 곳에.
- 위반: `if (account.getBalance() >= amount) account.setBalance(...)` → `account.withdraw(amount)`.

## 리뷰 훅
- [ ] 필드가 `private/val`로 최소 공개되었는가. public 가변 필드/가변 컬렉션을 그대로 노출하지 않는가.
- [ ] **불변식**이 생성자에서 검증되고, 무효 상태의 객체가 만들어질 수 없는가.
- [ ] 무의미한 세터로 언제든 불변식을 깰 수 있게 두지 않았는가. 변경이 의도 드러내는 메서드로만 일어나는가.
- [ ] 가변 컴포넌트를 **방어적 복사** 없이 저장/반환하지 않는가(생성자는 복사 후 검증).
- [ ] 불변으로 둘 수 있는 값 객체가 가변으로 새고 있지 않은가.
- [ ] **Tell, Don't Ask**: 게터로 상태를 꺼내 호출자가 판단/변경하는 코드를 객체 메서드로 위임했는가.
- [ ] 모듈이 감추는 "설계 비밀"이 분명한가(Parnas) — 표현/알고리즘 변경이 외부로 새지 않는가.
