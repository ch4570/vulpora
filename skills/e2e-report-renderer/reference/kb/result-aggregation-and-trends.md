---
title: 다수 run 집계·추세·플레이키·비교
source: https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we.html
last_fetched: 2026-06-24
skills: [e2e-report-renderer]
---

# KB: 결과 집계 / 추세(trend) / 플레이키(flaky) / 비교(compare)

여러 run을 가로질러 보는 두 모드(추세, 비교)의 개념·규칙. 플레이키 정의는 Google Testing
Blog, 시간축 추세 표현은 Allure 추세(trend) 개념(https://allurereport.org/docs/)을 근거로 한다.

## 1. 다수 run 집계의 전제: 교차 매칭은 ID로

- 여러 run을 합치려면 케이스를 **ID로 매칭**한다. 이름·순서가 아니다.
- run마다 카탈로그(시나리오 집합)가 다를 수 있다. 어떤 run에만 있는 케이스는 다른 run에서
  **결측(`—`)** 으로 표기한다. 결측을 `FAIL`로 표기하면 거짓 신호가 된다(SKILL.md `REN-20`).
- 카탈로그 SHA가 run마다 다르면 **상단 배너로 고지**한다(비교 대상이 다른 기준임을 알림).

## 2. 추세(trend): 시간축 pass rate

- 정의: 최근 N개 정착 run을 `generatedAt` **오름차순(오래된 것이 왼쪽)** 으로 늘어놓고
  각 run의 통과율을 선그래프로 표현(SKILL.md `REN-18`).
- 통과율(run 단위) = `pass / (pass + fail)`. **SKIPPED·FAILED-DEPENDENCY는 분모에서 제외**
  한다(환경/의존 신호이지 테스트 통과 여부가 아니다).
- N 기본값 10, 사용자 override 가능(`trend N=20`). 정착 run이 N보다 적으면 **있는 만큼만**
  그리고 placeholder로 채우지 않는다. 출력 파일명엔 **실제 개수**를 넣는다.
- Allure의 trend 개념과 같이, 추세는 "단일 시점 스냅샷"이 아니라 **연속된 run의 history**를
  하나의 차트로 압축해 회귀(regression)·개선을 드러내는 것이 목적이다.

## 3. 플레이키(flaky) 정의

Google Testing Blog: 플레이키 테스트란 **같은 코드(같은 입력)에 대해 통과와 실패가 모두
관측되는** 테스트다. 비결정적 결과는 신호를 오염시켜 팀이 실패를 무시하게 만드는 가장 큰
독이다.

- 렌더러의 플레이키 판정(SKILL.md `REN-21`):
  1. 선택된 **N개 run 전부에 존재**하는 케이스만 후보(결측이 섞이면 카탈로그 변경이지 플레이크
     아님 — `REN-20`).
  2. N개 run에서 **PASS가 1회 이상 그리고 FAIL이 1회 이상** 관측됨.
  3. **SKIPPED·FAILED-DEPENDENCY는 어느 쪽으로도 집계하지 않음**(환경/의존 신호).
- 케이스별 통과율 = `pass / (pass + fail)` (N개 run에 걸쳐).
- 플레이키는 "버그"가 아니라 **신뢰도 문제**다. 리포트는 이를 별도 표로 분리해 격리·재시도
  대상으로 가시화한다.

## 4. 비교(compare): 두 run 델타

- 입력: 두 run ID. 출력은 **요약 숫자 나란히 비교** + **케이스별 상태 델타**(SKILL.md `REN-12`).
- 상태 델타 표기 예: `PASS → FAIL`(회귀), `FAIL → PASS`(수정), `PASS → PASS`(변화 없음),
  한쪽 결측은 `— → PASS` 등.
- **회귀(좋음→나쁨)를 가장 눈에 띄게** 강조한다. 비교의 핵심 가치는 "무엇이 나빠졌는가"다.
- 파일명은 두 ID를 **사전식 정렬** 후 `compare-{min}-vs-{max}.html`. (A,B)와 (B,A)가 같은
  산출물로 수렴해 결정성을 보장한다(SKILL.md `REN-19`).

## 5. 범용 예시

```text
추세(5 run, 통과율%): 88 → 90 → 86 → 92 → 95
플레이키: ord-007  (PASS 3 / FAIL 2 → 통과율 60%)
비교(run A vs run B):
  ord-007  PASS → FAIL   ← 회귀(강조)
  mbr-003  FAIL → PASS   ← 수정
  art-010  —    → PASS   ← 카탈로그에 신규 추가
```

## 리뷰 훅
- [ ] run 간 케이스 매칭을 ID로 하는가(이름/순서가 아닌가).
- [ ] 어떤 run에만 있는 케이스를 `—`(결측)로 표기하고 `FAIL`로 오인하지 않는가.
- [ ] 카탈로그 SHA가 다르면 상단 배너로 고지하는가.
- [ ] 추세 통과율 분모에서 SKIPPED·FAILED-DEPENDENCY를 제외했는가.
- [ ] 추세가 `generatedAt` 오름차순(오래된 것이 왼쪽)인가.
- [ ] 정착 run이 N보다 적을 때 placeholder 없이 실제 개수로 그리고 파일명에 반영했는가.
- [ ] 플레이키 판정이 "전 run 존재 + PASS≥1 + FAIL≥1" 3조건을 모두 만족하는가.
- [ ] 비교에서 회귀(PASS→FAIL)를 가장 눈에 띄게 강조하는가.
- [ ] compare 파일명이 두 ID 사전식 정렬로 (A,B)/(B,A) 수렴하는가.
