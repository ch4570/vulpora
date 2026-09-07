---
title: 기능 이동 리팩터링 (Moving Features)
source: Refactoring 2nd ed. (Fowler) ch.8 — https://martinfowler.com/books/refactoring.html
sources_extra:
  - https://refactoring.com/catalog/
last_fetched: 2026-06-24
skills: [refactoring-catalog]
---

# KB: 기능 이동 (Fowler ch.8)

> 요소를 **있어야 할 곳**으로 옮긴다. Feature Envy·Shotgun Surgery·중복 반복문을 해소.
> 예시는 Order, Member, Product 등 중립 엔티티.

## 카탈로그 (이름 · 무엇을 / 언제 · 메커니즘 요약)
| 리팩터링 | 무엇을 / 언제 | 메커니즘(작은 단계) |
|----------|---------------|---------------------|
| **Move Function** | 함수가 자기 모듈보다 다른 모듈 데이터를 더 쓸 때 그쪽으로 이동 | 의존 요소 확인 → 대상에 함수 복사·적응 → 원본을 위임으로 만들거나 호출부 갱신 → 테스트 → 원본 제거 |
| **Move Field** | 필드가 다른 레코드와 더 자주 함께 쓰일 때 이동 | 필드 캡슐화(접근자) → 대상에 필드·접근자 생성 → 원본 접근자가 대상을 참조하게 → 호출부 이전 → 원본 필드 제거 |
| **Move Statements into Function** | 호출부마다 반복되는 같은 문장을 함수 안으로 | 반복 문장이 호출 직전/직후에 항상 붙는지 확인 → Slide로 인접화 → 함수 안으로 옮김 → 호출부 정리 |
| **Move Statements to Callers** | 함수 안 일부가 호출자마다 달라져야 할 때 밖으로 | 해당 문장을 호출부로 추출/복제 → 함수에서 제거 → 호출부 정리 |
| **Slide Statements** | 관련된 코드를 가까이 모음(추출 사전작업) | 이동 구간의 부수효과·의존 충돌 없는지 확인 → 한 칸씩 이동 → 매번 테스트 |
| **Split Loop** | 한 반복문이 여러 일을 할 때 분리(각자 단일 책임) | 반복문 복제 → 각 사본에서 한 가지 일만 남김 → (성능 우려 시 이후 측정 후 판단) → 각 반복을 함수로 추출 가능 |
| **Replace Loop with Pipeline** | 반복+조건+수집을 컬렉션 파이프라인으로 | 반복 변수에서 시작 → filter/map 등으로 한 연산씩 치환 → 매번 테스트 → 빈 반복문 제거 |
| **Remove Dead Code** | 호출되지 않는 코드 제거 | 참조 없음을 확인(빌드/검색/커버리지) → 삭제 → 테스트. 버전관리가 복구를 보장 |

## 적용 예 (Replace Loop with Pipeline)
```kotlin
// before
val names = mutableListOf<String>()
for (m in members) if (m.active) names.add(m.name)
// after
val names = members.filter { it.active }.map { it.name }
```

## 판단 포인트
- **Slide Statements**는 Extract Function의 단골 사전작업이다. 흩어진 관련 코드를 먼저 인접시킨다.
- Split Loop는 가독성을 위해 반복을 늘리는 것처럼 보이지만, 성능은 **나중에 측정 후** 판단한다(보통 무시할 수준, 필요하면 다시 합침).
- Move는 항상 **복사→적응→호출부 이전→원본 제거**의 순서. 한 번에 옮기고 지우지 않는다.
- Remove Dead Code 전, "리플렉션/DI/외부 호출"로 쓰이는지 검색 범위를 넓혀 확인한다.

## 리뷰 훅
- [ ] 어떤 함수가 자기 클래스 필드보다 **다른 객체의 게터**를 더 많이 호출하는가(Move Function 후보).
- [ ] 두 필드가 늘 함께 이동·계산되는가 → 한쪽으로 Move Field 또는 Extract Class.
- [ ] 모든 호출부가 함수 호출 직전/직후 같은 문장을 반복하는가(Move Statements into Function).
- [ ] 하나의 반복문이 합계+필터+포맷 등 여러 책임을 동시에 하는가(Split Loop).
- [ ] 반복문이 filter/map/reduce로 표현 가능한 누적 패턴인가(Replace Loop with Pipeline).
- [ ] 주석 처리되거나 호출되지 않는 코드가 남아 있는가 → 참조 0 확인 후 Remove Dead Code.
