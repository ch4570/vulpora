---
title: Java 언어 관용구 (Effective Java 핵심)
source: Effective Java 3rd ed (Joshua Bloch) + https://docs.oracle.com/en/java/
last_fetched: 2026-06-24
consumers: [java-reviewer]
---

# KB: Java 언어 관용구 (Effective Java 핵심)

## 리뷰 훅 (이걸 점검하라)
- [ ] **생성자 파라미터가 많은가**(특히 선택적 다수) → 텔레스코핑/세터 대신 **빌더**(EJ Item 2). 정적
      팩토리 메서드로 이름·캐싱·하위타입 반환 이점이 있는지(EJ Item 1).
- [ ] **`equals` 재정의 시 `hashCode`도 재정의했는가**(EJ Item 11). 안 하면 HashMap/HashSet 키로 깨짐.
- [ ] **`equals` 규약**: 반사·대칭·추이·일관·non-null(EJ Item 10). `instanceof` 사용, 상속으로 대칭/추이
      깨지지 않는지(상속보다 컴포지션).
- [ ] **`compareTo`가 `equals`와 일관**되는가(EJ Item 14). 부호만 보장하면 되며 뺄셈 비교는 오버플로
      위험 → `Integer.compare`/`Comparator` 사용.
- [ ] **불변 클래스인가**(EJ Item 17): final 클래스/필드, 세터 없음, 가변 컴포넌트 방어적 복사. 가변이면
      변경 범위 최소화.
- [ ] **싱글톤/인스턴스 통제**: 상태 없는 싱글톤은 **enum**이 최선(EJ Item 3). 인스턴스화 막을 클래스는
      private 생성자(EJ Item 4).
- [ ] **상수 묶음에 int 상수 대신 enum**(EJ Item 34). 분기 `switch` 반복이면 enum에 동작을 두는지.
- [ ] **제네릭**: raw 타입 금지(EJ Item 26), 비검사 경고 제거(EJ Item 27). API는 **PECS** 와일드카드
      (producer `extends`, consumer `super`)(EJ Item 31). 제네릭은 **무공변** — `List<Object>`는
      `List<String>`의 상위 아님(공변은 배열만, 그래서 배열보다 리스트 선호 EJ Item 28).
- [ ] **`Optional` 적절한가**(EJ Item 55): 반환 부재 표현엔 OK, **필드·파라미터·컬렉션 원소·박싱 타입**엔
      부적절. `Optional.get()` 무방비 호출·`Optional` null 반환 금지. 컬렉션은 null 대신 빈 컬렉션(EJ Item 54).
- [ ] **현대 Java**: 불변 데이터 운반은 **record**(접근자·equals·hashCode·toString 자동, 규약 일관).
      제한된 계층은 **sealed**로 망라적 `switch` 가능. record는 컴포넌트 검증을 compact 생성자에 둔다.

## 근거 (요지)
- **빌더(Item 2)**: 선택 파라미터가 많을 때 가독성·불변·유효성 검증에 유리. 정적 팩토리(Item 1)는
  이름 부여·인스턴스 캐싱·반환 타입 유연성 제공.
- **equals/hashCode(Item 10·11)**: 동등 객체는 같은 해시코드를 반환해야 한다 — 위반 시 해시 기반
  컬렉션이 오작동. `equals`는 값 클래스에서만 재정의하고 5대 규약을 지킨다.
- **불변(Item 17)**: 불변 객체는 스레드 안전·공유 안전·실패 원자성. 단점은 값마다 객체 생성 비용.
- **enum(Item 34)**: 타입 안전·이름 공간·메서드 부착 가능. ordinal 의존 금지(Item 35), EnumSet/EnumMap 선호.
- **제네릭(Item 26~31)**: 컴파일 타임 타입 안전. 무공변성으로 배열의 런타임 ArrayStoreException을 회피.
- **record/sealed (현대 Java)**: record는 명목적 불변 데이터 집합으로 객체 규약을 자동·일관 제공.
  sealed는 허용 하위타입을 제한해 `switch` 망라성 검사를 가능케 한다.

## 인용 시
"EJ Item 11 / Object.hashCode 규약 위반 — equals만 재정의해 HashMap 키로 깨짐" 식으로 근거를 단다.
