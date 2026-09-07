---
title: 함수 구성 리팩터링 (Composing Functions)
source: Refactoring 2nd ed. (Fowler) ch.6 — https://martinfowler.com/books/refactoring.html
sources_extra:
  - https://refactoring.com/catalog/
last_fetched: 2026-06-24
skills: [refactoring-catalog]
---

# KB: 함수 구성 (Fowler ch.6)

> 가장 자주 쓰는 핵심군. **의도(이름)와 구현(본문)을 분리/통합**하는 것이 본질.
> 아래 센서 상태 예시는 이 저장소를 위해 작성한 Kotlin 예시다.

## 카탈로그 (이름 · 무엇을 · 언제 · 메커니즘 요약)
| 리팩터링 | 무엇을 / 언제 | 메커니즘(작은 단계) |
|----------|---------------|---------------------|
| **Extract Function** | 코드 조각에 이름을 줘 함수로 분리. "이 코드가 뭐 하는지" 주석을 달고 싶을 때 | 새 함수 작성 → 추출 코드 복사 → 지역변수를 매개변수로 전달 → 컴파일·테스트 → 원본을 호출로 치환 |
| **Inline Function** | 본문이 이름만큼 명확할 때 함수를 호출부에 흡수. 잘못된 추출 되돌리기 | 다형 메서드 아닌지 확인 → 호출부 모두 찾기 → 각 호출을 본문으로 치환(한 번에 하나) → 함수 제거 |
| **Extract Variable** | 복잡한 식 일부에 설명적 이름. 디버깅·가독성 | 식이 부수효과 없는지 확인 → 불변 변수 선언 → 식을 변수로 치환 → 테스트 |
| **Inline Variable** | 변수명이 식보다 더 말해주는 게 없을 때 | 우변이 부수효과 없는지 확인 → 변수 참조를 식으로 치환 → 변수 제거 |
| **Change Function Declaration** | 이름·매개변수(시그니처) 개선 | 간단: 직접 변경. 안전(점진): 본문 추출→새 시그니처 함수 만들기→옛 함수가 새 함수 위임→호출부 이전→옛 함수 inline |
| **Combine Functions into Class** | 같은 데이터로 작동하는 함수 묶음을 클래스로 | 공통 데이터를 레코드로 캡슐화 → 각 함수를 클래스 메서드로 Move → 파생 로직은 메서드/게터로 |
| **Combine Functions into Transform** | 파생값 계산을 한 변환 함수/단계로 모음(읽기 전용 데이터) | 입력 복사를 반환하는 변환 함수 작성 → 파생 계산 로직을 Move → 호출부가 변환 결과를 읽게 |
| **Split Phase** | 서로 다른 두 일을 하는 코드를 단계로 분리(파싱→계산 등) | 두 번째 단계를 함수로 추출 → 중간 데이터 구조 도입 → 첫 단계가 중간구조를 채우게 → 각 단계 정리 |
| **Replace Temp with Query** | 임시 변수를 함수(질의)로. Extract Function 사전작업 | 변수가 한 번만 대입되는지 확인 → 우변을 함수로 추출 → 변수 참조를 함수 호출로 치환 → 변수 제거 |

## 적용 예 (Extract Function)
```kotlin
data class SensorReading(val online: Boolean, val batteryPercent: Int)

// before — 화면 문구 안에 장비 사용 가능 조건이 섞여 있다.
fun formatSensorSummary(readings: List<SensorReading>): String {
    val available = readings.count { it.online && it.batteryPercent >= 20 }
    return "사용 가능 센서: $available / ${readings.size}"
}

// after — 조건에 이름을 주면 문구와 장비 정책을 따로 읽을 수 있다.
fun formatSensorSummary(readings: List<SensorReading>): String {
    val available = readings.count(::isSensorAvailable)
    return "사용 가능 센서: $available / ${readings.size}"
}

fun isSensorAvailable(reading: SensorReading): Boolean =
    reading.online && reading.batteryPercent >= 20
```

## 판단 포인트
- **Extract vs Inline는 짝**이다. 과추출로 잘게 부서지면 Inline으로 되돌린다. 기준은 "이름이 본문보다 의미를 더 주는가".
- Replace Temp with Query는 **Extract Function의 사전 정리**로 자주 쓰인다(지역변수를 줄여 추출을 쉽게).
- Change Function Declaration은 공개 API라면 **점진(마이그레이션) 메커니즘**으로 옛 함수를 한동안 위임시켜 둔다.

## 리뷰 훅
- [ ] 함수에 "이 부분은 X를 한다" 주석을 달고 싶다면 → 그 블록을 Extract Function 했는가.
- [ ] 임시 변수가 본문 안에서만 쓰이고 재대입이 없다면 → Replace Temp with Query를 고려했는가.
- [ ] 복잡한 boolean/산술 식이 그대로 조건문에 박혀 있는가 → Extract Variable로 이름 붙였는가.
- [ ] "입력 검증/파싱 → 핵심 계산"이 한 함수에 뒤엉켜 있는가 → Split Phase 했는가.
- [ ] 같은 레코드를 인자로 받는 함수가 여럿이라면 → Combine Functions into Class/Transform 후보인가.
- [ ] 시그니처 변경이 공개 API인가 → 점진적 Change Function Declaration(위임)으로 호출부를 안전 이전했는가.
