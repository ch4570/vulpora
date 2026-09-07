# Search Relevance Evaluation Knowledge Base — 색인 (INDEX)

> 정보 검색(IR) 평가 **표준 문서**(*Introduction to Information Retrieval* 8장, TREC/`trec_eval`,
> NDCG 원논문)를 distill한 인용 가능한 KB. 각 파일 frontmatter에 `title`·`source`·`last_fetched`·`skills`.
> **리뷰 시 사용법**: 작업 유형에 맞는 KB를 먼저 읽고 "리뷰 훅"으로 점검하며, 지적 시 KB의
> `source` URL을 근거로 인용한다.

## 작업 유형 → 읽을 KB

### 오프라인 지표 계산 (NDCG@k·MRR·Recall@k·MAP)
| KB | 다룸 |
|----|------|
| [offline-metrics-ndcg-mrr](offline-metrics-ndcg-mrr.md) | DCG/NDCG·MRR·Precision/Recall@k·MAP 정의·공식·cutoff·과제별 지표 선택 |

### 판정셋 구축·품질 점검
| KB | 다룸 |
|----|------|
| [judgment-sets](judgment-sets.md) | qrels 포맷, graded vs binary, pooling/hole, 라벨 출처(전문가·클릭·LLM-judge), 평가자 신뢰도 |

### 회귀 탐지·릴리스 게이팅
| KB | 다룸 |
|----|------|
| [ranking-regression-gating](ranking-regression-gating.md) | 쿼리별 델타·회귀 비율·최대 낙폭·게이트 임계·통계적 유의성(표본·부트스트랩) |

### 온라인 평가(보조 — offline≠online 검증)
| KB | 다룸 |
|----|------|
| [online-eval-ab-interleaving](online-eval-ab-interleaving.md) | A/B 테스트·인터리빙(TDI/team-draft), 온라인 지표, 오프라인↔온라인 간극 |

## 원칙 문서와의 관계
- 상위 원칙·trade-off 판단은 `../principles.md`(헌법). KB는 그 원칙의 **표준 문서 근거·세부 정의**.
- 충돌 시 **KB(표준/공식 정의)가 우선**. principles는 통찰을 보탠다.

## 갱신
- 각 파일 `last_fetched` 기준. 표준 도구(`trec_eval`) 동작이나 지표 정의가 갱신되면 `source`를 재확인.
- "문서 미확인" 항목(각 KB 하단)은 인용 전 재확인 필요.

## TODO (차기 KB 후보)
- learning-to-rank 평가(ERR, expected reciprocal rank), counterfactual/offline-policy 평가.
