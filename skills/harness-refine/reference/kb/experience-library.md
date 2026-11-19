---
title: 경험 라이브러리와 격리 승격
source: https://github.com/google-research/harness2
last_fetched: 2026-10-27
skills: [harness-refine]
---

# KB: 경험 라이브러리와 격리 승격

> 근거: harness2의 하네싱 수준 재귀(`core/library.py`: 도메인별로 채택 하네스 전체와 이유를 저장)와
> 경험 기록 형식(`core/prompts.py`의 experience). 승격 규칙은 vulpora improvement-record 계약을 따른다.

## 1. 채택과 효과는 다르다

- 선택은 하네스를 가린 채 산출물을 비교했다. "이 산출물이 나았다"일 뿐 "이 수정이 효과 있었다"가 아니다.
- 수정마다 판정한다: `helped`, `hurt`, `no observed effect`, `confounded`. 한 후보가 여러 곳을 바꿨거나
  실행이 하나뿐이면 `confounded`를 우선한다. 지어낸 귀인은 라이브러리를 읽는 모든 다음 과제를 오염시킨다.

## 2. 교훈 한 줄

- `cue`: 적용될 상황의 모양. 이번 과제의 사실이 아니다.
- `lesson`: 하네스에 가할 조작. 컴포넌트를 이름으로 짚고, 적용·확인할 수 있게 쓴다.
- `evidence`: 근거가 된 판정 행과 실행 대비. `confounded` 행만 근거라면 범위를 좁히거나 `NO_ENTRY`.
- `confidence`: high·medium·low와 이유.

## 3. 라이브러리

- `harness/library/<domain>/entries/<run>/`에 채택 하네스 **전체**와 EXPERIENCE.md를 둔다. 요약하지 않는다.
- 같은 도메인 항목만 모이므로 검색은 구조로 된다. `INDEX.md`는 디스크에서 다시 만든다.
- 다음 제안자는 라이브러리를 예시로 읽는다. 컴포넌트를 가져오면 복사하고, 그 안의 사실은 이번 증거로 다시 확인한다.

## 4. 승격

- 라이브러리 항목과 `record`가 만든 개선 기록은 `quarantined`다.
- 승격에는 대상 자산의 behavioral case 전후 비교(선택 뒤에만), outcome 개선과 process·safety 무회귀,
  변경 작성자와 다른 독립 승인자가 필요하다. 이 루프 하나만으로 승격하지 않는다.

## 리뷰 훅 (점검 체크리스트)

- [ ] 거절된 후보의 수정까지 포함해 모든 수정을 판정했는가?
- [ ] 교훈의 cue가 과제 사실이 아니라 상황의 모양인가?
- [ ] confounded 행만으로 교훈을 만들지 않았는가?
- [ ] 라이브러리 항목과 개선 기록이 quarantined로 남았는가?
- [ ] 승격 근거에 선택 뒤에 돌린 회귀 결과와 독립 승인이 있는가?
