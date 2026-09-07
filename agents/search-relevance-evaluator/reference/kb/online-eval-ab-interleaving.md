---
title: 온라인 평가 (A/B 테스트 · 인터리빙) — offline≠online 검증
source: https://nlp.stanford.edu/IR-book/html/htmledition/results-snippets-1.html
last_fetched: 2026-06-25
consumers: [search-relevance-evaluator]
---

# KB: 온라인 평가 (A/B 테스트 · 인터리빙)

> 출처: *Introduction to Information Retrieval*(사용자 기반 평가·클릭 신호) + 인터리빙 비교 평가 표준 절차(team-draft interleaving). 오프라인 지표를 라이브로 검증하는 보조 KB.

## 리뷰 훅 (이걸 점검하라)
- [ ] 오프라인 결과를 **라이브 성과로 단정**하지 않았는가(offline≠online).
- [ ] 라이브 검증 방식이 A/B인가 인터리빙인가 — 민감도/표본 요구가 다름을 인지했는가.
- [ ] 온라인 지표가 **관련성 대리지표**(클릭·체류)임을 인지했는가(클릭≠관련, position bias).
- [ ] A/B의 표본·기간이 충분한가(검정력). 인터리빙 신뢰구간을 봤는가.

## A/B 테스트
- 트래픽을 무작위 분할(A=베이스라인, B=후보), 사용자 단위 온라인 지표(CTR·체류·전환·성공률) 비교.
- 장점: 실제 비즈니스 지표 직접 측정. 단점: **민감도 낮음**(많은 트래픽·긴 기간 필요), 노이즈 큼.

## 인터리빙 (interleaving)
- 한 결과 목록에 A·B 결과를 섞어 **같은 사용자**에게 노출 → 클릭 귀속으로 선호 비교.
- **Team-Draft Interleaving(TDI)**: 두 랭킹이 번갈아 문서를 "드래프트"해 혼합, 클릭된 문서의 소속 팀에 점수.
- 장점: A/B보다 **민감도 높음**(같은 사용자 내 비교 → 분산↓, 표본 적게). 단점: 구현·귀속 로직 복잡.

## offline ↔ online 간극
- 오프라인 NDCG 개선이 온라인 개선을 **보장하지 않는다** — 판정셋이 실제 의도/분포를 못 담으면 괴리.
- position bias·노출 효과·UI 변화는 오프라인에 없는 온라인 변수.
- 권장 흐름: **오프라인으로 후보 선별(게이트) → 통과분만 온라인(A/B·인터리빙)으로 확정.**

## 인용 시
"오프라인 NDCG 게이트 통과는 라이브 성과 보장 아님 — TDI/A/B로 확정 필요" 식으로 근거를 단다.

## 문서 미확인 (재확인 필요)
- 인터리빙 변형(probabilistic interleaving)의 편향 보정 세부와 조직별 온라인 지표 정의는 별도 확인.
