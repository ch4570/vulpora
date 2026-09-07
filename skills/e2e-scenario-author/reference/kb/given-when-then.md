---
title: Given/When/Then 시나리오 구조
source: https://cucumber.io/docs/gherkin/reference/, https://kotest.io/docs/framework/testing-styles.html
last_fetched: 2026-06-24
skills: [e2e-scenario-author]
---

# KB: Given/When/Then (BDD 시나리오 구조)

## Gherkin 핵심 키워드 (공식 정의)
Gherkin은 줄 단위 키워드 언어다. 한 줄은 키워드로 시작하고 나머지는 텍스트다.

| 키워드 | 의미 | 카탈로그 대응 |
|--------|------|----------------|
| `Feature` | 테스트 대상 기능의 묶음(파일 최상위) | AREA(예: `ARTICLE`, `ORDER`) |
| `Scenario` / `Example` | 하나의 구체적 사례(시스템의 한 행위) | 시나리오 블록 1개 |
| `Given` | **사전 상태**(전제). 행위 이전에 이미 참인 맥락 | `Preconditions` / `Depends-on` |
| `When` | **행위**(트리거). 단일 사건이어야 함 | `Target` + 요청 fence |
| `Then` | **기대 결과**(관측). 단언 대상 | `Expected` |
| `And` / `But` | 직전 키워드 반복(가독성용) | 같은 칸에 다중 단언 |
| `Background` | 같은 Feature의 모든 시나리오 공통 `Given` | 공통 `Preconditions` |

- `Given`-`When`-`Then` 순서는 시간 흐름이다: 과거 상태 → 사건 → 결과.
- 키워드 자체는 매칭에 영향 없음. 그러나 **의미적 위치(전제/행위/결과)** 는 엄격히 지킨다.

## 좋은 시나리오 규칙 (Cucumber 권고)
1. **선언적(declarative)으로 쓰라, 명령적(imperative)으로 쓰지 마라.** "버튼을 클릭하고 필드에
   입력하고…"가 아니라 "주문을 제출하면"처럼 **의도**를 기술한다. UI 조작 단계 나열은 깨지기 쉽다.
2. **하나의 When = 하나의 행위.** When이 여러 사건을 담으면 무엇이 결과를 일으켰는지 불명확해진다.
   여러 행위가 필요하면 시나리오를 나눈다.
3. **Then은 관측 가능한 결과만 단언한다.** 내부 구현 상태가 아니라 외부에서 보이는 응답/이벤트/상태.
4. **Given은 결과에 영향을 주는 맥락만.** 무관한 전제는 노이즈다.
5. **시나리오는 독립적으로 읽혀야 한다.** 다른 시나리오 실행 순서에 의존하지 않는다(의존은 명시).

## 좋은/나쁜 예 (범용 예시)
```gherkin
# 나쁨: 명령적·다중 행위·구현 노출
Scenario: 주문
  Given DB에 row를 insert하고
  When /api/v1/orders 에 POST 하고 그 다음 GET 하고
  Then orders 테이블 row 수가 1 증가한다

# 좋음: 선언적·단일 행위·관측 가능 결과
Scenario: 유효한 주문 생성은 201을 반환한다
  Given 등록된 회원(memberId=100)이 있다
  When 회원이 유효한 주문을 제출한다
  Then 응답은 201 Created 이고 Location 헤더에 새 주문 URI가 있다
```

## Kotest BehaviorSpec 매핑 (JVM 구현)
Kotest의 `BehaviorSpec`은 Given/When/Then을 코드 블록으로 제공한다.

```kotlin
class OrderSpec : BehaviorSpec({
    given("등록된 회원") {
        `when`("유효한 주문을 제출하면") {
            then("201을 반환한다") { /* 단언 */ }
        }
    }
})
```
- `given { when { then } }` 중첩 구조. `and` 블록으로 분기 추가 가능.
- 카탈로그 시나리오 1개는 보통 `given→when→then` 한 경로에 대응한다.

## 카탈로그 블록과의 대응
- `Target`/요청 fence = **When**(행위와 그 대상).
- `Preconditions`/`Depends-on`/`Dataset` = **Given**(전제 상태·입력).
- `Expected` = **Then**(관측 결과·단언).
- 이 삼분 구조가 무너지면(예: Expected에 행위가, When에 단언이) 시나리오는 모호해진다.

## 리뷰 훅
- [ ] 시나리오가 **단일 행위(When)** 만 트리거하는가(복수 사건을 한 시나리오에 욱여넣지 않았는가).
- [ ] `Expected`(Then)가 **외부 관측 가능한 결과**만 단언하는가(내부 구현 상태 단언 금지).
- [ ] 전제(Given)가 결과에 영향을 주는 맥락만 담고, 무관한 셋업이 없는가.
- [ ] 명령적 UI/구현 단계 나열 대신 **의도 중심(선언적)** 으로 기술했는가.
- [ ] 시나리오 제목이 "행위 → 기대 결과"를 한 줄로 드러내는가(예: "유효한 주문은 201을 반환한다").
- [ ] 각 시나리오가 독립적으로 읽히는가. 순서 의존이 있으면 `Depends-on`으로 명시했는가.
