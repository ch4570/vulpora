---
title: 벡터 · 하이브리드 쿼리 (k-NN · efficient filtering · normalization/RRF · neural)
source: https://docs.opensearch.org/latest/vector-search/
last_fetched: 2026-06-24
skills: [opensearch-query-review]
---

# KB: 벡터 · 하이브리드 쿼리

> ⚠️ hybrid/neural/semantic은 **실제 사용할 때만** 점검한다. 순수 벡터+term/range면 "해당 없음".
> 예시는 일반 인덱스의 `embedding`(벡터) + `category`(keyword) 필드.

## 리뷰 훅
- [ ] k-NN 절에 `k`/`max_distance`/`min_score` 중 **정확히 하나만** 지정했는가.
- [ ] `ef_search ≥ k`인가. `k` 가변·`ef_search` 전역 고정이면 상한 불일치 의심.
- [ ] 필터가 있으면 **efficient k-NN filtering**(knn 내부 `.filter`)인가 — 바깥 post-filter는 under-fetch.
- [ ] selective 필터에서 k개를 못 채우는가 → over-fetch 배수/exact fallback 확인.
- [ ] (hybrid) **normalization-processor**(또는 RRF)가 파이프라인에 있는가 — 단순 합산 금지.
- [ ] (neural) ingest model_id ↔ query model_id가 **동일 모델**인가.

## k-NN query
- `k` 범위 **[1, 10000]**. score 변환: `l2 → 1/(1+d)`, `cosinesimil → (2−d)/2`,
  `innerproduct → d≥0:1/(1+d), d<0:−d+1`.
- **결과 수 기대치가 엔진별로 다름**: faiss/nmslib는 샤드 내 전 세그먼트 통합으로 k개,
  lucene은 샤드(세그먼트)당 → 합산 시 더 많이 나올 수 있다.
- **⚠️**: ANN은 근사 → recall 미스 가능. nmslib는 필터 미지원. `explain`은 비용 큼.

## Efficient k-NN filtering (pre-filtering)
- ANN 탐색 **중** 필터를 푸시다운 → 엔진이 셀렉티비티 보고 exact pre-filter vs modified
  post-filter를 자동 선택. **총 k개 이상 존재 시 k개 보장**.
- 지원: Lucene HNSW, Faiss HNSW/IVF. **nmslib 불가**.
- selective 필터(모집단 작음)에서 후보가 k 미만이면 **exact search fallback**으로 k 보장(faiss).
- **⚠️ 안티패턴**: k-NN을 바깥 `bool.filter`로 감싸는 post-filter → ANN이 k개 뽑은 뒤 필터링하므로
  필터 통과분이 k 미만이 되는 **under-fetch**. 반드시 knn 절 내부 `.filter`로.

## Radial / Nested
- **Radial**: `max_distance`/`min_score` 임계 이내 **모든** 점 반환(top-k 아님). nmslib·on_disk 미지원.
- **Nested vector**: `nested`로 `knn` 래핑. `score_mode`(`max`=최적 청크) 명시 권장.
  Lucene/Faiss HNSW만. `k`가 벡터 후보 단위라 결과 수가 직관과 다를 수 있다.

## Hybrid search
- `hybrid.queries` **최대 5개**(서브쿼리). 점수 결합은 **search pipeline의 phase-results processor**에서.
- **`normalization-processor`**: `normalization.technique` `min_max`(기본)/`l2`/`z_score`;
  `combination.technique` `arithmetic_mean`(기본)/`geometric_mean`/`harmonic_mean`;
  `weights` 각 [0,1] **합=1.0**, 길이=서브쿼리 수.
- **`score-ranker-processor`**(RRF): `combination.technique: rrf`, `rank_constant` 기본 **60**.
  점수 절대크기 대신 순위로 결합 → 스케일 차에 강건(절대 점수 정보는 손실).
- **선택 기준**: 키워드+벡터는 기본 `min_max`+`arithmetic_mean`. 점수 스케일 차가 크고
  강건성이 중요하면 RRF.
- **⚠️**: 정규화는 코디네이팅 노드에서 일어나 대규모 샤드/결과 시 reduce 비용↑.
  weights 제약(합=1.0) 위반 시 실패.

## Neural / Sparse / Semantic
- **`neural`**(dense): `query_text`/`query_image`, `model_id`, `k`(기본 10),
  `min_score`/`max_distance`(k와 배타). ingest와 query model_id가 **달라지면 의미 붕괴**.
- **`neural_sparse`**: bi-encoder vs doc-only(쿼리 인코딩 생략→지연↓). two-phase processor 활용.
- **`semantic` 필드**: `model_id` 기반으로 매핑 시 임베딩 자동 생성. 동적 매핑/멀티필드 제약.

## 근거
- efficient filtering이 k 보장과 fallback을 제공한다는 점, hybrid 점수 결합이 search pipeline의
  phase-results processor에서 일어난다는 점은 공식 vector-search 문서에 근거한다.
