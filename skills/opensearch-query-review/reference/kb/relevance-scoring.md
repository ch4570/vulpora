---
title: 관련도 · 스코어링 (BM25 · boost · function_score · min_score)
source: https://docs.opensearch.org/latest/query-dsl/full-text/
last_fetched: 2026-06-24
skills: [opensearch-query-review]
---

# KB: 관련도 · 스코어링

> 점수를 "왜 이 순서인가"로 설명·조정한다. 예시는 일반 인덱스(`Article` 제목/본문).

## 리뷰 훅
- [ ] 점수 조정을 boost로 단순화할 수 있는데 `function_score`로 과설계하지 않았는가.
- [ ] `boost`를 곱으로 남발해 한 필드가 점수를 지배하지 않는가.
- [ ] `constant_score`로 충분한데 점수 계산을 켜두지 않았는가(필터성 조건).
- [ ] `min_score`를 `_score` 정렬과만 쓰는가(다른 sort와 혼용 시 의미 모호).
- [ ] 점수 디버깅에 `explain`을 **운영 상시**로 켜두지 않는가(비용 큼).

## BM25 (기본 유사도)
- OpenSearch 기본 유사도는 **BM25**. 점수는 ↑ **term frequency(tf)**, ↑ **inverse document
  frequency(idf, 희소 term 가중)**, ↓ **field length(긴 필드 패널티, `b` 파라미터)**.
- 파라미터 `k1`(tf 포화), `b`(길이 정규화)는 인덱스 `similarity` 설정으로 조정 가능하나
  대부분 기본값으로 충분하다.

## 점수 조정 도구 (가벼운 것부터)
| 도구 | 용도 | 비고 |
|---|---|---|
| 쿼리/필드 `boost` | 특정 절·필드 가중 | 가장 단순. 곱셈이므로 과도하면 지배적 |
| `constant_score` | 매칭만 필요, **점수 1.0 고정** | 필터를 점수 있는 절처럼 쓸 때 |
| `dis_max` / `multi_match` | 여러 필드 중 best field | `tie_breaker`로 보조 필드 가산 |
| `function_score` | 수치/거리/decay 기반 재점수 | 가장 강력·복잡. 마지막 수단 |
| `boosting` | positive 매칭 + negative 강등 | 특정 패턴 down-rank |

## function_score 핵심
- `functions`: `weight`, `field_value_factor`(수치 필드로 가중, 예 인기/평점),
  `gauss`/`linear`/`exp` decay(거리·시간·지리 감쇠), `script_score`(임의 식).
- `score_mode`(함수들 결합: `multiply` 기본/`sum`/`avg`/`max`...), `boost_mode`(쿼리 점수와
  결합: `multiply` 기본/`replace`/`sum`...).
- **⚠️**: `field_value_factor`는 결측/음수에서 NaN/예외 → `missing`·`modifier(log1p 등)`로 방어.

## min_score / 컷오프
- `min_score`는 `_score`가 임계 미만인 문서를 제거한다. **`_score` 정렬 기준일 때만** 의미가
  분명하다. 다른 sort와 혼용하면 결과가 직관과 어긋날 수 있다.
- 하이브리드/정규화 결과에 적용되는 `min_score` 의미는 파이프라인 단계에 종속(vector-hybrid-query.md 참조).

## explain (점수 디버깅)
- `?explain=true` 또는 본문 `"explain": true`로 각 문서 점수의 분해(tf/idf/boost)를 본다.
- **⚠️**: explain은 비용이 크다 → **디버깅 시에만**, 운영 상시 사용 금지.
- 단일 문서 점검은 `_explain/{id}` API로 더 가볍게.

## 근거
- BM25가 기본 유사도이고 tf↑·idf↑·길이↓로 점수가 결정된다는 점, function_score의 score_mode/
  boost_mode 구분은 공식 full-text/compound 쿼리 문서에 근거한다.
