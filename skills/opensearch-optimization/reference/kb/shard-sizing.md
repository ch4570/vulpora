---
title: 샤드 사이징 · ISM (샤드 크기/개수 · rollover/retention)
source: https://docs.opensearch.org/latest/tuning-your-cluster/performance/
last_fetched: 2026-06-24
skills: [opensearch-optimization]
---

# KB: 샤드 사이징 · ISM

> 오버/언더 샤딩 모두 비용. 시계열은 ISM으로. 예시는 일반 인덱스·로그성 인덱스.

## 리뷰 훅
- [ ] 샤드당 크기가 권장 범위(10–50 GB)에 드는가.
- [ ] heap 1 GiB당 샤드 ≤ 25개를 지키는가(오버샤딩 = 클러스터 상태/힙 과소비).
- [ ] 시계열 인덱스가 단일 비대 인덱스인가 → ISM **rollover** 필요.
- [ ] 오래된 데이터에 **retention(delete)** 정책이 있는가(무한 증가 방지).
- [ ] rollover 대상에 쓰기 alias(`is_write_index`)가 사전 설정됐는가.

## 샤드 사이징 가이드
- 샤드당 **10–50 GB**(검색 민감 10–30, 쓰기 위주 30–50).
- **heap 1 GiB당 샤드 ≤ 25개** 목표(샤드 메타데이터가 힙·클러스터 상태를 차지).
- **오버샤딩**: 샤드 과다 → 클러스터 상태 비대·힙 과소비·작은 샤드 비효율.
- **언더샤딩**: 샤드 과소 → 노드 간 분산 불균형·복구 시간↑·단일 샤드 비대.
- 샤드 수는 생성 시 고정(primary). 변경은 reindex/split/shrink.

## ISM (Index State Management)
- 정책 = **states + actions(순차) + transitions(조건)**. ISM job **기본 5분 주기**.
  `ism_template`+`index_patterns`로 새 인덱스에 자동 적용.
- **rollover**: `min_size`/`min_primary_shard_size`/`min_doc_count`/`min_index_age` 조건 충족 시
  새 인덱스로 전환(쓰기 alias 이동). 단일 인덱스 비대화 방지.
- **hot-warm-cold**: `allocation` action으로 노드 티어 이동(오래될수록 저비용 노드로).
- **delete**: `min_index_age` 등으로 retention. **복구 불가 → 스냅샷 병행**.
- **⚠️**: **red 상태에선 ISM job 미실행**, 5분 주기라 시점 정밀도 낮음, rollover alias 사전 존재 필요.

## 시계열 인덱스 패턴
- 단일 거대 인덱스(`logs`) 안티패턴 → rollover로 `logs-000001`, `-000002`… 회전 +
  alias로 검색·쓰기 추상화 + delete로 retention. 과거 인덱스는 force merge/티어 이동.

## 근거
- 샤드 10–50 GB·heap당 25 샤드 가이드, ISM rollover/retention 동작과 red 상태 제약은 공식
  performance/ISM 문서에 근거한다.
