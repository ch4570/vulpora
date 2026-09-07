---
title: 무중단 재색인 + alias 스왑 (zero-downtime reindex)
source: https://docs.opensearch.org/latest/im-plugin/index-alias/
last_fetched: 2026-06-25
consumers: [index-migration-architect, opensearch-expert]
---

# KB: 무중단 재색인 + alias 스왑

> 매핑/분석기 immutable 변경의 표준 무중단 경로. 애플리케이션은 **물리 인덱스가 아니라 alias**로만
> 접근해야 alias flip으로 무중단 전환·즉시 롤백이 가능하다.

## 리뷰 훅
- [ ] 애플리케이션이 물리 인덱스명이 아니라 **alias**(읽기/쓰기)로 접근하는가.
- [ ] alias flip을 `_aliases` actions의 **remove + add 한 번의 원자적 호출**로 하는가(개별 호출 금지).
- [ ] **verify(doc count·샘플 쿼리·recall) 통과 후에만** flip 하는가.
- [ ] 전환 중 신규 쓰기(**delta**)를 dual-write 또는 catch-up reindex로 정합 맞추는가.
- [ ] **구 인덱스를 즉시 drop하지 않고** 관찰 기간 동안 보존(롤백 대비)하는가.

## 표준 순서 (ordered)
1. **새 인덱스 생성** `<index>_vN+1` — 신 매핑/분석기 적용.
2. **reindex** `POST _reindex` (`wait_for_completion=false` → task 추적, throttle). 상세는 `reindex-throttle-and-verify.md`.
3. **verify** — alias가 아직 구 인덱스를 가리키는 상태에서 신 인덱스에 직접 질의:
   - `GET <old>/_count` vs `GET <new>/_count` 대조,
   - 핵심 쿼리 결과·recall 비교(분석기 변경이면 `_analyze` 토큰 비교).
4. **atomic alias flip** — 한 번의 원자적 호출:
   ```
   POST _aliases
   { "actions": [
     { "remove": { "index": "<index>_vN",   "alias": "<index>" } },
     { "add":    { "index": "<index>_vN+1", "alias": "<index>" } }
   ]}
   ```
5. **drop old** — 관찰 기간(롤백 대비) 후에만 `DELETE <index>_vN`.

## 롤백
- 역방향 flip(`remove vN+1` + `add vN`)으로 즉시 복구 → **구 인덱스 보존이 전제**.
- 롤백 시점에 신 인덱스에만 들어간 delta는 구 인덱스로 catch-up 해야 정합 유지.

## 읽기/쓰기 alias
- 단순 swap엔 단일 alias로 충분. 복잡한 전환은 **읽기 alias / 쓰기 alias 분리**로 쓰기를 먼저 신 인덱스로
  돌리고 읽기를 나중에 전환(또는 그 반대) 가능.

## 인용 시
"OpenSearch index-alias 기준 alias actions는 원자적 — remove+add를 한 호출로 묶어야 빈 창(window) 없이 flip" 식으로 근거를 단다.

## 문서 미확인 (재확인 필요)
- write index(`is_write_index`) 다중 alias 동작 세부, ISM 롤오버와의 상호작용.
