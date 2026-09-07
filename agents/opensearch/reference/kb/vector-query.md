---
title: 벡터 쿼리 (k-NN query · efficient filtering · radial · nested)
source: https://docs.opensearch.org/latest/vector-search/filter-search-knn/efficient-knn-filtering/
os_version: 3.5.0
last_fetched: 2026-06-22
consumers: [opensearch-expert]
---

# KB: 벡터 쿼리

## 리뷰 훅
- [ ] `k`/`max_distance`/`min_score` 중 **정확히 하나만** 지정했는가.
- [ ] 필터가 있으면 **efficient k-NN filtering**(knn 내부 `.filter`)을 쓰는가 — post-filter는 under-fetch 위험.
- [ ] selective 필터(예: `status=active` 등 모집단 작음)에서 k개를 못 채우는가 → over-fetch 배수/exact fallback.
- [ ] nested vector면 `score_mode`를 명시했는가(기본값 문서 미확인).

## k-NN query
- `k` 범위 **[1, 10000]**. **k 집계 단위**: faiss/nmslib=샤드 내 전 세그먼트 통합, **lucene=샤드당** → 결과 수 기대치가 엔진별 다름.
- score 변환: `l1/l2/linf/hamming → 1/(1+d)`, `cosinesimil → (2−d)/2`, `innerproduct → d≥0:1/(1+d), d<0:−d+1`.
- **⚠️**: ANN은 근사 → recall 미스 가능. `filter`는 nmslib 불가. `explain=true`는 비용 커 상시 사용 비권장.

## Efficient k-NN filtering (pre-filtering)
- ANN 탐색 **중** 필터 푸시다운 → 엔진이 셀렉티비티 보고 exact pre-filter vs modified post-filter 자동 선택. **총 k개 이상 존재 시 k개 보장**.
- 지원: Lucene HNSW(2.4+), Faiss HNSW(2.9+)/IVF(2.10+). **nmslib 불가**.
- **Under-fetch fallback**: faiss에서 P≥k인데 R<k면 필터된 ID에 **exact search fallback**으로 k개 보장.
- **🆕 3.5**: `index.knn.faiss.efficient_filter.disable_exact_search: true` → fallback 끄기(k 미만 허용+latency 우선).
- **⚠️**: exact fallback은 필터 부분집합 크면 latency↑. 엔진/버전별 pre/post 선택 차이로 결과 수·점수 변동.

## Radial search
- `max_distance`/`min_score` 임계 이내 **모든** 점 반환(top-k 아님). Lucene/Faiss, **nmslib·on_disk 미지원**.
- **⚠️**: 임계 느슨하면 결과 폭증, space_type 변경 시 임계 재조정.

## Nested vector
- `nested`로 `knn` 래핑, 부모는 가장 가까운 nested 벡터 기준 평가. Lucene/Faiss **HNSW만**.
- `score_mode`(예 `max`=최적 청크, RAG 적합), `expand_nested_docs`(전체 점수·비용↑), `inner_hits`, 내부 `filter`.
- **⚠️**: `k`가 벡터 후보 단위라 결과 수 직관과 다름. **`score_mode` 기본값 문서 미확인 → 명시 권장**.

## 문서 미확인
- Faiss `knn.advanced.filtered_exact_search_threshold` 기본값, nested `score_mode` 기본값.
