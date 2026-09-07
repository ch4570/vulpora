---
title: 데이터 조직화 리팩터링 (Organizing Data)
source: Refactoring 2nd ed. (Fowler) ch.9 — https://martinfowler.com/books/refactoring.html
sources_extra:
  - https://refactoring.com/catalog/
  - Refactoring 2nd ed. ch.7 (Encapsulation)
last_fetched: 2026-06-24
skills: [refactoring-catalog]
---

# KB: 데이터 조직화 (Fowler ch.9 + ch.7 캡슐화)

> 데이터 구조와 접근을 정리한다. **가변 데이터·기본형 집착**을 줄이고 변경 경로를 좁힌다.
> 예시는 Money, Member, PaymentType 등 중립 엔티티.

## 카탈로그 (이름 · 무엇을 / 언제 · 메커니즘 요약)
| 리팩터링 | 무엇을 / 언제 | 메커니즘(작은 단계) |
|----------|---------------|---------------------|
| **Split Variable** | 한 변수에 여러 의미를 재대입할 때 의미별로 분리 | 첫 대입에서 변수 선언(가능하면 불변) → 두 번째 의미는 새 변수로 → 각 사용처 갱신 → 테스트 |
| **Rename Field** | 레코드 필드명이 의도를 못 드러냄 | (캡슐화돼 있으면) 접근자부터 개명 → 내부 필드 개명 → 호출부 이전 |
| **Replace Primitive with Object** | 원시값에 행위/검증이 붙기 시작할 때 값 객체로 | 값을 감싸는 클래스 생성 → 필드를 그 타입으로 → 게터/세터가 새 객체 경유 → 행위를 객체로 Move |
| **Replace Derived Variable with Query** | 저장된 파생값(중복 상태)을 계산 함수로 | 파생값 갱신 지점 모두 확인 → 계산 함수 작성 → 읽기를 함수로 치환 → 저장 필드 제거 |
| **Change Reference to Value** | 내부 객체를 불변 값처럼 다루고 싶을 때 | 후보가 불변인지 확인 → equals/hashCode를 값 기반으로 → 세터 제거(교체로 변경) |
| **Change Value to Reference** | 같은 논리적 개체가 사본으로 흩어질 때 공유 참조로 | 저장소(repository) 도입 → 생성을 저장소 경유로 → 사본을 공유 인스턴스로 |
| **Encapsulate Variable** | 전역/광역 데이터의 직접 접근을 함수 뒤로 | 접근 함수(get/set) 작성 → 직접 참조를 함수로 치환 → 변수 가시성 축소 → 필요 시 값까지 캡슐화 |
| **Encapsulate Record** | 가변 레코드/맵을 클래스 접근자 뒤로 | 레코드를 감싸는 클래스 생성 → 접근을 게터로 → 원시 맵 노출 제거 |
| **Encapsulate Collection** | 컬렉션 게터가 내부를 그대로 노출할 때 | add/remove 메서드 제공 → 게터는 **읽기 전용 사본/뷰** 반환 → 외부의 직접 변경 차단 |

## 적용 예 (Encapsulate Collection)
```kotlin
class Order(private val _lines: MutableList<OrderLine> = mutableListOf()) {
    val lines: List<OrderLine> get() = _lines.toList() // 불변 뷰 반환
    fun addLine(line: OrderLine) { _lines.add(line) }  // 변경은 메서드로만
}
```

## 판단 포인트
- **캡슐화(ch.7)가 데이터 조직화의 토대**다: 직접 접근을 함수 뒤로 숨겨야 이후 Move/Rename/타입교체가 안전해진다.
- Replace Derived Variable with Query는 **갱신 누락 버그**(파생값과 원본 불일치)를 근본 제거한다. 단 계산 비용이 크면 캐싱은 별도 결정.
- Replace Primitive with Object는 Primitive Obsession 처방의 1순위. 금액·식별자·코드값이 후보.
- Change Reference↔Value는 가역. 공유 동일성이 필요하면 Reference, 불변 동등성이면 Value.

## 리뷰 훅
- [ ] 한 변수가 루프 누적과 다른 의미로 **두 번 이상 재대입**되는가(Split Variable).
- [ ] 금액/식별자/코드값을 String·Int 원시형으로 직접 다루고 검증이 흩어졌는가(Replace Primitive with Object).
- [ ] 객체 상태에 **저장된 파생 필드**가 있고 원본과 동기화 코드가 흩어졌는가(Replace Derived Variable with Query).
- [ ] 전역/광역 변수에 코드 곳곳이 직접 접근하는가(Encapsulate Variable).
- [ ] 컬렉션 게터가 **내부 가변 컬렉션 그대로** 반환하는가 → 외부에서 변경 가능(Encapsulate Collection).
- [ ] 필드명이 약어/모호어인가 → (캡슐화 후) Rename Field 가능한가.
