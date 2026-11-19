---
title: 부하 모델 — open과 closed, k6 executor와 Gatling injection
source: https://grafana.com/docs/k6/latest/using-k6/scenarios/concepts/open-vs-closed/
additional_sources:
  - https://grafana.com/docs/k6/latest/using-k6/scenarios/
  - https://docs.gatling.io/concepts/injection/
last_fetched: 2026-10-28
skills: [load-test-engineer]
---

# 부하 모델 — open과 closed

- **closed 모델**: 반복 하나가 끝나야 다음 반복이 시작된다. 응답이 느려지면 처리량도 함께 줄어 대상의 문제를
  가린다(k6 문서는 이를 coordinated omission으로 소개한다).
- **open 모델**: 사용자가 응답과 무관하게 도착한다. k6는 `constant-arrival-rate`, `ramping-arrival-rate` 두
  executor로 구현하고, 나머지 executor는 closed 모델이다.
- Gatling은 `injectOpen`(`constantUsersPerSec`, `rampUsersPerSec`, `atOnceUsers`, `rampUsers`, `stressPeakUsers`,
  `nothingFor`)과 `injectClosed`(`constantConcurrentUsers`, `rampConcurrentUsers`)로 같은 구분을 둔다.

## "사용자 N명"을 계획으로 바꾸기

| 요청의 뜻 | 모델 | k6 |
|---|---|---|
| 동시에 접속해 있는 사용자 N명 | closed | `constant-vus`/`ramping-vus`, `vus: N` |
| 초당 N명(건)이 들어온다 | open | `constant-arrival-rate`/`ramping-arrival-rate`, `rate: N`, `timeUnit: '1s'` |
| 하루 N명 | open | 피크 시간대 비율로 초당 도착률을 계산하고 계산식을 계획에 적는다 |

arrival-rate executor는 `preAllocatedVUs`와 `maxVUs`가 충분해야 목표 도착률을 낸다. 부족하면
`dropped_iterations`가 쌓이고 그 구간 결과는 목표 부하를 대표하지 않는다.

## 형태

- 기준선: 예상 부하로 일정 시간 유지.
- 한계 탐색: 단계적으로 올리며 p95·오류율이 꺾이는 지점을 찾는다.
- 스파이크: 짧은 시간에 급증 후 복귀.
- 장시간 유지: 수십 분 이상 유지하며 메모리·커넥션 누수와 점진적 저하를 본다.

모든 형태는 워밍업 구간을 앞에 두고, 보고에서 워밍업을 기준선과 분리한다.

## 리뷰 훅

- [ ] 요청의 "사용자 N명"이 closed인지 open인지 계획에 명시됐다.
- [ ] arrival-rate면 `maxVUs`가 목표 도착률 × 예상 반복 시간을 넉넉히 넘는다.
- [ ] 워밍업 구간이 있다.
- [ ] 트래픽 구성(엔드포인트 비율)이 근거(로그, 요구)와 함께 적혔다.
