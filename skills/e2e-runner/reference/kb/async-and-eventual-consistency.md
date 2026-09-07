---
title: 비동기 / 최종일관성 E2E
source: https://github.com/awaitility/awaitility/wiki/Usage, https://kafka.apache.org/documentation/
last_fetched: 2026-06-24
skills: [e2e-runner]
---

# KB: 비동기 / 최종일관성(eventual consistency) E2E

## 왜 동기 단언이 안 되는가
이벤트 기반/비동기 흐름은 **요청 즉시 결과가 보이지 않는다.** 메시지를 produce해도 컨슈머가
처리해 부작용(DB row, 검색 인덱스 문서, 캐시 키)을 남기기까지 시간이 걸린다. 이것이
**최종일관성(eventual consistency)**: "언젠가는 일관됨". 따라서 단언은 "지금 맞는가"가 아니라
**"유한 시간 안에 맞아지는가"** 로 바뀐다.

- **금지**: `sleep(고정시간)` 후 단언 → 너무 짧으면 플레이키, 너무 길면 느림(KB `flaky-tests`).
- **권장**: **bounded polling** — 유한한 deadline까지 일정 interval로 조건을 다시 확인.

## bounded polling = 재시도가 아니다
SKILL.md `RUN-2.1`/`RUN-12`: 폴링은 **단일 관측**이다. 시나리오는 "조건이 처음 성립하는
순간"을 한 번 관측하며, 그 순간 성공한다. 이는 실패를 숨기려 같은 요청을 다시 던지는
auto-retry와 다르다.
- 기본값(`RUN-12`): deadline `5s`, interval `250ms`. 시나리오가 `Expected` 행에서
  `deadline=15s; interval=500ms` 식으로 재정의 가능.
- **deadline은 반드시 유한**해야 한다. unbounded polling 금지.

## Awaitility 패턴 (bounded polling의 표준)
JVM 진영의 bounded-polling DSL. 비동기 조건을 선언적으로 기다린다.

```java
await()
    .atMost(15, SECONDS)          // deadline (유한)
    .pollInterval(500, MILLISECONDS)
    .pollDelay(0, MILLISECONDS)   // 첫 확인 전 지연
    .untilAsserted(() ->
        assertThat(repository.findById(id)).isPresent());
```

규칙(Awaitility Usage):
- **`atMost(...)`** 없는 무한 대기 금지 — 항상 상한을 둔다.
- **`untilAsserted`** 는 단언이 통과할 때까지 폴링; 단언 예외는 마지막 시도까지 삼키고,
  최종 실패 시 마지막 예외를 던진다 → 증거로 마지막 실패 상태가 남는다.
- `pollDelay` 는 "처음부터 참일 리 없는" 경우 첫 확인을 늦춰 불필요한 실패를 줄인다.
- 폴링 대상은 **부작용(side-effect)** — DB row, 검색 문서, 캐시 키 — 이지 메시지 자체가 아니다.

## Kafka E2E (consume / publish / DLQ / lag)
SKILL.md `RUN-12.1`은 시나리오 slug로 평가기를 고른다.

| 패턴 | 절차 | 단언 |
|------|------|------|
| **CONSUME** | 입력 메시지를 produce → 워커의 부작용(DB/검색/캐시)을 deadline까지 폴링 | 부작용이 나타나는가 + 시작/끝 **consumer lag** 기록 |
| **PUBLISH** | producer 쪽을 트리거 | outbox row가 DB에 있거나(발행측) 대상 토픽에 메시지가 나타나는가(워커측) |
| **DLQ** | 반드시 실패하는 메시지를 produce | deadline 내 DLQ 토픽에 정확히 1건. DLQ 토픽 = `<source-topic>.DLQ`(또는 `Expected`의 `dlq=` 오버라이드) |

Kafka 핵심 개념(공식 문서):
- **Consumer offset / lag**: lag = (파티션의 최신 오프셋, log-end-offset) − (컨슈머가 커밋한
  오프셋). lag가 줄지 않으면 컨슈머가 못 따라가거나 멈춘 것 → 비동기 시나리오가 deadline
  안에 안 끝나는 흔한 원인. 러너는 폴링 시작/끝 lag를 **증거로 캡처**한다.
- **At-least-once 배달**: Kafka 기본 의미는 적어도 한 번. 컨슈머가 **멱등**하지 않으면 중복
  처리될 수 있다 → 시나리오 단언은 "정확히 1건"을 검증할 때 중복 가능성을 의식한다.
- **Rebalancing**: 컨슈머 그룹 멤버 변화 시 파티션이 재할당된다. 실행 중 rebalancing은
  지연/일시적 미처리를 유발 → 러너는 컨슈머 그룹 상태로 감지해 **증거로 기록**하되
  auto-retry하지 않는다(시나리오는 여전히 1회 실행, `RUN-12.1`).
- **DLQ(Dead Letter Queue)**: 처리 실패 메시지를 격리하는 별도 토픽. DLQ에 메시지가
  쌓인다 = 컨슈머가 그 메시지를 영구히 처리 못 함. DLQ 시나리오는 이 격리가 동작하는지 본다.
- 토픽 이름은 중립 예시로: `article-events`, `order-events`, `article-events.DLQ`.

## 리뷰 훅
- [ ] 비동기 검증이 `sleep(고정)`이 아니라 **bounded polling**(유한 deadline + interval)인가.
- [ ] deadline이 명시되어 있는가(unbounded polling 없음, `RUN-12`).
- [ ] 폴링 대상이 **부작용(DB/검색/캐시)** 인가(메시지 발행만 보고 끝나지 않는가).
- [ ] Kafka 시나리오 slug(CONSUME/PUBLISH/DLQ)에 맞는 평가기를 쓰는가(`RUN-12.1`).
- [ ] consumer **lag**를 시작/끝에 캡처해 증거로 남기는가.
- [ ] DLQ 시나리오가 "정확히 1건" + 올바른 DLQ 토픽(`<source>.DLQ` 또는 오버라이드)을 보는가.
- [ ] at-least-once로 인한 **중복**·rebalancing을 단언이 의식하는가(중복에 깨지지 않는가).
- [ ] polling이 재시도로 변질되지 않았는가(시나리오는 1회 관측, `RUN-2.1`).
