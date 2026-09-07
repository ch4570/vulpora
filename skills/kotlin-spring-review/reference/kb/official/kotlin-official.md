---
title: Kotlin 공식 문서 KB
source: https://kotlinlang.org/docs/coding-conventions.html
last_fetched: 2026-06-24
skills: [kotlin-spring-review]
---

# Kotlin 공식 문서 KB (코드 리뷰 기준)

> 조회일: 2026-06-22 · 출처: kotlinlang.org 공식 문서

Kotlin 백엔드 코드 리뷰에서 즉시 체크 가능한 규칙 모음. 각 규칙 = 명령형 진술 + FLAG → FIX + 심각도.
심각도: 🔴 CRITICAL(병합 차단) · 🟠 HIGH(병합 전 수정) · 🟡 MEDIUM(권장) · 🟢 LOW(스타일/선택)

---

## 1. 코딩 컨벤션

### 네이밍
- 패키지는 소문자, 언더스코어 없이. FLAG: `org.example.My_Project` → FIX: `org.example.myproject` 🟢
- 클래스/객체 UpperCamelCase, 함수/프로퍼티/지역변수 lowerCamelCase. 🟢
- `const` 및 커스텀 get 없는 top-level/object `val` 상수는 SCREAMING_SNAKE_CASE. FLAG: `const val maxCount` → FIX: `const val MAX_COUNT` 🟢
- 백킹 프로퍼티는 `_` 접두사, 공개는 읽기 전용으로. FLAG: 가변 컬렉션 public 노출 → FIX: `private val _items = mutableListOf(); val items: List<X> get() = _items` 🟡
- 약어: 2글자 모두 대문자(`IOStream`), 3글자+ 첫 글자만(`XmlFormatter`). 🟢
- 의미 없는 단어(`Manager`/`Wrapper`/`Util`) 금지. 🟡

### 파일/클래스 레이아웃
- 단일 선언 파일명 = 클래스명. 🟢
- 본문 순서: 프로퍼티/init → 보조 생성자 → 메서드 → companion. 알파벳/가시성 정렬 금지, 관련 항목 인접. 🟢
- 오버로드는 인접 배치. 🟢

### 포매팅
- 공백 4칸. 이항 연산자 주위 공백, `0..i`/`.`/`?.`/`::` 주위 공백 없음. 🟢
- `:` — 타입↔상위타입 구분 시 앞뒤 공백(`class A : B`), 선언↔타입 구분 시 뒤만(`val x: Int`). 🟢
- 멀티라인 `if`/`when`은 중괄호 필수. 🟡

### 관용적 기능
- 불변은 `val` + 불변 컬렉션 인터페이스(`List`/`listOf()`). 🟡
- 오버로딩 대신 기본 파라미터값. 🟡
- `if`/`when`/`try`를 식(expression)으로. 🟢
- 같은 원시타입 다수/Boolean 인자엔 named arguments. FLAG: `drawSquare(10,10,100,100,true)` → FIX: named 🟡
- 닫힌 범위 루프 `..<`. FLAG: `0..n-1` → FIX: `0..<n` 🟢
- 문자열 템플릿 / 멀티라인 + `trimIndent()`. 🟢
- 단순 getter는 함수보다 프로퍼티(`val size get() = ...`). 🟢

### 라이브러리/공개 API
- public 멤버는 가시성·반환타입·프로퍼티타입 명시 + KDoc. FLAG: 추론 반환타입/KDoc 누락 → FIX: 명시 🟠

**출처: https://kotlinlang.org/docs/coding-conventions.html**

---

## 2. Null 안전성
- 기본 non-nullable, 필요한 곳만 `?`. 🟡
- nullable 접근은 `?.`. 🟠
- 대체값/조기반환/예외는 `?:` (`... ?: throw IllegalArgumentException("name expected")`). 🟡
- **`!!`는 null 절대 아님이 확실할 때만.** FLAG: 습관적 `value!!` → FIX: `?.`/`?:`/`requireNotNull`/스마트캐스트 🔴
- 실패 가능 캐스트는 `as?`. FLAG: `a as Int` → FIX: `a as? Int` 🟠
- nullable 제거는 `filterNotNull()`. 🟡
- nullable 블록 실행은 `?.let { }`. 🟢
- Kotlin NPE 원인은 명시적 throw / `!!` / 초기화 중 `this` 누출 / Java 플랫폼 타입뿐 — 이 지점 집중 검토. 🔴

**출처: https://kotlinlang.org/docs/null-safety.html**

---

## 3. 코루틴 기초
- `suspend`는 suspend/빌더 안에서만 호출. 🟠
- 결과 불필요=`launch`(Job), 결과 필요=`async`+`await()`(Deferred). 🟡
- 새 코루틴은 항상 생명주기 관리 `CoroutineScope`(`coroutineScope { }`)에서 시작(구조적 동시성). 🟠
- 빌더 추출 함수는 `CoroutineScope` 확장으로. 🟡
- `runBlocking`은 다른 방법 없을 때만(스레드 블로킹). FLAG: 요청 핫패스 남용 → FIX: 체인을 `suspend`로 🟠

**출처: https://kotlinlang.org/docs/coroutines-basics.html**

---

## 4. 코루틴 컨텍스트 & 디스패처
- CPU=`Default`, I/O=`IO`, UI=`Main`. FLAG: I/O를 Default에서 → FIX: `withContext(Dispatchers.IO)` 🟡
- `Dispatchers.Unconfined`는 일반 코드 금지(공식). 🟠
- 디스패처 전환은 `withContext`. 🟡
- `newSingleThreadContext`는 `use {}`/재사용으로 해제(리소스 누수). 🟠
- 생명주기 객체는 커스텀 스코프 + 소멸 시 `scope.cancel()`(메모리 누수). 🟠
- 부모가 자식 자동 대기 — 수동 `join()` 불필요, 컨텍스트 결합은 `+`. 🟢

**출처: https://kotlinlang.org/docs/coroutine-context-and-dispatchers.html**

---

## 5. 코루틴 예외 처리
- `launch` 예외=즉시 전파, `async` 예외=`await()` 시 노출. FLAG: `async` 미`await` → 예외 묻힘 🟠
- `CoroutineExceptionHandler`는 미처리 예외 + root에만 동작. 자식 `launch`에 설치해도 안 불림. 🟠
- `async`엔 핸들러 무동작 → `try { d.await() } catch`. 🟠
- 한 자식 실패가 형제 취소 막으려면 `supervisorScope`/`SupervisorJob` + 자식별 처리. 🟠
- `CancellationException`은 투명 예외(정상 취소 신호)로 취급, 잡으면 재전파. 🟠

**출처: https://kotlinlang.org/docs/exception-handling.html**

---

## 6. 취소와 타임아웃
- 취소는 협력적 — 장기 CPU 루프는 `isActive`/`ensureActive()`/`yield()` 확인. 🟠
- 커스텀 suspend는 `suspendCancellableCoroutine()`. 🟠
- 리소스 정리는 `finally`(취소 시에도 실행). FLAG: try 끝에서만 close → 누수 🟠
- `finally`의 suspend는 `withContext(NonCancellable)`. `launch`/`async`엔 `NonCancellable` 금지. 🟠
- JVM 블로킹은 `runInterruptible { }`. 🟡
- 시간 제한은 `withTimeoutOrNull(duration)`, 정리는 `finally`. FLAG: 외부 호출 타임아웃 없음 → FIX: `withTimeoutOrNull` 🟠
- `CancellationException` 삼키면 취소 전파 깨짐 → 재전파. FLAG: `catch (e: Exception)`로 삼킴 → FIX: `if (e is CancellationException) throw e` 🔴

**출처: https://kotlinlang.org/docs/cancellation-and-timeouts.html**

---

## 7. 컬렉션 vs 시퀀스
- 컬렉션=즉시·단계 전체, 시퀀스=지연·요소별 파이프라인. 🟡
- 대용량+다단계+조기종료(`take`)면 `asSequence()`. 🟡
- 작은 컬렉션·단일 연산엔 시퀀스 금지(오버헤드). 🟢
- 시퀀스는 terminal(`toList()`/`first()`)로 소비 — intermediate만으론 미실행. 🟠
- 무한/생성 시퀀스(`generateSequence`/`sequence{}`)는 `takeWhile`/`take`로 종료. FLAG: 무한 미종료 → 🔴

**출처: https://kotlinlang.org/docs/sequences.html**

---

## 8. 스코프 함수
- (수신/반환)으로 선택: `let`(it/결과), `run`(this/결과), `with`(this/결과,비확장), `apply`(this/객체), `also`(it/객체). 🟡
- nullable 안전 블록/식 지역변수화 → `let`. FLAG: `if (str!=null) process(str)` → FIX: `str?.let { process(it) }` 🟢
- 생성 후 설정+객체 반환 → `apply`. 🟢
- 체인 중간 사이드이펙트(로깅) → `also`. 🟢
- 설정+결과계산 → `run`, 한 객체 다중 호출 → `with`. 🟡
- 중첩/남용 금지(`this`/`it` 혼동). 🟠
- 조건부 단일객체 → `takeIf`/`takeUnless` + `?.` 체이닝. 🟡

**출처: https://kotlinlang.org/docs/scope-functions.html**

---

## 9. 관용구
- 데이터 운반은 `data class`. 🟢
- 외부 입력 파싱은 `toIntOrNull()`. FLAG: `readln().toInt()` → 🟡
- 포함 검사 `in`/`!in`. 🟢
- null 시 예외/대체 `?:`. 🟡
- 빈 컬렉션 첫 요소 `firstOrNull() ?: default`. FLAG: `emails[0]` → 🟠
- 단일 식 함수 `=` 본문, 1회성 비싼 계산 `by lazy { }`. 🟢
- 리소스 `use { }`, 미구현 `TODO("...")`. 🟡
- reified 타입정보 필요 제네릭은 `inline fun <reified T>`. 🟡

**출처: https://kotlinlang.org/docs/idioms.html**

---

### 빠른 체크리스트 (심각도 우선)
- 🔴 `!!` 남용 / `CancellationException` 삼킴 / 무한 시퀀스 미종료 / 생성자 `this` 누출
- 🟠 무방비 `as` / `finally` 누락(누수) / 취소 불가 루프 / `async` 예외 미소비 / 스코프 미관리 코루틴 / `Unconfined` 일반 사용 / public API 타입·가시성·KDoc 누락
- 🟡 불필요 `var`·가변 컬렉션 노출 / 기본값 미사용 / named args 누락 / I/O 디스패처 미지정 / 잘못된 스코프 함수 / 작은 컬렉션 시퀀스 오용
- 🟢 네이밍/포매팅/문자열 템플릿/`..<`/단일 식 함수

## 리뷰 훅
- [ ] 🔴 `!!` 남용 / `CancellationException` 삼킴 / 무한 시퀀스 미종료 / 생성자 `this` 누출이 없는가.
- [ ] 🟠 무방비 `as` / `finally` 누락(리소스 누수) / 취소 불가 CPU 루프 / `async` 예외 미소비가 없는가.
- [ ] 🟠 생명주기 미관리 코루틴 / `Dispatchers.Unconfined` 일반 사용 / public API 타입·가시성·KDoc 누락이 없는가.
- [ ] 🟡 불필요한 `var`·가변 컬렉션 노출 / 기본값 미사용 / I/O 디스패처 미지정 / 잘못된 스코프 함수 선택이 없는가.
