---
title: AAA / Given-When-Then 구조와 명명
source: https://kotest.io/docs/framework/testing-styles.html
last_fetched: 2026-06-24
skills: [test-authoring]
---

# KB: AAA / Given-When-Then 과 명명 규칙

## Arrange-Act-Assert (AAA) / Four-Phase Test
- 모든 테스트는 세 국면으로 구성된다(Meszaros의 Four-Phase에서 teardown을 합친 형태):
  1. **Arrange(준비)**: 입력·협력자·기대 응답(stub)을 셋업한다.
  2. **Act(실행)**: 테스트 대상(`sut`)의 단 하나의 동작을 호출한다.
  3. **Assert(검증)**: 관측 가능한 결과를 단언한다.
- 세 국면을 **시각적으로 분리**하라. 한 덩어리로 엉키면 무엇이 입력이고 무엇이 기대인지 흐려진다.
- Act는 **한 번**이어야 한다. 한 테스트에서 여러 동작을 실행하면 무엇을 검증하는지 모호해진다.

## BDD: Given-When-Then (Kotest BehaviorSpec가 감지된 경우)
- Kotest `BehaviorSpec`은 AAA를 BDD 문장으로 표현한다: **Given(전제) → When(행위) → Then(기대)**.
  Given=Arrange, When=Act, Then=Assert에 대응한다.
- `BehaviorSpec`은 중첩 블록 구조를 가진다. `Given`/`When` 아래에 여러 분기를 둘 수 있어,
  **조건별 시나리오를 트리로** 표현한다.
- 같은 `When` 결과에 대한 서로 다른 동작은 **별도의 `Then`**, 서로 다른 전제는 **별도의 `Given`**으로
  나눈다(한 리프 = 한 시나리오, `TST-4`).

```kotlin
class OrderServiceTest : AbstractMockTest() {
    @MockK private lateinit var repository: OrderRepository
    private val sut by lazy { OrderService(repository) }

    init {
        Given("재고가 있는 상품 주문") {                 // Arrange (전제)
            val expectedOrder = order(id = "o-1")
            every { repository.save(expectedOrder) } returns expectedOrder
            When("주문을 생성하면") {                    // Act
                val actualResult = sut.place(requestFor(expectedOrder))
                Then("주문이 저장되고 ID가 반환된다") {    // Assert
                    actualResult.id shouldBe "o-1"
                    verify(exactly = 1) { repository.save(expectedOrder) }
                }
            }
        }
    }
}
```

## Kotest 테스트 스타일과 BDD 키워드
| 스타일 | BDD 키워드 | 비고 |
|--------|-----------|------|
| `BehaviorSpec` | `Given`/`When`/`Then`(+`And`) | 저장소가 이미 이 스타일을 사용할 때 유지 |
| `DescribeSpec` | `describe`/`context`/`it` | RSpec 류 |
| `FunSpec` | `test(...)` | 단순·평면 |
| `StringSpec` | `"...should..." { }` | 가장 간결 |

## 명명 규칙 (`TST-3`)
- 저장소의 기존 명명 규칙을 우선한다. 해당 프로필이 이미 사용 중이면 **Spec 이름**은
  `{UnitUnderTest}Test`, 대상은 `sut`, 관측값은 `actualResult`를 유지한다.
- **시나리오 문장**: Given/When/Then을 **행위를 서술하는 자연어**로 쓴다. "메서드 이름"이 아니라
  "어떤 조건에서 무슨 동작을 보장하는가"를 적는다.
  - 나쁨: `Then("testSave")` / 좋음: `Then("중복 주문번호면 예외를 던진다")`
- 테스트 안에 **분기/임의 반복으로 어서션을 결정하는 로직 금지(`TST-5`)**. 위에서 아래로 고정된
  시나리오로 읽혀야 한다. 프레임워크가 제공하는 독립적·진단 가능한 데이터 주도 케이스는 허용된다.

## 리뷰 훅
- [ ] Arrange/Act/Assert(또는 Given/When/Then)가 시각적으로 분리되어 있는가.
- [ ] Act(`When`)가 **단 하나의 동작**만 실행하는가.
- [ ] 한 `Then`(리프)이 **한 시나리오**만 검증하는가(`TST-4`).
- [ ] Spec/대상/관측값 명명이 감지된 저장소 규칙을 따르는가(`TST-3`).
- [ ] Given/When/Then 문장이 메서드명이 아니라 **행위 서술**인가.
- [ ] 테스트 안에 어서션을 분기/반복으로 결정하는 로직이 없는가(`TST-5`).
