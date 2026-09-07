---
title: Agentic coding test safety net
source:
  - https://openai.com/index/harness-engineering/
  - https://openai.com/index/how-we-monitor-internal-coding-agents-misalignment/
  - https://testing.googleblog.com/2014/03/testing-on-toilet-what-makes-good-test.html
  - https://testing.googleblog.com/2014/05/testing-on-toilet-effective-testing.html
  - https://testing.googleblog.com/2015/01/testing-on-toilet-change-detector-tests.html
  - https://testing.googleblog.com/2020/12/test-flakiness-one-of-main-challenges.html
  - https://martinfowler.com/articles/continuousIntegration.html
last_fetched: 2026-09-02
skills: [test-authoring]
---

# KB: Agentic coding 시대의 테스트 안전망

## 위협 모델

coding agent는 production code뿐 아니라 test, fixture, snapshot, coverage rule, CI configuration도 함께 바꿀
수 있다. 따라서 “테스트가 초록이다”와 “변경이 안전하다”는 같은 명제가 아니다. OpenAI의 internal coding
agent monitoring 사례는 테스트를 항상 통과시키도록 약화하거나 check를 비활성화하는 reward hacking을 별도
위험으로 분류한다. agent-first repository 경험도 신뢰 가능한 작업에는 agent가 읽고 실행할 수 있는 격리된
환경, 명확한 feedback loop, repository-local guardrail이 필요하다고 설명한다.

이 스킬의 안전망은 우발적이든 의도적이든 다음 false green을 막는다.

- 구현과 expectation을 같은 방향으로 잘못 바꿔 서로 확인한다.
- assertion, matcher, threshold, snapshot을 약화해 현재 구현만 통과시킨다.
- mock/fake가 production과 같은 잘못된 가정을 복제한다.
- selected test만 실행하고 boundary, module, wiring 회귀를 놓친다.
- 외부 shared environment나 순서 의존 때문에 결과가 재현되지 않는다.

## 안전망의 다섯 층

| 층 | 질문 | 증거 |
| --- | --- | --- |
| 계약 oracle | 사용자·consumer 관점에서 무엇이 맞아야 하는가? | 공개 결과, durable state, protocol contract |
| negative proof | 이 테스트는 실제 결함에서 빨개지는가? | RED-before-GREEN, controlled mutation/revert |
| orthogonal proof | 같은 가정을 복제하지 않은 다른 경로가 있는가? | real composition, actual boundary, focused failure injection |
| hermetic execution | 다른 실행과 환경에 상관없이 재현되는가? | disposable resource, unique namespace, fixed time/seed |
| staged verification | 변경 영향 범위까지 실행했는가? | selected → module → boundary → required repository checks |

Google Testing Blog의 fidelity, resilience, precision 기준을 함께 적용한다. 결함이면 실패해야 하고, 결함이
아닌 리팩터링에는 실패하지 않아야 하며, 실패했을 때 원인을 좁게 가리켜야 한다. agentic 환경에서는 여기에
oracle integrity를 추가한다: 테스트 자신이 같은 변경에서 약해지지 않았음을 보여야 한다.

## Oracle-integrity audit (`TST-19`)

production diff와 test-side diff를 분리해서 읽고 각 변경을 분류한다.

| 분류 | 허용 조건 |
| --- | --- |
| 새 behavior proof | 요청된 동작과 failure mode를 새로 잡는다 |
| intentional contract update | 요구사항·API 계약 변경으로 기대값이 달라졌다는 근거가 있다 |
| strength-preserving maintenance | rename/move/framework migration 뒤에도 같은 faulty implementation을 거부한다 |
| weakening | matcher 확대, assertion 제거, skip, relaxed 전환, threshold 하향, 무검토 snapshot 재생성 |

마지막 분류는 완료 조건이 아니다. 계약이 정말 바뀐 것이라면 변경 근거와 이전 behavior를 더 이상 보장하지
않는다는 사실을 명시한다. 특히 대량 snapshot/golden update는 생성 명령 성공이 아니라 의미 변화 review가
필요하다.

agent가 건드리지 않은 기존 regression test도 보존한다. cleanup/refactor라면 편집 전에 관련 테스트를 먼저
실행해 baseline을 잠그고, 동작이 바뀌지 않았는데 테스트 기대값을 바꾸지 않는다.

## Negative proof (`TST-20`)

테스트가 존재한다는 사실보다 실제 결함을 탐지한다는 증거가 강하다.

1. 새 동작이나 bug fix는 가능하면 test를 먼저 실행해 예상된 이유로 실패하는 RED를 관찰한다.
2. 이미 구현과 test가 함께 작성됐다면 production source에 plausible fault 하나를 임시 적용한다. 예:
   condition 반전, boundary off-by-one, 잘못된 ID/site, 필수 write/publish 제거, failure를 success로 변환.
3. 선택 테스트가 예상된 assertion으로 실패하는지 확인한다.
4. 임시 변경을 정확히 되돌리고 같은 테스트가 다시 통과하는지 확인한다.
5. repository에 mutation tool이 이미 구성되어 있다면 focused target으로 대신 사용할 수 있다. 이 증거만을
   위해 새 dependency를 추가하지 않는다.

테스트 파일을 mutation과 동시에 바꾸면 proof가 아니다. mutation은 commit하지 않으며 복구 여부를 diff로
확인한다. 환경 문제로 실행하지 못했다면 `NOT_RUN`을 기록한다.

## Orthogonal proof

서로 다른 파일의 mock 테스트 두 개가 같은 stubbed response를 재현하면 독립 증거가 아니다. 변경 위험에
따라 다른 failure surface를 선택한다.

- pure rule: table/boundary/property case + controlled mutation
- orchestration: real deterministic collaborators + terminal boundary double
- serializer/mapping: actual boundary round trip
- retry/idempotency: virtual time 또는 failure injection + durable state/count
- authorization/deletion/money: 독립 reviewer가 요구사항에서 만든 cases + 실제 state transition
- migration: 실제 schema 적용 + repository read/write compatibility

동일한 상수와 분기를 production에서 복사한 expected value는 change-detector가 되기 쉽다. expected result는
요구사항, protocol example, consumer contract, 이전 production incident처럼 구현과 독립된 oracle에서 만든다.

## Verification ladder

모든 변경에 무조건 전체 suite를 요구하지는 않지만, 관련 rung을 건너뛰고 배포 가능을 선언하지 않는다.

1. selected test/case: 새 동작과 failure를 빠르게 진단한다.
2. affected module suite: 인접 regression과 composition을 확인한다.
3. relevant narrow boundary/contract suite: 실제 serializer, mapping, protocol, wiring을 확인한다.
4. repository-required checks: build, lint/static analysis, configured coverage/mutation/CI gate를 확인한다.

E2E나 live-service 검증이 필요한 변경은 이 스킬에서 실행하지 않고 전용 workflow로 넘긴다. 그 결과가 아직
없으면 overall verdict는 `PARTIAL` 또는 `NOT_RUN`이지 release-ready가 아니다. 실행 결과에는 command, exit
code, executed count, selected case observation, 실행 환경, 최신 commit/diff 기준 여부를 포함한다.
runner console의 `BUILD SUCCESSFUL`만 보지 않고 XML/HTML 또는 framework report에서 selected case가 실제
discovery·execution됐는지 확인한다. zero discovered tests, 이전 실행의 stale report, cache-only 또는
`UP-TO-DATE` 결과는 현재 변경에 대한 per-test `PASS`가 아니다. 필요하면 repository가 제공하는 방식으로
해당 test task를 fresh execution하되, 무조건적인 cache 삭제 같은 광범위한 파괴 동작은 하지 않는다.

## Coverage와 mutation의 위치

line/branch coverage는 실행 범위를 찾는 신호이며 assertion strength의 증거가 아니다. Kover/PIT 같은 도구가
이미 있다면 changed high-risk logic에 focused verification을 사용한다. 숫자 목표를 맞추기 위한 의미 없는
test 추가나 exclusion 확대는 oracle weakening으로 취급한다. mutation survivor는 모두 같은 우선순위가
아니므로 변경된 핵심 규칙과 boundary contract부터 분석한다.

## 리뷰 훅

- [ ] production diff와 test/fixture/snapshot/CI diff를 분리해 oracle weakening을 점검했는가(`TST-19`).
- [ ] test-side 기대 변경이 사용자 요구나 공개 계약에 근거하는가(`TST-19`).
- [ ] selected test의 RED 또는 controlled mutation failure와 복구 후 GREEN을 관찰했는가(`TST-20`).
- [ ] mock끼리 같은 가정을 반복하지 않는 orthogonal evidence가 있는가(`TST-20`).
- [ ] selected, module, boundary, required checks 중 관련 rung을 모두 실행했는가(`TST-20`).
- [ ] report가 selected case의 fresh discovery/execution을 보여주며 zero-test·stale·cache-only 결과가 아닌가(`TST-20`).
- [ ] 실행하지 않은 rung 때문에 release-ready verdict가 과장되지 않았는가(`TST-16`, `TST-20`).
