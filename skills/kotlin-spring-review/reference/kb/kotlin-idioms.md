---
title: Kotlin 관용구 — 리뷰 체크
source: 『Kotlin in Action』 · 『Atomic Kotlin』 + https://kotlinlang.org/docs/
last_fetched: 2026-06-24
skills: [kotlin-spring-review]
---

# Kotlin 관용구 — 코드 리뷰 체크

> 근거: 「Kotlin in Action」 + 「아토믹 코틀린」(Atomic Kotlin) + Kotlin 공식 문서.
> 각 항목: FLAG(지적 대상) → FIX(관용적 수정), 심각도.

## 1. 널 안정성 (리뷰 최우선 — Kotlin in Action 6장)
- 🟠 **HIGH**: 비즈니스 로직의 `!!`, 특히 `a!!.b!!` 체인(스택트레이스 무용) → `?.`/`?:`/`let`/스마트캐스트.
- 🟠 Java 경계의 **플랫폼 타입(`Type!`)**을 널 검사 없이 사용 → 경계에서 널 처리/`@Nullable`·`@NotNull` 존중, 명시적 `String?`/`String`로 받기.
- 🟡 `if (x != null) x.f()` 사다리 → `x?.f()` / `x?.let { }`.
- 🟡 `as` (캐스트 실패 시 예외) → `as?` + `?:`. equals 관용구: `val o = other as? Person ?: return false`.
- 🟡 "혹시 몰라" 붙인 nullable인데 실제로 항상 non-null → non-null 타입으로. 진짜 필요한 곳만 `?`.
- 🟡 `map[key]!!` → `map.getValue(key)`(명확한 예외). 한 줄에 `!!` 하나 이하.
- 🟢 nullable 후속 처리: `?: return`/`?: throw`로 조기 탈출(`Nothing` 반환 함수 `fail(...)` 가능, 스마트캐스트 보존).

## 2. 불변성 (아토믹 코틀린)
- 🟡 **MEDIUM**: 재할당 없는 `var` → `val`. 기본 `val`, 꼭 필요할 때만 `var`.
- 🟠 최상위/전역 `var`(공유 가변 상태) → 캡슐화하거나 불변 객체 위 `val`.
- 🟡 `val`은 **참조**만 고정 — `val list = mutableListOf()`의 내용은 변함. 진짜 불변이 필요하면 읽기 전용 컬렉션/`copy()`.
- 🟠 공개 API/반환 타입에 `MutableList`/`MutableMap` 노출 → `List`/`Map` 읽기 전용으로. 내부 가변 상태 반환 전 방어적 복사(`toList()`).
- 🟡 읽기 전용 ≠ 스레드 안전/불변 — 멀티스레드에선 동기화/동시성 컬렉션 검토.

## 3. data / sealed class (아토믹 코틀린, Kotlin in Action 4장)
- 🟡 값 홀더에 수기 `equals`/`hashCode`/`toString`/`copy` → `data class`. 키로 쓰려면 전부 `val`.
- 🟡 필드 단위 복사 변경 → `copy(field = ...)`.
- 🟡 타입 계층 위 `when` + 버리는 `else` → 베이스를 `sealed`로, `else` 제거(망라성 컴파일 보장; 서브타입 추가 시 컴파일 에러로 누락 감지).
- 🟠 열린 계층 + 여러 곳의 `is` 타입 검사 반복 → `sealed` + 망라적 `when` 또는 다형 메서드.
- 🟢 `Pair`/`Triple`로 의미 불명확 → 명명된 `data class` + 구조분해.

## 4. 클래스·생성자·프로퍼티 (아토믹 코틀린)
- 🟢 `class C(name: String) { val name = name }` → `class C(val name: String)`(주생성자 프로퍼티).
- 🟡 텔레스코핑/보조 생성자 → 기본 인자. 보조 생성자는 프레임워크 인터롭에 한정.
- 🟠 외부에서 변경되는 가변 프로퍼티(가드 없음) → `private set` + 검증 setter, 또는 도메인 메서드로 상태 전이.
- 🟡 계산값은 커스텀 getter(`val area get() = w*h`). `field`는 접근자 안에서만.
- 🟡 가시성 최소화: `private`(구현) → `internal`(모듈) → `public`(의도된 표면)만.

## 5. 함수 정의·호출 (Kotlin in Action 3장)
- 🟡 정적 헬퍼만 든 `XxxUtil`/`XxxHelper` → 최상위 함수 / 확장 함수.
- 🟡 후행 인자만 생략하는 오버로드 폭발 → 기본 인자값.
- 🟠 `doThing(true, false)` 플래그 인자 → 명명 인자 / enum / 함수 분리.
- 🟢 게터 노출 상수 → `const val`.
- 🟡 소유하지 않은 타입(JDK/Spring) 정적 헬퍼 → 확장 함수. (단, 확장은 정적 디스패치 — 오버라이드 기대 금지, private 접근 불가.)
- 🟢 이스케이프 정규식 `"\\.\\w+"` → 삼중따옴표 `"""\.\w+"""`.

## 6. 람다·고차함수·시퀀스 (Kotlin in Action 5·8장)
- 🟡 max/filter/map/집계 수동 루프 → 표준 컬렉션 함수.
- 🟢 `filter{}.size` → `count{}`. 사소한 위임 람다 → 멤버 참조(`Person::age`).
- 🟡 단일 파라미터 람다가 중첩되지 않으면 명시적 이름 대신 `it`을 사용한다. 람다가 중첩되어 어떤 값인지 불분명해질 때만 내부 블록의 파라미터에 의미 있는 이름을 붙인다. API가 여러 파라미터를 요구하는 람다는 예외다.
- 🟡 크고 긴 즉시(eager) `map().filter()` 체인 대용량 → `asSequence()...toList()`. (소량/eager는 그대로.)
- 🟠 async/이벤트 등록 후 캡처된 가변 로컬을 동기적으로 읽기 → 상태를 프로퍼티로 이동.
- 🟡 수동 `try/finally { close() }` → `use { }`. 수동 `lock/unlock` → `withLock { }`.
- 🟢 람다 안 비지역 `return` 주의(인라인 함수). 여러 지역 return 필요 시 익명 함수.
- 🟡 반복 객체 설정(`obj.x=...; obj.y=...`) → `apply { }`. 스코프 함수 오남용/오선택(`apply` vs `run` vs `let` vs `also` vs `with`) 주의, 과중첩 금지.

## 7. 연산자·관례 (Kotlin in Action 7장)
- 🟡 관례 이름 함수에 `operator` 누락. 직관적이지 않은 연산자 오버로드 → 명명 함수.
- 🟠 `plus`와 `plusAssign` 동시 정의(`+=` 모호) → 하나만(불변 타입=값 반환, 가변=assign).
- 🟠 `equals`를 확장/`operator`로 → 멤버 `override`. 다중 필드 정렬 → `compareValuesBy(...)`.
- 🟡 수기 lazy 백킹 필드 → `by lazy { }`(기본 스레드 안전). 변경 알림 setter 중복 → `Delegates.observable`.

## 8. 제네릭 (Kotlin in Action 9장)
- 🟠 `value is List<String>`(소거로 컴파일 불가) / 런타임 원소 타입 가정 → `is List<*>` 또는 `reified`.
- 🟡 `Class<T>`/`KClass<T>` 토큰 전달 → `inline fun <reified T>`. 클래스별 필터 루프 → `filterIsInstance<T>()`.
- 🟡 검증에 기대는 unchecked `as List<Int>` → 타입 파라미터화/캡슐화. 산재한 `@Suppress("UNCHECKED_CAST")` → 타입드 접근자에 국한.
- 🟡 무제한 `<T>` 후 널 검사 남발 → `<T : Any>`. 읽기만 하는 `MutableList<Any>` 파라미터 → 공변 `List<out T>`/`List<T>`.

## 9. 캐스팅·타입검사 (아토믹 코틀린)
- 🟡 `is` 후 재캐스트 불필요 → 스마트캐스트. 단, 가변 `var` 리시버는 스마트캐스트 불가 → 로컬 `val`로.
- 🟡 가드 없는 `as` → `as?` + 폴백.

## 10. object / companion / nested (아토믹 코틀린)
- 🟡 수기 싱글톤(`getInstance()`) → `object`. 산재한 상수/팩토리 → `companion object`.
- 🟡 외부 인스턴스 안 쓰는 `inner` → 일반 nested(외부 참조 비용 제거). `data class`는 `inner` 불가.
- 🟢 private 생성자 + companion 팩토리(승인된 패턴).

## 11. 상속 vs 합성 vs 위임 (아토믹 코틀린 58~65)
- 🟡 실제 다형성 없는데 `open`/상속 → `final` + 합성/확장.
- 🟡 코드 재사용/수동 메서드 위임 위한 상속 → 합성 또는 클래스 위임 `by`.
- 🟠 `override` 누락, 베이스 생성자 인자 미전달.

## 12. 실패 방지 (아토믹 코틀린 73~76)
- 🟠 공개 함수 인자 사전조건 누락 → `require(cond){msg}`(IllegalArgument), `requireNotNull(x){msg}`(널 가드+스마트캐스트), `check(cond){msg}`(상태/IllegalState).
- 🟠 광범위 `catch (e: Exception)` / 삼킴 → 구체 타입, 로그 또는 컨텍스트와 함께 재던짐.
- 🟢 항상 던지는 함수 → 반환타입 `Nothing`. `assert()`(기본 비활성) 의존 금지.

## 13. 로깅·테스트 (아토믹 코틀린 22, 77~78)
- 🟠 프로덕션 `println`/`print` → 레벨 로거. 비싼 문자열 보간 → `logger.debug { ... }`(지연).
- 🔴 시크릿/PII 로깅 금지.
- 🟡 TDD(RED→GREEN→REFACTOR), 80%+ 커버리지, 공개 동작 테스트(내부 X), AAA + 서술적 이름.

## 14. 코루틴·구조적 동시성 (Kotlin in Action 부록E + Kotlin 공식문서) — Spring 핵심
- 🔴 **CRITICAL**: `GlobalScope.launch/async` → 생명주기 스코프 `CoroutineScope`/`coroutineScope { }`.
  공식문서: *"새 코루틴은 생명주기를 관리하는 `CoroutineScope`에서만 실행. 부모 스코프의 자식이 되어 함께 취소/예외 처리된다."*
- 🟠 **HIGH**: 코루틴 안 블로킹(JDBC/HTTP/`Thread.sleep`)을 `Dispatchers.IO` 없이 → `withContext(Dispatchers.IO)`, `delay` 사용.
- 🟠 Spring 컨트롤러/요청 경로의 `runBlocking` → 체인을 `suspend`로 / 적절한 스코프.
- 🟠 독립 작업의 순차 `async{}.await()` → 모두 `async` 먼저 시작 후 `await`/`awaitAll`.
- 🟡 무제한 외부 대기 → `withTimeout`/`withTimeoutOrNull`. 최상위 `launch` 예외 미처리 → `CoroutineExceptionHandler`/`await`로 표면화(삼킴 금지).
- 🟡 CPU 작업은 `Dispatchers.Default`, 블로킹은 `Dispatchers.IO` — 디스패처 오용 주의.

## 빠른 재현율 높은 FLAG Top 10
1. 재할당 없는 `var` → `val`
2. `!!` → 안전호출/Elvis/`requireNotNull`/스마트캐스트
3. 공개 API의 `Mutable*` → 읽기 전용 인터페이스
4. 수동 루프 누적/필터/변환 → `filter`/`map`/`fold`/`groupBy`(대량은 시퀀스)
5. 망라 안 된 값-`when`; sealed `when`의 새 서브타입 가리는 `else`
6. 수기 `equals`/`hashCode`/`toString` → `data class`
7. 다형성 없는 `open`/상속 → `final` + 합성/`by`
8. 가드 없는 `as` → `as?` + 폴백
9. 공개 경계의 `require`/`requireNotNull`/`check` 누락
10. 수동 `try/finally close` → `use { }`; 프로덕션 `println` → 로거

## 리뷰 훅
- [ ] 🟠 비즈니스 로직에 `!!`/무방비 `as`가 없는가, 플랫폼 타입(`Type!`)을 널 검사 없이 쓰지 않는가.
- [ ] 🟡 재할당 없는 `var`가 `val`로 돼 있는가, 공개 API에 `Mutable*`를 노출하지 않는가.
- [ ] 🟡 값 홀더가 `data class`인가, 타입 분기 반복이 `sealed` + 망라적 `when`으로 됐는가.
- [ ] 🟠 가변 프로퍼티에 가드(`private set`/검증)가 있는가, 외부에서 직접 변경 불가한가.
- [ ] 🔴 `GlobalScope` 사용이 없는가, 블로킹 작업이 `Dispatchers.IO`로 격리됐는가 (구조적 동시성).
- [ ] 🟠 공개 함수 경계에 `require`/`requireNotNull`/`check`가 있는가, 광범위 `catch (e: Exception)` 삼킴이 없는가.
- [ ] 🟡 수동 `try/finally close`가 `use {}`로, 프로덕션 `println`이 로거로 돼 있는가.
- [ ] 🟡 단일 파라미터의 비중첩 람다는 `it`을 사용하고, 중첩 람다에서만 내부 파라미터를 명시적으로 이름 붙였는가.
