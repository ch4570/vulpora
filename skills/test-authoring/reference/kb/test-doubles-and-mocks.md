---
title: 테스트 더블과 MockK
source: https://martinfowler.com/articles/mocksArentStubs.html
last_fetched: 2026-06-24
skills: [test-authoring]
---

# KB: 테스트 더블 / MockK

## 기본 순서: 통합 우선, mock은 경계에서만

테스트 대상과 실제 협력자가 빠르고 결정적으로 함께 동작한다면 먼저 그 조합으로 좁은 통합 테스트를
작성한다. mock은 테스트의 기본 재료가 아니다. 외부 I/O, 비용이 큰 인프라, 비결정적 시간·난수·네트워크,
또는 호출 자체가 공개 계약인 경우에만 경계를 대체한다.

mock이 필요하면 다음 순서로 제한한다.

1. 값 객체와 내부 도메인 객체는 실제 인스턴스로 만든다.
2. 결정적인 mapper·policy·assembler·service는 실제 객체로 조합한다.
3. Redis·DB·HTTP·Kafka·OpenSearch adapter는 실제 경계 계약 테스트를 하나 이상 둔다.
4. terminal I/O 경계만 mock하고, 시나리오를 통과하는 최소 호출만 `every`/`coEvery`로 stub한다.
5. 반환값·결과 상태를 먼저 단언한다. `verify`/`coVerify`는 호출 횟수나 인자가 계약일 때만 추가한다.
6. `relaxed = true`나 `relaxUnitFun = true`를 suite/base-class 기본값으로 두지 않는다. 꼭 필요한 한 mock에만
   사유와 함께 opt-in한다.

이 기준은 `TST-13`, `TST-14`의 적용 순서다.

## 테스트 더블 5분류 (Meszaros *xUnit Test Patterns*, Fowler 정리)
| 더블 | 역할 | 검증 방식 |
|------|------|-----------|
| **Dummy** | 인자 자리만 채움(사용 안 됨) | 없음 |
| **Stub** | 정해진 응답을 돌려줌(상태 제어) | 상태 검증 |
| **Spy** | 실제 호출을 **기록**(나중에 확인) | 행위 검증 |
| **Mock** | **기대(expectation)** 를 미리 설정하고 만족 여부를 검증 | 행위 검증 |
| **Fake** | 동작하는 **경량 구현**(인메모리 등) | 상태 + 행위 |
- 핵심: 이름이 아니라 **역할**로 고른다. "다 Mock"이라고 부르는 습관이 테스트를 구현에
  결합시킨다.

## mockist vs classicist (Fowler *Mocks Aren't Stubs*)
- **classicist(고전파)**: 가능하면 실제 객체를 쓰고 **상태(state)를 검증**한다. 외부 경계만 더블.
- **mockist**: mock으로 대체하고 **행위(interaction)를 검증**한다.
- Fowler의 균형: 둘 다 정당하지만, **상호작용 자체가 계약일 때만** 행위 검증을 써라. 우연한
  상호작용까지 단언하면 리팩터링에 부서진다.
- 이 스킬의 입장(`TST-13`): **복잡한 상태 로직엔 Fake**(호출 기록 + 상태 검증을 함께), **I/O
  경계·상호작용이 핵심일 때 MockK**.

## MockK 핵심 API
| 기능 | 형태 | 비고 |
|------|------|------|
| stub | `every { obj.f(args) } returns x` | 응답 고정. `throws`, `returnsMany`, `answers { }` |
| 코루틴 stub | `coEvery { obj.f() } returns x` | `suspend` 함수 |
| 검증 | `verify(exactly = n) { obj.f(any()) }` | `verify { }`, `verifyOrder`, `verifySequence` |
| 코루틴 검증 | `coVerify { }` | |
| 인자 매칭 | `any()`, `eq(v)`, `match { }`, `range(...)` | |
| 인자 캡처 | `val s = slot<T>(); every { f(capture(s)) } ...` | `s.captured`로 실제 인자 단언 |
| relaxed mock | `mockk(relaxed = true)` / `@MockK(relaxed = true)` | 미설정 호출에 기본값 반환 |
| relaxUnitFun | `relaxUnitFun = true` | `Unit` 반환 함수만 완화 |
| spy | `spyk(realObj)` | 실제 구현 + 부분 stub |

```kotlin
class OrderNotifierTest : AbstractMockTest() {
    @MockK private lateinit var sender: MessageSender
    private val sut by lazy { OrderNotifier(sender) }

    init {
        Given("주문 완료 알림") {
            val captured = slot<Message>()
            every { sender.send(capture(captured)) } returns Unit
            When("알림을 발송하면") {
                sut.notifyPlaced(order(id = "o-1"))
                Then("정확한 수신자·본문으로 1회 발송된다") {
                    captured.captured.recipient shouldBe "o-1"      // 캡처 인자
                    verify(exactly = 1) { sender.send(any()) }      // 상호작용
                }
            }
        }
    }
}
```

## 과도한 모킹의 위험 (`TST-14`)
- **값 객체/데이터 클래스를 모킹하지 마라.** 실제 인스턴스를 만드는 게 더 단순하고 정확하다.
- **우연한 상호작용을 단언하지 마라.** 계약이 아닌 호출(`verify`)은 구현 변경에 깨진다.
- mock이 많을수록 테스트는 "코드가 어떻게 동작하는지"가 아니라 "어떻게 짜였는지"를 고정한다 →
  리팩터링 저항.
- `relaxed = true`는 편하지만 **검증 누락**을 숨긴다. 꼭 필요한 곳에만, 가능하면
  `relaxUnitFun`으로 범위를 좁혀라.
- `any()`는 계약을 지우기 쉽다. 식별자, site/type, scope, payload, command처럼 잘못되면 운영 동작이
  달라지는 인자는 정확한 값으로 stub/verify하거나 capture 후 관련 필드를 모두 단언한다.
- 여러 단계의 pipeline을 모두 mock하면 연결 계약이 사라진다. 결정적인 중간 단계를 실제로 조합하고 최종
  외부 포트만 mock/fake로 남긴 composition test를 둔다.

## 외부 경계의 증명

SDK client나 template을 mock한 테스트는 요청 조립과 예외 분기에는 유용하지만, 외부 시스템이 실제로 그
요청을 받아들이는지는 증명하지 못한다. 다음 계약에는 격리된 실제 경계 테스트를 최소 하나 둔다.

| 경계 | 실제로 증명할 것 |
| --- | --- |
| Redis | serializer, key/TTL, pipeline/transaction, save-read-delete round trip |
| Database/JPA | mapping, constraint, transaction visibility, repository round trip |
| HTTP/Jackson | route, binding, validation, content type, status/error mapping |
| Kafka | serialization, topic/key/header, listener binding, ack/error behavior |
| OpenSearch | mapping acceptance, query semantics, bulk partial failure, alias/index behavior |

테스트용 resource는 disposable instance 또는 per-test namespace로 격리한다. shared target에 `FLUSHDB`,
전체 `TRUNCATE`, bucket/topic 전체 삭제 같은 global cleanup을 실행하지 않는다.

## Mutation-survival 점검

테스트를 완료하기 전에 “다음 잘못된 구현이 통과하는가?”를 한 번 묻는다.

- site/type 또는 ID가 다른 값으로 전달된다.
- payload의 핵심 필드가 빠진다.
- 실패 결과를 성공으로 취급한다.
- 예상하지 않은 저장·발행·삭제가 한 번 더 실행된다.
- 실제 mapper/policy 조합이 아닌 stub끼리만 연결된다.

하나라도 통과한다면 exact matcher, capture+state assertion, strict mock, real collaborator, 또는 narrow
integration test 중 가장 작은 보강을 선택한다.

## Fake 비용 기준 (`TST-13`)

fake는 mock의 자동 대체재가 아니다. 실제 구현보다 간단하면서도 하나의 안정적인 consumer-owned contract를
표현할 때만 쓴다. 한 응답만 필요하면 API가 허용하는 lambda/object expression이나 strict stub이 더 작고,
결정적인 조합을 검증하려면 production implementation을 그대로 쓰는 편이 강하다.

다음 fake는 만들지 않거나 제거한다.

- production interface의 메서드 대부분을 그대로 복제한다.
- retry, TTL, serialization, persistence, concurrency 같은 실제 adapter 의미를 다시 구현한다.
- 한 spec에서만 쓰는데 생성자나 인터페이스 변경 때 여러 메서드를 함께 고쳐야 한다.
- production interface가 바뀔 때 테스트 내부 private class들이 연쇄 수정된다.

여러 테스트가 동일한 안정 계약을 반복해서 필요로 할 때만 shared test fixture/fake로 승격한다. fake가 실제
adapter와 같은 의미를 제공한다고 주장한다면, 재사용 가능한 contract cases를 실제 adapter와 fake 모두에
실행해야 한다. 그런 parity를 증명할 수 없다면 fake는 편의 도구일 뿐 실제 경계 계약의 증거가 아니다.

## 리뷰 훅
- [ ] 더블을 역할(Dummy/Stub/Spy/Mock/Fake)에 맞게 골랐는가, "전부 mock"은 아닌가.
- [ ] fake가 실제로 setup을 줄이고 하나의 안정 계약을 모델링하는가, 아니면 production interface를 복제한 private class인가(`TST-13`).
- [ ] shared fake가 실제 adapter parity를 주장한다면 같은 contract cases가 양쪽에서 실행되는가(`TST-13`).
- [ ] 값 객체/데이터 클래스를 모킹하지 않았는가(`TST-14`).
- [ ] `verify`가 **계약상 상호작용**만 단언하고 우연한 호출을 단언하지 않는가(`TST-14`).
- [ ] `relaxed`로 검증을 숨기지 않았는가(필요 시 `relaxUnitFun`으로 범위 축소).
- [ ] 인자 검증이 필요한 곳에서 `slot`/`capture` 또는 `match`로 **실제 인자**를 단언했는가(`TST-7`).
- [ ] 외부 adapter는 SDK mock 외에 실제 경계 계약 테스트가 있는가(`TST-2`).
- [ ] 잘못된 site/ID/payload 또는 추가 부수효과가 테스트를 통과하지 않는가(`TST-14`, `TST-16`).
- [ ] integration cleanup이 shared resource 전체를 삭제하지 않는가(`TST-12`).
