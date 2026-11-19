---
title: Propose–Probe–Compose 정제 루프
source: https://arxiv.org/abs/2610.14224
last_fetched: 2026-10-27
skills: [harness-refine]
---

# KB: Propose–Probe–Compose 정제 루프

> 근거: Harness² 논문과 google-research/harness2 구현(`core/recursion.py`, `core/prompts.py`).
> 모델 가중치를 고정한 채 하네스만 과제 단위로 다듬는다. 정답 피드백 없이 실행 간 대비만 쓴다.

## 1. 루프 구성

| 단계 | 하는 일 | 이 스킬에서 |
|---|---|---|
| Base | 원본 하네스로 과제를 실행해 궤적·산출물을 얻는다 | `prepare-probe --label base` + execute 브리프 |
| Propose | INV·DOM 후보 편집을 따로 낸다 | propose-inv·propose-dom 브리프, `candidate` 검증 |
| Probe | 각 후보를 같은 과제로 실행한다 | 후보마다 `prepare-probe` |
| Compose | 대비 증거로 최종 하네스를 합성한다 | compose 브리프 |
| Select | 익명 풀에서 하나를 고른다 | `pool` → select 브리프 → `select` |
| Reflect | 수정별 효과와 교훈을 남긴다 | reflect 브리프 → `reflect`·`library-add` |

## 2. 재귀 방식

- **병렬(parallel)**: 같은 기준 증거로 INV `k`개, DOM `k`개를 내고, 합성자 `k`명이 각자 하나씩 합성한다.
  넓게 탐색한다. 탐침 수 = `trials × (1 + 3k)`.
- **순차(sequential)**: 라운드 `t`마다 직전 체크포인트 위에서 INV·DOM을 내고 합성해 체크포인트 `t`를 만든다.
  이전 라운드에서 버린 편집도 뒤 증거가 지지하면 되살릴 수 있다. 깊게 다듬는다.
- `k`를 늘리면 개선 여지가 커지지만 비용도 선형으로 는다. 논문은 `k=1` 한 번으로도 개선을 보고한다.

## 3. 증거를 읽는 법

- 기준 실행 여러 개는 한 분포의 표본이다. 모두에서 반복된 실패만 확실한 신호다.
- 후보는 보통 한 번만 실행되므로 결과 하나는 약한 증거다. 궤적에서 메커니즘이 보여야 채택한다.
- 산출물을 못 낸 실행은 가장 비싼 실패다. 그 실행과 묶인 수정은 기본적으로 위험하다고 본다.

## 리뷰 훅 (점검 체크리스트)

- [ ] 기준 실행과 후보 실행이 같은 과제·같은 시행 수로 돌았는가?
- [ ] 실행 전에 탐침 예산과 시간 상한을 사용자에게 보였는가?
- [ ] 모든 기준 실행이 실패했을 때 하네스가 아니라 과제·환경 문제로 멈췄는가?
- [ ] 채택한 각 수정에 근거 궤적의 순간이 붙어 있는가?
- [ ] 순차 모드에서 KEEP_BASE를 "현재 체크포인트 유지"로 해석했는가?
