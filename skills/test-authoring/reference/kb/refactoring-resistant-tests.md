---
title: Refactoring-resistant Kotlin tests
source:
  - https://martinfowler.com/bliki/TestDouble.html
  - https://martinfowler.com/articles/mocksArentStubs.html
last_fetched: 2026-09-02
skills: [test-authoring]
---

# KB: 리팩터링 내성이 높은 Kotlin 테스트

## 목표: 변경 증폭을 줄인다

공개 계약이 그대로인 내부 리팩터링은 관련 없는 테스트를 연쇄 수정하게 만들지 않아야 한다. production
class나 method가 하나 바뀔 때 여러 spec의 private fake, fixture, `verify`가 함께 깨진다면 테스트가 동작보다
구조를 복제하고 있다는 신호다. 이 변경 증폭(change amplification)을 테스트 설계 문제로 취급한다.

## 결합 강도

| 결합 대상 | 내성 | 예시 |
| --- | --- | --- |
| 공개 반환값과 durable state | 높음 | 계산 결과, 저장 후 조회 결과, 발행된 payload의 계약 필드 |
| 실제 protocol/serialization/persistence 결과 | 높음 | Redis round trip, DB mapping, HTTP binding |
| 계약상 의미가 있는 interaction | 조건부 | 정확한 ID/payload/count, 외부 동작을 바꾸는 순서 |
| 내부 call graph와 concrete helper topology | 낮음 | 모든 내부 메서드 호출 순서, 내부 class별 mock |
| private member/method | 매우 낮음 | reflection, private method 직접 호출, private field 단언 |
| production interface를 복제한 one-off private fake | 매우 낮음 | 생성자 충족을 위해 spec마다 만든 interface 구현체 |

interaction은 그 호출 자체가 소비자 관점의 계약일 때만 고정한다. 공개 결과로 같은 위험을 잡을 수 있다면
결과를 단언한다.

## Private helper와 fake 선택 기준

다음 순서에서 가장 먼저 가능한 것을 고른다.

1. production value/domain object 또는 결정적인 production collaborator를 그대로 쓴다.
2. 입력 데이터가 장황하면 시나리오에 중요한 필드만 노출하는 기존 fixture/builder를 재사용한다.
3. 한 가지 고정 응답이면 API가 허용하는 lambda/object expression 또는 strict stub을 쓴다.
4. 상태 전이가 테스트 계약이고 실제 인프라가 부적합할 때만 작은 fake를 쓴다.
5. 실제 adapter 의미가 중요하면 fake를 키우지 말고 isolated actual-boundary test로 이동한다.

fake가 분기, retry, TTL, serialization, cache, persistence, timing 또는 concurrency 의미를 갖기 시작하면 테스트
안에서 production system을 다시 만들고 있는 것이다. 그 fake를 확장하지 말고 실제 경계를 검증한다.

shared fake는 여러 소비자가 동일한 안정 계약을 재사용하고 유지비를 줄일 때만 허용한다. 실제 구현과 의미가
같다고 주장한다면 재사용 가능한 contract cases를 정의하고 actual adapter와 fake에 모두 실행한다. 예를 들어
`StoreFactory`로 구현체를 공급받는 저장·조회·중복·실패 cases를 만들 수 있다. 모든 구현 세부를 공통화하지
말고, 소비자가 의존하는 계약만 공통화한다.

## 변경 증폭 리뷰

- production 내부 class를 합치거나 method를 이동해도 테스트가 그대로 통과하는가?
- 공개 결과는 같은데 mock/fake construction과 `verify`만 대량 수정되는가?
- 비슷한 private fake가 spec마다 production interface를 반복 구현하는가?
- fixture가 시나리오 입력을 숨기거나 production default를 복제하는가?
- shared helper를 바꾸면 관계없는 도메인의 기대값까지 함께 바뀌는가?

두 번째 이후 질문에 해당하면 helper를 더 추상화하기 전에 삭제, production object 재사용, observable assertion,
actual-boundary contract 중 더 작은 해법을 선택한다.

## 배포 신뢰의 증거 사슬

테스트 개수나 line coverage만으로 배포 가능을 선언하지 않는다. 변경 위험별로 다음 증거를 연결한다.

| 변경 위험 | 최소 증거 |
| --- | --- |
| 순수 규칙·변환 | 공개 결과의 정확한 값, 경계값, 실패값 |
| component 조합 | 결정적인 실제 collaborator를 함께 조립한 결과 |
| 외부 adapter | 실제 protocol/mapping/serialization round trip |
| timeout·예외·부분 실패 | focused strict mock 또는 명시적 failure injection |
| framework wiring·configuration | narrow slice/boot contract |
| schema·migration | 실제 DB schema와 repository round trip |

선택한 테스트가 실제로 실행됐는지, 어떤 잘못된 구현을 거부하는지, 실행하지 못한 증거는 무엇인지 기록한다.
필요한 계층을 실행하지 못했다면 `PASS`로 추정하지 말고 `NOT_RUN`과 이유를 남긴다.

## 리뷰 훅

- [ ] 공개 계약이 같은 내부 리팩터링이 unrelated spec 수정을 유발하지 않는가(`TST-9`).
- [ ] one-off private fake가 production interface를 복제하지 않는가(`TST-13`).
- [ ] shared fake의 parity 주장이 actual adapter와 같은 contract cases로 검증되는가(`TST-13`).
- [ ] 변경 위험마다 public outcome, real composition, actual boundary, failure evidence가 적절히 연결되는가(`TST-16`).
- [ ] 실행하지 않은 증거가 성공처럼 보고되지 않고 `NOT_RUN`으로 드러나는가(`TST-16`).
