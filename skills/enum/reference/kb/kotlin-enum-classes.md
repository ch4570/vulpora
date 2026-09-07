---
title: Kotlin Enum Classes
source: https://kotlinlang.org/docs/enum-classes.html
last_fetched: 2026-06-24
skills: [enum]
---

# Kotlin Enum Classes

Kotlin 공식 문서 `Enum classes` distill. enum은 **고정된 상수 집합**을 타입 안전하게 표현한다.

## 기본

```kotlin
enum class Direction { NORTH, SOUTH, EAST, WEST }
```

- 각 상수는 enum 클래스의 **객체(인스턴스)** 이며, 컴파일타임에 개수가 고정된다.

## 생성자 프로퍼티

상수에 데이터를 붙일 수 있다. 표시 텍스트/와이어 코드 매핑에 자주 쓴다.

```kotlin
enum class OrderStatus(val code: Int, val label: String) {
    PENDING(0, "대기"),
    PAID(1, "결제완료"),
    SHIPPED(2, "배송중"),
    CANCELLED(3, "취소"),
}
```

## 내장 멤버 / 헬퍼

- `entries` — 모든 상수를 담은 불변 리스트(코틀린 1.9+). 과거 `values()`의 대체이며 매번
  새 배열을 만들지 않아 더 낫다.
- `valueOf(name)` — 이름으로 상수 조회. **없으면 `IllegalArgumentException`** → 외부 입력엔
  직접 쓰지 말고 폴백 헬퍼로 감싼다.
- `enumValues<T>()` / `enumEntries<T>()`, `enumValueOf<T>(name)` — 제네릭 컨텍스트용.
- 각 상수의 `name`(선언 식별자), `ordinal`(선언 순서, 0부터).

```kotlin
inline fun <reified T : Enum<T>> fromNameOrNull(name: String): T? =
    enumEntries<T>().firstOrNull { it.name == name }
```

## 메서드·추상 멤버

상수별로 동작을 다르게 줄 수 있다(상수별 익명 클래스).

```kotlin
enum class Operation {
    PLUS { override fun apply(a: Int, b: Int) = a + b },
    TIMES { override fun apply(a: Int, b: Int) = a * b };
    abstract fun apply(a: Int, b: Int): Int
}
```

## ordinal/name 사용 주의 (중요)

- **`ordinal`을 영속/직렬화에 쓰지 말 것.** 상수를 추가/재배치하면 값이 통째로 어긋난다.
  저장·전송에는 `name` 또는 명시적 `code` 프로퍼티를 쓴다.
- `name`도 enum 상수를 **리네이밍**하면 깨진다 — 직렬화 계약이 걸린 enum의 상수 이름은
  함부로 바꾸지 않는다(`@JsonProperty`로 와이어 이름을 고정하는 편이 안전).

## 리뷰 훅

- [ ] `ordinal`을 DB 저장이나 외부 전송에 쓰고 있지 않은가?
- [ ] 외부 입력을 `valueOf()`로 직접 변환해 예외 가능성을 방치하지 않았는가?
- [ ] `values()` 대신 `entries`를 쓰고 있는가(1.9+)?
- [ ] 직렬화 계약이 걸린 enum의 상수를 무분별하게 리네이밍하지 않았는가?
- [ ] 상수별 데이터(표시 텍스트/코드)는 생성자 프로퍼티로 분리되어 있는가?
