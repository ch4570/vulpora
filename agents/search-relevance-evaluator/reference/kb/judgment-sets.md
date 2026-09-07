---
title: 판정셋 (relevance judgments · qrels · pooling · 라벨 출처)
source: https://nlp.stanford.edu/IR-book/html/htmledition/assessing-relevance-1.html
last_fetched: 2026-06-25
consumers: [search-relevance-evaluator]
---

# KB: 판정셋 (relevance judgments · qrels · pooling · 라벨 출처)

> 출처: *Introduction to Information Retrieval* 8장(관련성 판정·평가자 일치) + TREC qrels/pooling 절차.

## 리뷰 훅 (이걸 점검하라)
- [ ] 판정셋에 **라벨 출처**가 명시돼 있는가(전문가·풀링·클릭 유도·LLM-judge). 출처 불명이면 결론을 잠정으로 표기.
- [ ] 등급 척도가 일관적인가(예: 0=무관, 1=약관련, 2=관련, 3=정확). graded인지 binary인지 명확한가.
- [ ] **커버리지**: cutoff `k`까지 판정이 충분한가. 얕은 판정은 NDCG@k·Recall@k를 왜곡.
- [ ] **hole(미판정)**: 후보가 올린 unjudged 문서를 어떻게 처리하는가(보통 비관련 취급 → 신규 시스템 불리).
- [ ] 라벨을 **발명**하지 않았는가 — 판정셋이 없으면 "평가 불가"가 정답.

## qrels 포맷 (TREC 관례)
- 한 줄당 `query_id  0  doc_id  relevance` (4컬럼; 2번째 0은 관례적 placeholder).
- `relevance`: binary(0/1) 또는 graded(0~N). 음수/특수값은 도구별 규칙 확인.

## 라벨 출처와 신뢰도
| 출처 | 특징 | 위험 |
|---|---|---|
| 전문가 판정 | 고품질·일관 | 비싸고 느림, 커버리지 한계 |
| Pooling(상위 합집합 판정) | TREC 표준, 효율적 | **pool 밖 문서 미판정(hole)** → 신규 시스템 과소평가 |
| 클릭 유도(implicit) | 대량·저비용 | position bias·노이즈, 관련≠클릭 |
| LLM-judge | 빠르고 확장적 | 모델 편향·프롬프트 민감, **반드시 출처로 명시** |

## Pooling & hole 편향
- TREC pooling: 여러 시스템 상위 k의 **합집합**만 판정 → 효율적이나 pool 밖 문서는 unjudged.
- 평가 대상이 pool 기여 시스템이 아니면 unjudged 비율↑ → 보통 0(비관련) 취급 → **불리**(reusability 한계).
- 보고에 unjudged 비율을 포함해 hole 편향 위험을 드러낸다.

## 평가자 일치(신뢰도)
- 판정자 간 일치(예: Cohen's κ)가 낮으면 작은 지표 델타는 노이즈일 수 있다.
- 단일 판정자/단일 LLM-judge면 일치도 측정 불가 → 결론 보수적으로.

## 인용 시
"IIR 8장: pooling은 pool 밖 문서를 미판정으로 남겨 신규 시스템에 hole 편향" 식으로 근거를 단다.

## 문서 미확인 (재확인 필요)
- 프로젝트별 등급 척도(0~2 vs 0~3)와 unjudged 처리 규칙은 해당 판정셋 정의서로 재확인.
