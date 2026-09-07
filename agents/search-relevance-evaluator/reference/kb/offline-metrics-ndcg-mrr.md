---
title: 오프라인 지표 (NDCG@k · MRR · Recall@k · MAP)
source: https://nlp.stanford.edu/IR-book/html/htmledition/evaluation-of-ranked-retrieval-results-1.html
last_fetched: 2026-06-25
consumers: [search-relevance-evaluator]
---

# KB: 오프라인 랭킹 지표 (NDCG@k · MRR · Recall@k · MAP)

> 출처: *Introduction to Information Retrieval* 8장(ranked retrieval 평가) + Järvelin & Kekäläinen 2002(NDCG) + TREC `trec_eval` 정의.

## 리뷰 훅 (이걸 점검하라)
- [ ] 과제 성격과 지표가 맞는가 — navigational→**MRR**, graded 다중등급→**NDCG@k**, 재현 중요→**Recall@k**, binary 다중정답→**MAP**.
- [ ] cutoff `k`가 베이스라인·후보·판정셋에서 **동일**한가(다르면 비교 불가).
- [ ] NDCG의 **IDCG**(이상적 정렬)가 판정셋 등급으로 계산됐는가(정규화 누락 시 DCG는 시스템 간 비교 불가).
- [ ] MRR은 **첫 관련 문서**만 본다 — 다중정답 과제에 MRR만 쓰면 나머지 관련 문서를 무시함을 인지했는가.
- [ ] unjudged(미판정) 문서를 어떻게 처리했는가(보통 0 취급 → hole 편향. `judgment-sets.md` 참조).

## 정의·공식

### DCG / NDCG@k (graded relevance)
- 등급 이득 `rel_i`(예: 0~3)를 순위로 할인 합산.
- `DCG@k = Σ_{i=1..k} (2^{rel_i} − 1) / log2(i + 1)` (TREC/표준 graded gain 형태).
- `IDCG@k` = 같은 판정셋을 **이상적으로(등급 내림차순)** 정렬했을 때의 DCG.
- **`NDCG@k = DCG@k / IDCG@k`** → 0~1로 정규화. 쿼리 간·시스템 간 비교 가능.
- 대안 gain `rel_i / log2(i+1)`(linear)도 쓰이나, 지수형이 고등급을 더 강조. **계산 시 사용한 형태를 명시**한다.

### MRR (Mean Reciprocal Rank)
- 쿼리 q의 첫 관련 문서 순위 `rank_q` → reciprocal `1/rank_q`(관련 없으면 0).
- `MRR = (1/|Q|) Σ_q 1/rank_q`. **첫 정답** 위치만 본다 → navigational/QA에 적합.

### Precision@k / Recall@k
- `Precision@k` = 상위 k 중 관련 비율. `Recall@k` = 전체 관련 문서 중 상위 k에 든 비율.
- Recall@k는 **판정셋의 관련 문서 총수**가 분모 → 판정 커버리지에 민감.

### MAP (Mean Average Precision, binary)
- AP(q) = (관련 문서를 만날 때마다의 Precision@그위치) 평균. `MAP = mean_q AP(q)`.
- binary 관련성 가정. graded면 NDCG가 더 적합.

## 지표 선택 요약
| 과제 | 권장 지표 | 이유 |
|---|---|---|
| 정답 1개 찾기(navigational/QA) | MRR | 첫 정답 순위가 핵심 |
| 등급(상/중/하) 관련성 | NDCG@k | 등급 이득을 순위 할인 |
| 누락 비용 큼(법률·리콜) | Recall@k | 빠뜨림 최소화 |
| binary 다중정답 | MAP | 정밀도-재현 요약 |

## 인용 시
"IIR 8장 정의상 NDCG@10 = DCG@10/IDCG@10, IDCG는 판정셋 이상정렬" 식으로 근거를 단다.

## 문서 미확인 (재확인 필요)
- `trec_eval`의 기본 gain 형태(지수 vs linear)와 ties 처리 규칙은 도구 버전별로 재확인.
