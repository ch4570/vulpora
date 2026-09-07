---
title: 함수형·컬렉션 (모던 자바 인 액션 → Kotlin)
source: https://www.manning.com/books/modern-java-in-action
sources_extra:
  - Clean Code (R.C. Martin) — 함수/오류처리 장
versions: Modern Java in Action (Urma·Fusco·Mycroft)
last_fetched: 2026-06-22
consumers: [code-refactor-agent]
---

# KB: 함수형 · 컬렉션 처리 (모던 자바 인 액션 → Kotlin 매핑)

> 자바 Stream/Optional/람다 개념을 **Kotlin 관용구로 치환**해 적용한다. 명령형 루프·널 분기를
> 선언적 파이프라인·널 안전 연산으로 리팩터링한다.

## 리뷰 훅
- [ ] **명령형 루프 + 가변 누적** — `for`로 필터/변환/집계 → `filter`/`map`/`groupBy`/`fold`(선언적).
- [ ] **중첩 루프/플래그 변수** — `any`/`all`/`none`/`first`/`takeWhile`로 의도 표현.
- [ ] **null 분기 사다리** — `if (x != null)` → `?.let`/`?:`/`mapNotNull`. 자바 `Optional` → Kotlin nullable.
- [ ] **거대 스트림 한 줄** — 가독성 저하 → 단계별 **Extract Function**(중간 의미에 이름).
- [ ] **큰 컬렉션 다단계** — 중간 컬렉션 폭증 → `asSequence()`(지연 평가)로.
- [ ] **부수효과 있는 람다** — `forEach` 안에서 외부 가변 변경 → 순수 변환 + 마지막에 수집.

## 자바 → Kotlin 치환표
| 자바(모던) | Kotlin |
|---|---|
| `stream().map().collect(toList())` | `map { }` (또는 `asSequence().map{}.toList()`) |
| `Optional<T>` | `T?` + `?.`/`?:`/`let` |
| `stream().filter().findFirst()` | `firstOrNull { }` |
| `Collectors.groupingBy` | `groupBy { }` |
| `reduce` | `fold`/`reduce` |
| `IntStream.range` | `(0 until n)` / `indices` |

## 근거 (요지)
- **선언형이 의도를 드러낸다** — "어떻게(how)" 루프 기계가 아니라 "무엇을(what)" 변환인지.
- **순수 함수·부수효과 분리**(Clean Code) — 질의와 명령을 섞지 말 것(Separate Query from Modifier).
- **지연 평가(Sequence/Stream)**는 단계가 많거나 데이터가 클 때 이득. 짧은 컬렉션엔 `List`가 빠르다(EK 효율성과 정합).

## 인용 시
"모던 자바 인 액션 — 명령형 누적 루프 → `groupBy`/`fold` 선언화" /
"Clean Code: 함수는 한 가지만 — 변환과 부수효과 분리" 식으로.
