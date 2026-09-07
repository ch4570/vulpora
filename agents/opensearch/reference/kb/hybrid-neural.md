---
title: 하이브리드 · Neural · 검색 파이프라인 (정규화/RRF · neural/sparse/semantic)
source: https://docs.opensearch.org/latest/search-plugins/search-pipelines/normalization-processor/
os_version: 3.5.0
last_fetched: 2026-06-22
consumers: [opensearch-expert]
---

# KB: 하이브리드 · Neural · 파이프라인

> ⚠️ 이 KB는 hybrid/neural/semantic을 **실제 사용할 때만** 읽는다. 순수 벡터+term/geo 아키텍처면 "해당 없음".

## 리뷰 훅
- [ ] hybrid면 **normalization-processor**(또는 RRF score-ranker)가 파이프라인에 있는가.
- [ ] BM25↔벡터 score scale 차가 크면 RRF 검토했는가.
- [ ] neural의 ingest model_id ↔ query model_id가 **동일 모델**인가.
- [ ] `min_score`를 `_score` 정렬과만 함께 쓰는가(3.5: 정규화 후 적용).

## Hybrid search
- `hybrid.queries` **최대 5개**, function_score/script_score/boosting 래퍼 내부 중첩 불가. 점수 결합은 **search pipeline의 phase-results processor**.
- **`normalization-processor`**: `normalization.technique` `min_max`(기본)/`l2`/`z_score`(arithmetic_mean만); `combination.technique` `arithmetic_mean`(기본)/`geometric_mean`/`harmonic_mean`; `weights` 각 [0,1] **합=1.0** 길이=서브쿼리 수. **RRF 없음**.
- **`score-ranker-processor`**(RRF 전담): `combination.technique: rrf`(유일), `rank_constant` 기본 **60**.
- 선택: 키워드+벡터 기본 `min_max`+`arithmetic_mean`. 스케일 차 강건성이면 RRF(점수 절대크기 손실).
- **🆕 3.5**: ① `min_score`가 **정규화·결합된 최종 점수**에 적용(`_score` 정렬 한정). ② **512 샤드 초과 지원**(batched reduction 자동 off → reduce 비용↑). ③ gRPC hybrid, asymmetric 임베딩.
- **⚠️**: 정규화는 코디네이팅 노드 → 대규모 샤드/결과 시 reduce 비용↑. weights 제약 위반 시 실패.

## Neural / Sparse / Semantic
- **`neural`**(dense): `query_text`/`query_image`, `model_id`, `k`(기본 10), `min_score`/`max_distance`(k와 배타), `rescore.oversample_factor`[1,100].
- **`neural_sparse`**: `rank_features`(전통)/`sparse_vector`(ANN 3.3+). bi-encoder vs **doc-only**(쿼리 인코딩 생략→지연↓). `neural_sparse_two_phase_processor`(2.15+). `max_token_score` 2.12부터 deprecated.
- **`semantic` 필드**(3.1+): `model_id`(필수)·`search_model_id`·`chunking`·`skip_existing_embedding`. dense→knn_vector, sparse→rank_features 서브필드 자동 생성.
- **⚠️**: semantic은 동적 매핑/멀티필드/cross-cluster 불가, 청킹 nested join 지연. dense neural는 k-NN 리소스 비용 큼.

## Search pipeline
- Request(요청)/Response(결과)/**Phase-results**(코디네이팅 — 하이브리드 정규화 위치). 적용: `?search_pipeline=`, `index.search.default_pipeline`, 인라인.
- **⚠️**: 체인 순서 의존, `rerank`/RAG/`ml_inference`는 외부 모델 지연, `oversample` 비용↑.

## 문서 미확인
- hybrid `pagination_depth` 파라미터 위치, RRF 공식 정확 분모 표기.
