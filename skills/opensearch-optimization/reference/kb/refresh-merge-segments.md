---
title: refresh · flush · 세그먼트 머지 · force merge
source: https://docs.opensearch.org/latest/tuning-your-cluster/performance/
last_fetched: 2026-06-24
skills: [opensearch-optimization]
---

# KB: refresh · flush · 세그먼트 머지

> Lucene 세그먼트 수명주기를 이해하면 검색 가시성·디스크·지연을 통제할 수 있다.

## 리뷰 훅
- [ ] 검색 노출 지연이 문제인데 `refresh_interval`을 무작정 늘렸는가(가시성↓).
- [ ] force merge(`max_num_segments=1`)를 **쓰기 종료 후에만** 하는가.
- [ ] 쓰기가 지속되는 인덱스에 force merge를 걸어 거대 세그먼트가 재병합 안 되는가.
- [ ] 잦은 작은 세그먼트(빈번 refresh)로 머지 비용이 과한가.
- [ ] 수동 `refresh` 호출을 매 쓰기마다 남발하지 않는가.

## 용어 (Lucene 수명주기)
- **refresh**: 인메모리 버퍼를 **검색 가능한 세그먼트**로 만든다(아직 디스크 fsync 아님).
  → refresh 전 문서는 검색에 안 보인다. 기본 1s.
- **flush**: 세그먼트를 디스크로 fsync하고 translog를 비운다(영속화). 자동 수행.
- **merge**: 작은 세그먼트들을 큰 세그먼트로 합치며 **삭제 문서(deleted docs)** 를 실제 제거.
  백그라운드 자동.

## refresh_interval
- 짧을수록(1s) 실시간성↑·세그먼트 多·머지 비용↑. 길수록(30s/-1) 처리량↑·검색 노출 지연↑.
- **로그/배치성**은 길게, **실시간 검색**은 기본 유지. `-1`은 적재 후 복원 전제(indexing KB).

## segment merge
- 세그먼트가 많으면 검색이 모든 세그먼트를 훑어 느려진다 → 머지가 통합.
- 빈번한 refresh로 작은 세그먼트가 쏟아지면 머지가 CPU/IO를 잡아먹는다 → refresh 간격·bulk로 완화.
- 삭제/업데이트가 많으면 deleted docs가 쌓여 머지 전까지 공간·검색 비용 차지.

## force merge (`_forcemerge`)
- `max_num_segments=1`로 세그먼트를 강제 통합 → 읽기 전용 인덱스의 검색 지연·삭제문서 정리에 효과.
- **⚠️ 규칙**: **쓰기가 끝난 인덱스에만**. 쓰기 지속 인덱스에 걸면 만들어진 **거대 단일 세그먼트가
  이후 자동 머지 대상에서 빠져** 영구히 비대해진다. 시계열 인덱스는 롤오버로 닫힌 과거 인덱스에만.
- I/O 집약적 → 한가한 시간대에.

## 근거
- refresh가 검색 가시성을 만들고, force merge는 쓰기 종료 후에만 해야 한다는 점은 공식 performance/
  segment 관리 문서에 근거한다.
