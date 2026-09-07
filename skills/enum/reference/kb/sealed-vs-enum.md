---
title: Sealed vs Enum & Exhaustive when
source: https://kotlinlang.org/docs/sealed-classes.html
last_fetched: 2026-06-24
skills: [enum]
---

# Sealed vs Enum & Exhaustive `when`

Kotlin 공식 문서 `Sealed classes and interfaces` + `when` 표현식 distill.
(when 참고: https://kotlinlang.org/docs/control-flow.html#when-expressions-and-statements)

## sealed class / interface

- sealed 계층은 **컴파일타임에 하위 타입이 닫혀 있다**(같은 모듈/패키지에서만 상속).
- enum과 달리 각 변형이 **서로 다른 데이터**를 들 수 있다.

```kotlin
sealed interface LoadState
data object Loading : LoadState
data class Success(val data: List<String>) : LoadState
data class Error(val message: String) : LoadState
```

## 선택 기준: enum vs sealed

| 구분 | enum | sealed |
|------|------|--------|
| 인스턴스 | 고정된 상수 집합 | 닫힌 타입 계층 |
| 변형별 데이터 | 모두 동일한 형태 | 변형마다 다른 필드 가능 |
| 대표 용도 | 상태 라벨, 코드, 유형 | 결과/이벤트(성공/실패/로딩 등) |

- 항목들이 **같은 모양**이면 enum, **변형마다 들고 있는 값이 다르면** sealed.

## exhaustive `when` (컴파일타임 강제)

- `when`을 **표현식**(값을 반환)으로 쓰면, enum/sealed에 대해 컴파일러가 **모든 분기**를 요구한다.
- 모든 경우를 덮었다면 **`else`가 불필요**하다. 오히려 `else`를 쓰면 새 값 추가 시 경고가 안 떠
  처리 누락을 놓친다.

```kotlin
fun label(s: OrderStatus): String = when (s) {  // else 없음 → exhaustive
    OrderStatus.PENDING   -> "대기"
    OrderStatus.PAID      -> "결제완료"
    OrderStatus.SHIPPED   -> "배송중"
    OrderStatus.CANCELLED -> "취소"
}
```

- enum에 `REFUNDED`를 추가하면 위 `when`이 **컴파일 에러**가 되어 누락을 빌드 단계에서 잡는다.
- sealed도 동일하게 모든 하위 타입을 덮으면 exhaustive가 된다.

## 리뷰 훅

- [ ] enum/sealed 분기에서 불필요한 `else ->`로 exhaustive 안전망을 무력화하지 않았는가?
- [ ] `when`이 문(statement)이 아니라 표현식으로 쓰여 누락 검사가 작동하는가?
- [ ] 변형마다 데이터가 다른데 enum으로 욱여넣어 nullable 필드가 난무하지 않는가(→ sealed)?
- [ ] 단순 라벨 집합인데 불필요하게 sealed로 만들지 않았는가(→ enum)?
- [ ] 새 enum 값/하위 타입 추가 후 컴파일 에러가 난 모든 `when`을 처리했는가?
