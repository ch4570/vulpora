---
title: 클러스터 운영 (인덱싱 튜닝 · 샤드 · ISM · 캐시 · JVM/breaker)
source: https://docs.opensearch.org/latest/tuning-your-cluster/performance/
os_version: 3.5.0
last_fetched: 2026-06-22
consumers: [opensearch-expert]
---

# KB: 클러스터 운영

## 리뷰 훅
- [ ] 대량 적재 시 `replicas:0`/`refresh_interval:-1`을 쓰고 **적재 후 복원 코드 경로**가 있는가.
- [ ] 시계열 인덱스(로그/이벤트 등)에 ISM(rollover/retention)이 있는가, 단일 비대 인덱스 안티패턴인가.
- [ ] `_vN` 인덱스인데 alias·reindex 스왑 코드가 없는가(모델 변경 무중단 불가 = HIGH).
- [ ] heap이 RAM 50% 이하인가(나머지는 OS 캐시 + k-NN off-heap).

## 인덱싱 튜닝 (기본 → 최적화 / 리스크)
| 항목 | 기본 | 최적화 | 리스크 |
|---|---|---|---|
| `refresh_interval` | 1s | 대량 적재 30s/-1 | 길수록 검색 노출 지연, 적재 후 복원 필수 |
| `number_of_replicas` | 1 | 적재 전 0 → 후 복원 | **0인 동안 노드 장애 시 유실** |
| `translog.flush_threshold_size` | 512MB | 순수 색인 heap 25%까지 | `async` durability는 장애 시 ack된 쓰기 유실 |
| bulk | — | 5–15 MiB 시작 점증 | 과대 시 메모리 압박·rejection |
| `index_buffer_size` | 힙 10% | 최대 25%까지 | 색인용 힙↑ → 검색 메모리↓ |
| force merge | — | **쓰기 종료 후** `max_num_segments=1` | 쓰기 지속 인덱스엔 거대 세그먼트 재병합 안 됨 |

## 샤드 사이징 (※ 공식 블로그/AWS 가이드)
- 샤드당 **10–50 GB**(검색 민감 10–30, 쓰기 위주 30–50). **heap 1 GiB당 샤드 ≤ 25개**.
- **⚠️**: 오버샤딩 → 클러스터 상태/힙 과소비. 언더샤딩 → 분산 불균형·복구 지연.

## 메모리 / circuit breaker
| breaker | 기본 |
|---|---|
| **k-NN** `knn.memory.circuit_breaker.limit` | **50%** (off-heap, eviction) |
| fielddata `indices.breaker.fielddata.limit` | 힙 40% |
| parent `indices.breaker.total.limit`(use_real_memory=true) | 힙 95% |
| request `indices.breaker.request.limit` | 힙 60% |
- heap: RAM 50%, `-Xms`=`-Xmx`. **k-NN native는 off-heap → heap 증설로 k-NN OOM 안 풀림**(quantization-memory.md 참조).

## 캐시
- **Node query(filter) cache**(힙 10%): filter context 결과 → 재사용 필터 적중↑.
- **Shard request cache**(힙 1%): **`size:0` 요청만** 캐시 — 대시보드/집계 반복에 강력. 자주 갱신 인덱스는 무효화 잦아 효용↓.
- **Field data cache**: text 정렬/집계 시 힙 점유 → doc_values 권장.

## ISM (Index State Management)
- 정책 = states + actions(순차) + transitions(조건). ISM job **기본 5분 주기**. `ism_template`+`index_patterns`로 자동 적용.
- rollover(`min_size`/`min_primary_shard_size`/`min_doc_count`/`min_index_age`), hot-warm-cold(`allocation`), delete(+`min_index_age`).
- **⚠️**: **red 상태에선 ISM job 미실행**, 5분 주기라 시점 정밀도 낮음, rollover alias 사전 존재 필요, delete 복구 불가(스냅샷).

## 문서 미확인
- `index.translog.durability` 기본값, `max_merge_count` 기본값, rollover 조건 개별 기본값.
