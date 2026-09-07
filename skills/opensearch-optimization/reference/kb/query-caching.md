---
title: 쿼리 캐싱 · JVM/breaker (node query · shard request · fielddata)
source: https://docs.opensearch.org/latest/tuning-your-cluster/performance/
last_fetched: 2026-06-24
skills: [opensearch-optimization]
---

# KB: 쿼리 캐싱 · JVM/breaker

> 캐시는 반복 질의를 살린다. breaker는 OOM을 막는다. 예시는 일반 인덱스.

## 리뷰 훅
- [ ] 재사용 필터를 `bool.filter`에 둬 **node query cache**에 적중시키는가.
- [ ] 반복 집계/대시보드를 `size:0`로 보내 **shard request cache**를 쓰는가.
- [ ] text 정렬/집계로 **fielddata** 힙을 태우는가 → keyword(doc_values)로.
- [ ] heap이 RAM 50% 이하, `-Xms`=`-Xmx`인가.
- [ ] k-NN OOM을 heap 증설로 풀려 하지 않는가(off-heap, vector-tuning-memory KB).

## 캐시 종류
| 캐시 | 크기(힙) | 무엇을 캐시 | 조건 |
|---|---|---|---|
| **Node query cache** | 10% | filter context 결과(비트셋) | `bool.filter`/`must_not`. 재사용 필터에 강력 |
| **Shard request cache** | 1% | 검색 응답(주로 집계) | **`size:0` 요청만**. 대시보드 반복에 강력 |
| **Field data cache** | (fielddata breaker) | text 정렬/집계용 역인덱스→메모리 변환 | text 정렬/집계 시. **힙 폭주 → 회피** |

- **node query cache**: 자주 쓰는 필터(상태·카테고리·권한)를 filter context에 두면 비트셋이
  재사용된다. query context(`must`/`should`)는 캐시 안 됨.
- **shard request cache**: `size:0`(히트 본문 없이 집계만)일 때만 캐시. 자주 갱신되는 인덱스는
  무효화가 잦아 효용↓.
- **field data cache**: `text` 필드 정렬/집계는 fielddata를 힙에 올린다 → 큰 인덱스에서 위험.
  **doc_values 있는 `keyword`** 로 대체가 정석.

## JVM heap
- heap = **RAM의 50% 이하**, `-Xms`=`-Xmx`(동적 리사이즈 방지).
- 나머지 50%는 OS 파일 캐시(Lucene 세그먼트 mmap) + **k-NN native(off-heap)** 용으로 남긴다.
- compressed oops 경계(약 32 GiB) 위로 heap을 키우면 포인터 비효율 → 신중.

## circuit breaker
| breaker | 기본 |
|---|---|
| **k-NN** `knn.memory.circuit_breaker.limit` | **50%** (off-heap, LRU eviction) |
| fielddata `indices.breaker.fielddata.limit` | 힙 40% |
| request `indices.breaker.request.limit` | 힙 60% |
| parent `indices.breaker.total.limit`(use_real_memory=true) | 힙 95% |

- breaker는 OOM 직전에 요청을 거부해 노드를 보호한다. 잦은 트립은 쿼리/매핑/메모리 설계 문제 신호.

## 근거
- node query cache가 filter 결과를, shard request cache가 `size:0` 응답을 캐시한다는 점, heap 50%
  규칙과 breaker 기본값은 공식 performance/circuit breaker 문서에 근거한다.
