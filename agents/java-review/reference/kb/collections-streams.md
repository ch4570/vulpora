---
title: Java 컬렉션·스트림
source: https://docs.oracle.com/en/java/javase/21/docs/api/
last_fetched: 2026-06-24
consumers: [java-reviewer]
---

# KB: Java 컬렉션·스트림

## 리뷰 훅 (이걸 점검하라)
- [ ] **컬렉션 선택이 계약에 맞는가**: 중복 불가·해시 동등성 → `HashSet`/`HashMap`; 순서 보존 →
      `LinkedHashMap`/`List`; 정렬 → `TreeMap`/`TreeSet`(+`Comparator`); 큐/스택 → `ArrayDeque`(레거시
      `Stack`/`Vector` 지양).
- [ ] **해시/트리 키의 equals·hashCode**: `HashMap`/`HashSet` 키는 `equals`+`hashCode` 일관 필요,
      `TreeMap`/`TreeSet`은 `compareTo`/`Comparator`가 `equals`와 일관(아니면 원소 유실·중복).
      **가변 객체를 키로 쓰고 키 상태를 바꾸면** 조회 불가(버그).
- [ ] **스트림 부작용**(EJ Item 46): `forEach`로 외부 상태 변경(리스트 add·필드 누적) 금지 — 수집은
      `collect(Collectors.toList()/toMap/groupingBy)`. `forEach`는 결과 출력 등 종단 부작용에만.
- [ ] **병렬 스트림 함정**(EJ Item 48): `parallel()`을 함부로 쓰지 않는다. 공유 가변 상태·순서 의존·
      비결합 연산이면 오답/성능 저하. 분할 가능한 소스(배열·`ArrayList`·`IntStream.range`)와 충분한
      작업량에서만 측정 후 도입.
- [ ] **스트림 남용으로 가독성 저하**(EJ Item 45) → 단순 루프가 명확하면 루프. 한 스트림에 과도한 단계 지양.
- [ ] **불변/방어 컬렉션 반환**: 내부 컬렉션을 그대로 반환하면 외부 변경에 노출 → `List.of`/
      `Collections.unmodifiableList`/`copyOf`로 보호. 빈 결과는 null 대신 빈 컬렉션(EJ Item 54).
- [ ] **`Collectors.toMap` 키 충돌**: 중복 키 시 병합 함수 없으면 `IllegalStateException`. 의도된 병합이면
      merge 함수 명시.
- [ ] **반복 중 수정**(`ConcurrentModificationException`): for-each 중 `remove`/`add` 금지 →
      `Iterator.remove`/`removeIf`/`Collectors`.
- [ ] **오토박싱 비용**(EJ Item 61): 대량 수치 연산에 박싱 타입(`Long`·`Integer`) 누적은 성능/널 위험 →
      기본형·`IntStream`/`LongStream`.

## 근거 (요지)
- **컬렉션 동등성 계약**(Java API): 해시 기반은 `hashCode`/`equals`, 정렬 기반은 자연순서/Comparator의
  일관성에 의존한다. 키 가변성은 위치를 깨뜨린다.
- **스트림은 무상태·부작용 없는 함수**가 전제(API 문서). 부작용 기반 누적은 병렬에서 비결정·경합.
- **병렬화 전제**(API 문서): 소스 분할성·연산 결합성(associativity)·독립성. 미충족 시 오히려 느리거나 틀림.
- **불변 컬렉션**(`List.of`/`Map.of`/`copyOf`): 내부 표현 캡슐화로 외부 변경 방지.

## 인용 시
"EJ Item 46 / Stream API 문서 — forEach 내 외부 리스트 add는 부작용, collect로 대체" 식으로 근거를 단다.
