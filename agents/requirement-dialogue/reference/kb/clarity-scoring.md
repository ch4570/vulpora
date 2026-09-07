---
title: 요구사항 명확도·모호성 점수와 사용자 진행 결정
source: Vulpora workflow policy derived from ISO/IEC/IEEE 29148:2018 quality characteristics
last_fetched: 2026-08-19
consumers: [requirement-dialogue]
owner: start-task
derived_from: skills/start-task/reference/kb/clarity-scoring.md
---

# 요구사항 명확도 점수

동일 release의 `skills/start-task/reference/kb/clarity-scoring.md`가 canonical rubric이다. 설치된 release
root 밖에서 대체본을 찾지 않는다. 목표 20, 범위 20, 인수기준 20, 제약 15, 권한·위험 15, 검증 10의
100점 체계를 그대로 적용한다. Caller가 rating을 만들지 않는다. Bundled `assess-clarity.js`가 canonical
rubric의 축별 exact evidence signal 4개에서 0..4 rating을 도출하고 pending unknown 축을 최대 3으로
제한한다. `score-clarity.js`가 `floor(weight * rating / 4 + 0.5)`와 awarded 합계를 계산하며 85점 이상과
비우회 blocker 0개를 기본 통과 조건으로 사용한다.
각 evidence는 `user:`, `repository:`, `policy:`, `assumption:` provenance와 구체 설명을 포함한다.

사용자에게 `명확도 score/100`과 `모호성 (100-score)/100`을 함께 보여주고 가장 중요한 미결정 영역을
설명한다. 비우회 blocker가 없으면 가정·위험을 기록하고 현재 상태로 구현할 수 있다고 안내한다.
사용자가 이를 본 뒤 `그래도 구현해`, `일단 만들어`, `현재 내용으로 진행해`처럼 명시하면 explicit
per-run skip provenance로 기록하고 숫자 threshold에만 적용한다. `빨리`, `급해`, `알아서`, deadline,
silence로 추론하지 않는다. 권한 확대, 파괴적·비가역 작업, credential/security,
external write, public contract, material data-model 결정과 실행 가능한 목표의 부재는 skip할 수 없다.
`질문은 그만하고 현재 내용으로 바로 구현해`처럼 이번 run의 질문 중단과 현재 scope 구현을 함께 명시한
사용자 답변은 유효한 skip provenance다. 다만 non-bypassable blocker를 해결하거나 새 권한을 만들지는
않는다. Skip에는 점수 표시 뒤의 현재 `answer-sha256`만 사용한다. 최초 task digest, 과거 run의 답변,
설명 없는 risk id는 유효하지 않다. 각 accepted risk에는 category와 구체 summary가 필요하고 DAG의
assumption·verification·exclusion 처리 중 하나에 연결한다. Gate가 열리면 같은 answer digest를
`spec_committed` event에 결합하고 freeze·split·execute로 진행한다.

## 리뷰 훅

- [ ] canonical rubric의 6개 dimension과 weight 합계 100을 유지하는가?
- [ ] 점수와 evidence가 일치하는가?
- [ ] explicit skip provenance와 accepted-risk unknown을 보존하는가?
- [ ] 비우회 blocker가 있으면 gate를 blocked로 유지하는가?
