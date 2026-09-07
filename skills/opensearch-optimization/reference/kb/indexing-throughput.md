---
title: 인덱싱 처리량 (bulk · refresh/replica 토글 · translog · 복원 경로)
source: https://docs.opensearch.org/latest/tuning-your-cluster/performance/
last_fetched: 2026-06-24
skills: [opensearch-optimization]
---

# KB: 인덱싱 처리량

> 대량 적재 속도와 데이터 안전성의 trade-off. 예시는 일반 인덱스 대량 백필.

## 리뷰 훅
- [ ] 대량 적재 시 `replicas:0`/`refresh_interval:-1`을 쓰고 **적재 후 복원 코드 경로**가 있는가.
- [ ] `replicas:0` 구간의 노드 장애 = 데이터 유실 리스크를 감수했는가.
- [ ] bulk 요청 크기가 적정(5–15 MiB)인가, 과대해서 rejection이 나지 않는가.
- [ ] `translog.durability: async`로 두고 장애 시 ack된 쓰기 유실을 허용했는가.
- [ ] `index_buffer_size` 상향이 검색 메모리를 과도하게 빼앗지 않는가.

## 인덱싱 튜닝 (기본 → 최적화 / 리스크)
| 항목 | 기본 | 최적화 | 리스크 |
|---|---|---|---|
| `refresh_interval` | 1s | 대량 적재 30s/-1 | 길수록 검색 노출 지연, **적재 후 복원 필수** |
| `number_of_replicas` | 1 | 적재 전 0 → 후 복원 | **0인 동안 노드 장애 시 유실** |
| `translog.durability` | request | 순수 색인 `async` | async는 장애 시 ack된 쓰기 유실 |
| `translog.flush_threshold_size` | 512MB | 색인 heap 25%까지 | flush 빈도↓·복구 시간↑ |
| bulk 크기 | — | **5–15 MiB** 시작 점증 | 과대 시 메모리 압박·rejection |
| `index_buffer_size` | 힙 10% | 최대 25%까지 | 색인용 힙↑ → 검색 메모리↓ |

## bulk API
- 단건 색인 대신 **`_bulk`** 로 묶어 네트워크·오버헤드를 줄인다.
- 크기는 **5–15 MiB**에서 시작해 rejection/지연을 보며 점증. 도큐먼트 수보다 **바이트 크기** 기준.
- rejection(429)은 백오프+재시도. 무한 증대 금지(메모리 압박).

## refresh / replica 토글 패턴
- **적재 시작 전**: `refresh_interval:-1`, `number_of_replicas:0`.
- **적재 종료 후**: 원래 `refresh_interval`(보통 1s)·replica 복원 → 자동 복제 시작.
- **⚠️ 핵심**: 이 복원이 **코드 경로로 보장**돼야 한다. 토글만 해두고 복원 누락 시
  검색 미노출·무복제 상태가 운영에 잔존(설정 KB가 아니라 토글/복원 코드로 판별).

## translog / durability
- `request`(기본): 각 요청을 fsync 후 ack → 안전. `async`: 주기적 fsync → 빠르나 장애 시
  마지막 구간 유실 가능. **재현 가능한 소스에서의 순수 재색인**에만 async 고려.

## 근거
- refresh/replica 토글, bulk 크기 가이드, translog durability trade-off는 공식 performance tuning
  문서에 근거한다.
