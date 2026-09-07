---
title: 함수형 JVM 스타일 — Kotlin 적용
source: 『Modern Java in Action』 (Java 원칙 → Kotlin 번역)
last_fetched: 2026-06-24
skills: [kotlin-spring-review]
---

# 함수형 JVM 스타일 — 코드 리뷰 체크 (Kotlin 적용)

> 근거: 「모던 자바 인 액션」(Modern Java in Action). Java 원칙을 **Kotlin/JVM 백엔드 관용구로 번역**해 적용.
> 표기: "Java 원칙 → Kotlin 적용".

## 1. 동작 파라미터화 & 람다 (2·3장)
- 🟠 **HIGH**: 한 줄(술어/동작)만 다른 복붙 루프/메서드 → 함수 타입 파라미터 `(T)->Boolean`로 통일. (DRY)
- 🟠 **boolean/플래그 인자로 동작 전환 금지** — 책의 명시적 안티패턴(`filterApples(inv,null,150,false)`).
  Kotlin: 명명 인자/기본값으로 완화되지만, 모드 전환 플래그는 함수 분리.
- 🟡 람다가 몇 줄 넘으면 명명 함수 + 멤버 참조로 추출(가독성·테스트·스택트레이스). `{ it.weight }` ↔ `Apple::weight`는 더 읽기 쉬운 쪽.
- 🟡 반복 setup/teardown → execute-around 패턴 = `inline fun <R> withX(block:(T)->R): R` 또는 stdlib `use {}`/`runCatching`.
- 🟠 **캡처된 `var` 변경 주의**: Kotlin 람다는 Java와 달리 외부 `var`를 캡처·변경할 수 있다 — 특히 async/병렬에서 위험. `val` 선호.

## 2. 스트림 → 시퀀스/컬렉션 연산 (4·5장)
- 🟡 수동 루프 + 누적자 → 선언적 연산(`filter`/`map`/`groupBy`/`associateBy`/`partition`/`sumOf`/`maxByOrNull`/`fold`).
- 🟡 Kotlin `Iterable` 연산은 **eager**(단계마다 새 리스트). 길거나 대용량/단락(short-circuit) 체인 → `asSequence()`.
  소량/eager는 그대로(불필요한 `asSequence()` 남발 금지).
- 🟠 파이프라인 람다(`map`/`filter`/`onEach`)에 **부수 효과 금지**(순수해야). `println`/비즈니스 로직 금지.
- 🟡 `peek` 대응은 `onEach { log(it) }`(비파괴 관찰) — 여기에도 부수효과/로직 넣지 말 것.
- 🟡 `map{}.flatten()`/중첩 `map` → `flatMap`. `map(...).filter{it!=null}` → `mapNotNull`.
- 🟡 `find`/`firstOrNull`/`singleOrNull`은 nullable 반환 — **`Optional` 쓰지 말 것**(아래 5절). `!!` 대신 `?:`/`?.let`.
- 🟢 무한/지연 → `generateSequence(seed){}` + `takeWhile`/`take`. 무한 시퀀스에 `sorted()`/`distinct()`(무제한 상태) 금지.

## 3. 리듀스·집계 (5·6장)
- 🟡 `var acc`를 `forEach`로 누적 → `fold(initial)`/`reduce`/`sumOf`. (병렬 안전성 측면에서도 권장)
  - `reduce`(빈 컬렉션 예외) vs `fold(initial)`(빈에 기본값) 의미 구분.
- 🟡 수동 `getOrPut(k){mutableListOf()}.add()` 그룹핑 루프 → `groupBy`/`groupingBy{}.eachCount()`/`associate`.
- 🟢 숫자 합은 `sum()`/`sumOf{}`(박싱 회피, `IntStream` 불필요). 대량 원시 데이터는 `IntArray`.

## 4. 컬렉션 API 관용구 (8장)
- 🟠 공유 가변 `HashMap`을 캐시/필드로 → `ConcurrentHashMap` 또는 캐시 추상화(`@Cacheable`). 스레드 간 평 `HashMap` 공유 금지.
- 🟡 check-then-put(`if(k !in m) m[k]=...; m[k]!!.add()`) → 원자적 `getOrPut(k){...}`. `m[k]!!` 금지.
- 🟠 for-each 중 `collection.remove(x)`(ConcurrentModification) → `removeAll{}`/`filter`로 새 컬렉션.
- 🟡 서비스/도메인 레이어에선 in-place 변경보다 **새 컬렉션 생성**(`filter`/`map`/`sortedBy`) 선호.

## 5. Optional → Kotlin nullable (11장) — CRITICAL 치환
> 책: `Optional<T>`는 **반환 타입**의 부재 신호용. 필드·파라미터 금지. `get()` 무방비 호출 금지.

| Java | Kotlin |
|------|--------|
| `Optional<T>` 반환 | `T?` — **Kotlin API에 `java.util.Optional` 쓰지 말 것** (🟠 발견 시 FLAG) |
| `get()` 무방비 | `!!`가 등가물 — 🟠 FLAG, `?.`/`?:`/`requireNotNull{msg}` 요구 |
| `map`/`flatMap`/`filter` | `?.let{}` / 안전호출 체인 `a?.b?.c`(자동 평탄화) / `?.takeIf{}` |
| `orElse`/`orElseGet`/`orElseThrow` | `?: default` / `?: run{ expensive() }` / `?: throw` |
| `ifPresent` | `value?.let { }` |

- 🟡 모든 null을 무작정 nullable로 감싸지 말 것 — 필수/존재 보장 값은 non-null로 둬야 진짜 버그가 드러난다.

## 6. 날짜·시간 (12장) — java.time
- 🟠 **HIGH**: 새 코드의 `java.util.Date`/`Calendar`/`SimpleDateFormat`/`Timestamp` → `java.time` (`Instant`/`LocalDate`/`LocalDateTime`/`ZonedDateTime`).
- 🟠 타임스탬프는 **`Instant`(UTC)로 영속화**. 달력 날짜는 `LocalDate`. 존 민감 표시에만 `ZonedDateTime`.
  **`LocalDateTime`을 인스턴트처럼 쓰는 흔한 버그**(존 없음) FLAG.
- 🟡 `DateTimeFormatter`는 스레드 안전 → `companion object val` 상수로 공유. java.time 객체는 불변(`withYear` 결과 미할당 = no-op) — `val` 선호.

## 7. 디폴트 메서드 (13장)
- 🟡 Kotlin 인터페이스는 메서드 본문 네이티브(`default` 키워드 없음). 다이아몬드 충돌 → Kotlin이 override 강제, `super<A>.foo()`로 명시. 인터페이스 상태 없음. 인터페이스 `static` → `companion object`.

## 8. 동시성·비동기 (15·16·17·21장) — CompletableFuture → 코루틴
| Java | Kotlin |
|------|--------|
| `CompletableFuture` | `suspend` + `async`/`await` |
| `thenCompose`(의존/순차) | 순차 suspend 호출(콜백 중첩 없음) |
| `thenCombine`(독립/병렬) | `coroutineScope { val a=async{}; val b=async{}; combine(a.await(),b.await()) }` |
| `allOf`/`anyOf` | `awaitAll(...)` / `select{}` |
| 비동기 중 블로킹 금지 | 🟠 `runBlocking`/`Thread.sleep`/`Future.get()`/블로킹 JDBC·HTTP를 비-IO 디스패처에서 금지. 불가피하면 `withContext(Dispatchers.IO)` |
| 타임아웃 | `withTimeout`/`withTimeoutOrNull` |
| 예외 | `await` 주변 try/catch, `supervisorScope`/`CoroutineExceptionHandler`, 삼킴 금지 |

- 🟠 리액티브: RxJava → **Kotlin `Flow`**(콜드)/`SharedFlow`/`StateFlow`(핫). 연산자 순수, 백프레셔(`buffer`/`conflate`/`collectLatest`), 종단 `catch{}` 필수. **`collect{}` 안 블로킹 금지**.

## 9. 순수성·불변성·참조 투명성 (18·19장)
- 🟠 공유 가변 상태 제거 — 크래시/디버그/동시성 버그의 근원. `@Synchronized`/`synchronized(lock){}`는 더 깊은 검토를 요하는 냄새.
- 🟡 도메인 함수는 순수·참조 투명(같은 입력→같은 출력). `Clock`/난수/IO 주입(테스트 가능성+RT). 부수효과는 경계(리포지토리/HTTP)로 격리.
- 🟠 입력 파라미터 변경 / 내부 가변 상태 반환 금지 — 새 구조 반환(영속 자료구조: `data class copy()`, kotlinx.collections.immutable). 타입으로 강제(주석 "복사하세요" 의존 금지).
- 🟡 깊은 재귀: Java는 TCO 없지만 **Kotlin `tailrec fun`은 TCO 적용**(컴파일러가 꼬리 위치 검증). 깊은 비꼬리 재귀(스택오버플로) FLAG.

## 10. 병렬 처리 (7장) — "측정, 측정, 측정"
- 🟠 Kotlin엔 `parallelStream()` 관용구 없음 — 코루틴(`async`/`awaitAll`, `Dispatchers.Default`)으로, **측정한 경우에만**.
- 🔴 병렬 `forEach`/`async`에서 공유 가변 변경(`total += x` 비원자) → 데이터 레이스.
- 🟡 작거나 순서 의존(`limit`/`first`) 작업 병렬화, 분해 어려운 자료구조 병렬화, 벤치마크 없는 "빨라짐" 주장 FLAG.

## 11. DSL (10장)
- 🟡 SQL/HTML 문자열 연결 → 타입 안전 내부 DSL(Exposed/jOOQ/kotlinx.html). 문자열 SQL은 인젝션 지점이기도 함(🔴 보안).
- 🟡 리시버 람다 DSL에 `@DslMarker` 누락(스코프 누수), 과설계/미테스트 DSL(YAGNI) FLAG.
- 🟢 Kotlin은 명명 인자 + 기본값으로 Java DSL의 "위치 vs 이름"/"옵션용 오버로드" 단점을 해소.

## 통합 핵심
- 불변/`val`/`data class copy()`/읽기 전용 컬렉션을 기본으로.
- 부재는 `T?`(절대 `Optional`), 비동기는 코루틴(절대 비-IO 디스패처 블로킹).
- 선언적 컬렉션 연산(대량은 시퀀스), 순수 함수, java.time, `tailrec`, `sealed`+`when`.

## 리뷰 훅
- [ ] 🟠 boolean/플래그 인자로 동작을 전환하지 않는가 (함수 분리/명명 인자).
- [ ] 🟠 컬렉션 파이프라인(`map`/`filter`/`onEach`) 람다에 부수 효과가 없는가 (순수).
- [ ] 🟠 Kotlin API에 `java.util.Optional`을 쓰지 않고 `T?`를 쓰는가.
- [ ] 🟠 새 코드가 `java.util.Date`/`Calendar`가 아니라 `java.time`을 쓰는가, 타임스탬프를 `Instant`로 영속화하는가.
- [ ] 🔴 병렬 `forEach`/`async`에서 공유 가변 상태를 비원자적으로 변경하지 않는가 (데이터 레이스).
- [ ] 🟠 공유 가변 `HashMap`을 필드/캐시로 두지 않는가 (`ConcurrentHashMap`/캐시 추상화).
- [ ] 🟡 대용량·단락 체인은 `asSequence()`인가, 무한 시퀀스를 `take`/`takeWhile`로 종료하는가.
