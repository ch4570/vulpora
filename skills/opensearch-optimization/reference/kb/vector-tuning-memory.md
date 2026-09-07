---
title: 벡터 튜닝 · 메모리 (HNSW/IVF · 양자화 SQ/PQ/BQ · on_disk · off-heap)
source: https://docs.opensearch.org/latest/vector-search/optimizing-storage/knn-vector-quantization/
last_fetched: 2026-06-24
skills: [opensearch-optimization]
---

# KB: 벡터 튜닝 · 메모리

> 벡터 검색의 recall·latency·메모리를 파라미터로 산다. 예시는 일반 인덱스의 `embedding` 필드.

## 리뷰 훅
- [ ] `ef_search ≥ 허용 최대 k`인가(부팅 검증). recall headroom 확보(k의 1.5~2배).
- [ ] `m`/`ef_construction` 변경이 **재색인 필수**임을 인지했는가(빌드측).
- [ ] 메모리 절감이 필요한가 → **SQ(fp16) first**. 초대용량만 PQ/BQ/on_disk.
- [ ] 실측 N으로 메모리 추정식 → circuit breaker(50%) 대비 여유를 **수치로** 계산했는가.
- [ ] k-NN OOM을 **heap 증설로 풀려 하지 않는가**(그래프는 off-heap).
- [ ] `clip=true`인데 입력이 비정규화/대범위 임베딩인가(recall 위험).

## HNSW 파라미터
| 파라미터 | 역할 | 방향 / 비고 |
|---|---|---|
| `m` | 노드당 양방향 링크 | ↑recall·메모리(`8*m`)·색인시간. **재색인** |
| `ef_construction` | 빌드 시 후보 큐 | ↑recall·**빌드시간만**(검색 무관). **재색인** |
| `ef_search` | 검색 시 후보 큐 | ↑recall·**latency**. **반드시 `≥ k`**. **재색인 불필요(1순위 노브)**. lucene은 k로 동적 |

> `ef_search`는 고정값 금지 → `max(floor, ceil(k * 1.5~2.0))`로 k에 종속. `k` 가변·`ef_search`
> 전역고정이면 부팅 시 `ef_search ≥ 허용 최대 k` 검증. `ef_search == k`는 recall headroom 0.

## IVF 파라미터
- `nlist`(기본 4): Voronoi 셀 수, ↑정확·↑빌드비용(대략 √N). `nprobes`(기본 1): 탐색 셀 수,
  ↑recall·↑latency. IVF는 **Train API 학습 필수**, `nlist` 변경 = 재학습+재색인.

## 메모리 추정 공식 (faiss)
- **HNSW**: `1.1 * (encoded_vector_bytes + 8*m) * N`
  - `encoded_vector_bytes` = fp32 `4*dim` / fp16(SQ) `2*dim` / byte `dim`
  - 예) 1M, dim=256, m=16, fp32 → `1.1*(4*256+8*16)*1e6 ≈ 1.27 GB`
- **IVF**: `1.1 * ((4*dim)*N + 4*nlist*dim)`

## 양자화 비교
| 방식 | 메모리 절감 | recall | 학습 | 핵심 리스크 |
|---|---|---|---|---|
| **SQ(fp16)** | 50% (범위 [-65504,65504]) | 미미 | 불필요 | `clip=true` 시 범위초과 입력을 잘라 recall 저하. **L2 단위벡터(성분∈[-1,1])면 무해**. first choice |
| **PQ** | 최대(m·code_size) | 가장 큼 | **필수(k-means)** | dim이 `m`으로 나눠떨어져야. 학습데이터 부족 시 품질↓, 재학습+재색인 |
| **BQ** | 1-bit 32x/2-bit 16x/4-bit 8x | 저비트일수록 큼 | 색인 중 자동 | recall 보강(rescore) 시 latency↑ |

## Disk-based (`on_disk`)
- 압축 인덱스는 메모리, full-precision은 디스크 → 2단계 rescore. 기본 faiss+hnsw, **float만**,
  기본 32x 압축, `oversample_factor` 기본 2.0.
- **⚠️**: 디스크 I/O로 지연↑, **radial search 미지원**.

## off-heap / circuit breaker (k-NN 운영 1번 함정)
- k-NN 그래프는 **JVM heap이 아닌 off-heap(native)** 상주 → **heap 증설로 OOM 안 풀림**.
  힙 모니터링에 안 잡힘.
- `knn.memory.circuit_breaker.limit` 기본 **50%**, 초과 시 LRU native eviction.
- **⚠️**: 너무 낮으면 잦은 eviction→그래프 재로드 지연↑, 너무 높으면 OS OOM.

## 검증
- recall@k 스윕(+brute-force ground truth)으로 파라미터 변경의 recall 영향을 측정,
  `_plugins/_knn/stats`로 graph memory·eviction·cache 상태 확인. p99와 함께 본다.

## 근거
- ef_search≥k, 메모리 추정 공식, 양자화 비교, off-heap/circuit breaker 50%는 공식 vector-search
  optimizing storage/performance 문서에 근거한다.
