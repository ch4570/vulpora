---
title: 벡터 필드 (knn_vector · dimension/space_type/engine/method/mode · immutable)
source: https://docs.opensearch.org/latest/field-types/supported-field-types/knn-vector/
last_fetched: 2026-06-24
skills: [opensearch-schema-review]
---

# KB: 벡터 필드 (knn_vector)

> 매핑 단계의 벡터 설계는 사실상 immutable이다. 예시는 일반 인덱스의 `embedding` 필드.

## 리뷰 훅
- [ ] 인덱스 설정에 `index.knn: true`가 있는가(knn_vector 사용 전제).
- [ ] `dimension`이 임베딩 모델 출력과 **정확히 일치**하는가.
- [ ] `space_type`이 임베딩 정규화 여부와 정합인가(정규화 벡터면 `innerproduct`가 더 빠름).
- [ ] `engine`이 `faiss`/`lucene`인가 — **`nmslib`이면 마이그레이션 대상**(deprecated).
- [ ] `dimension`/`space_type`/`method`/`engine` 변경이 **재색인 필수**임을 인지했는가.
- [ ] 큰 벡터를 `_source`에 중복 저장하는가 → derived source 검토(제약 확인).

## 검증된 기본값
| 항목 | 값 |
|---|---|
| 기본 엔진 | **faiss** (nmslib deprecated — 신규 비권장) |
| `dimension` 범위 | **[1, 16000]** |
| `data_type` | `float`(기본) / `byte` / `binary` |
| 기본 method | `hnsw` |
| HNSW 기본 | `m=16`, `ef_construction=100`, `ef_search=100` |
| `mode` | `in_memory`(기본) / `on_disk` |

## 엔진별 space_type 매트릭스
- **faiss**: hnsw, ivf / `l2, innerproduct, cosinesimil, hamming`
- **lucene**: hnsw, flat / `l2, cosinesimil, innerproduct`
- **nmslib(deprecated)**: hnsw / `l2, innerproduct, cosinesimil, l1, linf`

`l1`/`linf`는 nmslib 전용 → deprecated 엔진 종속. 신규 설계 회피.

## space_type ↔ 정규화 정합 (CRITICAL 후보)
- 임베딩이 **단위 정규화(L2 norm=1)** 면 cosine과 inner product가 동치 →
  `innerproduct`가 `cosinesimil`보다 연산이 싸다.
- 비정규화 임베딩에 `innerproduct`를 쓰면 점수가 벡터 크기에 휘둘린다 → 의미 붕괴.
- **`dimension`이 모델 출력과 1이라도 다르면** 색인/검색 자체가 실패하거나 무의미.

## immutable 규칙
- `dimension`/`space_type`/`method`/`engine`은 **생성 후 변경 불가**.
  변경 = 새 인덱스 + reindex + alias 스왑.
- `ef_search`(검색측)는 재색인 없이 조정 가능, `m`/`ef_construction`은 빌드측(재색인 필요)
  — 상세는 optimization 스킬의 vector-tuning KB 참조.

## derived source (저장 절감)
- 벡터를 `_source`에 그대로 두면 저장 비용이 크다. derived source(3.0+)는 _source 미저장으로
  절감하면서 update/reindex를 유지한다.
- **⚠️ 미지원**: nested, `copy_to`, `ignore_above`/normalizer keyword. 재구성이 느릴 수 있다.

## 근거
- 기본 엔진 faiss·nmslib deprecated, dimension 범위 [1,16000], space_type 매트릭스, immutable
  규칙은 공식 knn-vector/knn-methods-engines 문서에 근거한다.
