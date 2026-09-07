---
title: 양자화 · 메모리 (SQ/PQ/BQ · on_disk · off-heap · circuit breaker)
source: https://docs.opensearch.org/latest/vector-search/optimizing-storage/knn-vector-quantization/
os_version: 3.5.0
last_fetched: 2026-06-22
consumers: [opensearch-expert]
---

# KB: 양자화 · 메모리

## 리뷰 훅
- [ ] 메모리 절감이 필요한가 → SQ(fp16) first choice. 초대용량만 PQ/BQ/on_disk.
- [ ] 실측 N으로 메모리 추정식 → `knn.memory.circuit_breaker.limit`(50%) 대비 여유를 **수치로** 계산했는가.
- [ ] k-NN OOM을 **heap 증설로 풀려 하지 않는가**(그래프는 off-heap).
- [ ] `clip=true`인데 입력이 비정규화/대범위 임베딩인가(recall 위험).

## 메모리 추정 공식 (faiss)
- **HNSW**: `1.1 * (encoded_vector_bytes + 8*m) * N`
  - `encoded_vector_bytes` = fp32 `4*dim` / fp16(SQ) `2*dim` / byte `dim`
  - 예) 1M, dim=256, m=16, fp32 → `1.1*(4*256+8*16)*1e6 ≈ 1.27 GB`
- **IVF**: `1.1 * ((4*dim)*N + 4*nlist*dim)`
- **HNSW+PQ**: `1.1 * (((pq_code_size/8)*pq_m + 24 + 8*hnsw_m)*N + num_segments*(2^pq_code_size*4*d))`

## 양자화 비교
| 방식 | 메모리 절감 | recall | 학습 | 핵심 리스크 |
|---|---|---|---|---|
| **SQ(fp16)** | 50% (범위 [-65504,65504]) | 미미 | 불필요 | `clip=true` 시 recall 저하. `clip=false`(기본)면 범위 초과 입력 거부. **단 L2 단위벡터(성분 ∈[-1,1])면 clip 미발동 → `clip=true` 무해**. 보통 first choice |
| **PQ** | 최대(m·code_size) | 가장 큼 | **필수(k-means)** | dim이 `m`으로 나눠떨어져야. 학습데이터 부족 시 품질↓, 재학습+재색인 |
| **BQ** | 1-bit 32x/2-bit 16x/4-bit 8x | 저비트일수록 큼 | 색인 중 자동 | recall 보강(ADC·Random Rotation·rescore) 시 latency↑. ADC는 1-bit만 |

## Disk-based (`on_disk`)
- 압축 인덱스는 메모리, full-precision은 디스크 → 2단계 rescore. 기본 faiss+hnsw, **float만**, 기본 32x(4x는 lucene), `oversample_factor` 기본 2.0.
- **⚠️**: 디스크 I/O로 지연↑, **radial search 미지원**, compression_level별 정확 recall 수치표는 문서 미확인.

## off-heap / circuit breaker (k-NN 운영 1번 함정)
- k-NN 그래프는 **JVM heap이 아닌 off-heap(native)** 상주 → **heap 증설로 OOM 안 풀림**. 힙 모니터링에 안 잡힘.
- `knn.memory.circuit_breaker.limit` 기본 **50%**, 초과 시 LRU native eviction. 트리거 임계 `knn.circuit_breaker.unset.percentage`=75.
- **⚠️**: 너무 낮으면 잦은 eviction→그래프 재로드 지연↑, 너무 높으면 OS OOM.

## 3.x 저장 최적화
- **Remote/GPU index build**(3.0+): faiss+hnsw 한정, S3+외부 빌더. **Derived source**(3.0+): _source 미저장 절감, **nested·copy_to·ignore_above keyword 미지원**. **Memory-optimized search**(3.1+): faiss+hnsw, mmap+OS캐시.

## 문서 미확인
- disk compression_level별 recall 표, BQ oversample_factor 기본, Heap 32GB compressed-oops 상한(OpenSearch 페이지 명시 없음).
