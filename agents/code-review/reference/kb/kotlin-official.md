---
title: Kotlin 공식 (코딩 컨벤션·널 안정성·불변·코루틴·sealed)
source: https://kotlinlang.org/docs/coding-conventions.html
sources_extra:
  - https://kotlinlang.org/docs/null-safety.html
  - https://kotlinlang.org/docs/scope-functions.html
  - https://kotlinlang.org/docs/sealed-classes.html
  - https://kotlinlang.org/docs/coroutines-basics.html
  - https://kotlinlang.org/docs/coroutine-context-and-dispatchers.html
versions: Kotlin 2.x
last_fetched: 2026-06-22
consumers: [kotlin-spring-reviewer]
---

# KB: Kotlin 공식

## 리뷰 훅
- [ ] 비즈니스 로직에 `!!`가 있는가 → `?.`/`?:`/`requireNotNull`/스마트캐스트로.
- [ ] 자바 상호운용 플랫폼 타입(`Type!`)을 무검증으로 쓰는가.
- [ ] 변할 필요 없는 것이 `var`인가 → `val`. 공개 API에 `Mutable*` 컬렉션 노출하는가.
- [ ] 타입에 따른 반복 `when`/`is` 분기 → `sealed` + 망라적 `when`(else 불필요)으로.
- [ ] 스코프 함수(`let`/`run`/`with`/`apply`/`also`)를 의미에 맞게 쓰는가(중첩 남용 금지).
- [ ] `GlobalScope`/무제한 디스패처를 쓰는가. 블로킹을 `Dispatchers.IO`로 격리했는가.

## 근거 (공식 요지)
- **널 안정성**: 타입 시스템이 nullable(`?`)을 강제. `!!`는 NPE를 명시적으로 허용하는 탈출구 — 리뷰에서 정당화 필요. (null-safety)
- **불변**: `val`·읽기 전용 컬렉션(`List` vs `MutableList`) 선호. data class는 `copy()`로 불변 갱신. (coding-conventions)
- **sealed**: 제한된 계층 → `when`이 망라적이면 컴파일러가 분기 누락을 잡음. (sealed-classes)
- **스코프 함수**: 수신객체/반환값 규칙(`apply`/`also`는 수신객체 반환, `let`/`run`/`with`는 람다 결과). (scope-functions)
- **코루틴/구조적 동시성**: 코루틴은 스코프에 묶여 누수를 막음. `GlobalScope`는 구조적 동시성을 깨므로 지양. 블로킹 호출은 적절한 디스패처로. (coroutines-basics, dispatchers)

## 인용 시
"Kotlin `Null safety` 기준 비즈니스 로직 `!!`는 NPE 위험 → `?:`/`requireNotNull`로" 식으로.
