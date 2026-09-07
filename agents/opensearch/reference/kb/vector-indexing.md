---
title: 벡터 인덱싱 (knn_vector · 엔진 · HNSW/IVF)
source: https://docs.opensearch.org/latest/field-types/supported-field-types/knn-methods-engines/
os_version: 3.5.0
last_fetched: 2026-06-22
consumers: [opensearch-expert]
---

# KB: 벡터 인덱싱 (knn_vector · 엔진 · HNSW/IVF)

## 리뷰 훅 (이걸 점검하라)
- [ ] `dimension`이 임베딩 모델 출력과 **정확히 일치**하는가.
- [ ] `space_type`이 임베딩 정규화 여부와 정합인가(정규화 벡터면 `innerproduct`가 `cosinesimil`보다 빠름).
- [ ] `engine`이 `faiss`/`lucene`인가 — **`nmslib`이면 마이그레이션 대상**(deprecated).
- [ ] `ef_search ≥ k`인가. `k`(=topK)가 가변인데 `ef_search`가 전역 고정이면 **상한 불일치** 의심.
- [ ] `m`/`ef_construction`/`dimension`/`space_type`/`engine` 변경은 **재색인 필수**임을 인지했는가.

## 검증된 기본값
| 항목 | 값 |
|---|---|
| 기본 엔진 | **faiss** (nmslib deprecated, 제거 아님 — 신규 비권장) |
| `dimension` 범위 | **[1, 16000]** |
| `data_type` | `float`(기본) / `byte` / `binary` |
| 기본 method | `hnsw` |
| HNSW 기본 | `m=16`(권장 2~100), `ef_construction=100`, `ef_search=100` |
| ※ 2.11 이전 인덱스 | `ef_construction` 과거 기본 **512** 유지 |
| IVF 기본 | `nlist=4`, `nprobes=1` (Train API 학습 필수) |
| `mode` | `in_memory`(기본) / `on_disk` |

## 엔진별 space_type 매트릭스
- **faiss**: hnsw, ivf / `l2, innerproduct, cosinesimil, hamming`
- **lucene**: hnsw, flat / `l2, cosinesimil, innerproduct`
- **nmslib(deprecated)**: hnsw / `l2, innerproduct, cosinesimil, l1, linf`

`l1`/`linf`는 **nmslib 전용** → deprecated 엔진 종속. 신규 설계 회피.

## HNSW 파라미터
| 파라미터 | 역할 | 방향 / 비고 |
|---|---|---|
| `m` | 노드당 양방향 링크 | ↑recall·메모리(`8*m`)·색인시간. 재색인 |
| `ef_construction` | 빌드 시 후보 큐 | ↑recall·**빌드시간만**(검색 무관). 재색인 |
| `ef_search` | 검색 시 후보 큐 | ↑recall·**latency**. **반드시 `≥ k`**. 재색인 불필요(1순위 노브). **lucene은 무시**(k로 동적) |

> **운영 가이드**: `ef_search`는 고정값 금지 → `max(floor, ceil(k * 1.5~2.0))`로 **k에 종속**. `k` 가변·`ef_search` 전역고정이면 부팅 시 `ef_search ≥ 허용 최대 k` 검증 필수. `ef_search == k`는 recall headroom 0.
> **Java client 매핑**: `KnnQuery.k()`→DSL `k`, `.methodParameters("ef_search",..)`→`method_parameters.ef_search`, `SearchRequest.size()`→`size` (client 버전별 재확인).

## IVF 파라미터
- `nlist`(기본 4): Voronoi 셀 수, ↑정확·↑빌드비용(대략 √N). `nprobes`(기본 1): 탐색 셀 수, ↑recall·↑latency.
- IVF는 **Train API 학습 필수**. PQ 병용 권장 학습벡터 = `max(1000*nlist, 2^code_size*1000)`.
- **⚠️ 리스크**: 학습 운영 부담, nlist 변경 = 재학습+재색인.

## 인용 시
"OpenSearch `knn-methods-engines` 기준 ef_search(N) < k(M) → faiss HNSW under-return" 식으로 근거를 단다.

## 문서 미확인 (재확인 필요)
- `index.knn.algo_param.ef_search` 기본값, Lucene HNSW 전용 메모리 공식.
