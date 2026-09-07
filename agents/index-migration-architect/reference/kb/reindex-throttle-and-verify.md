---
title: reindex 스로틀·검증 (throttle / delta / verify)
source: https://docs.opensearch.org/latest/api-reference/document-apis/reindex/
last_fetched: 2026-06-25
consumers: [index-migration-architect]
---

# KB: reindex 스로틀·검증

> 대용량 reindex는 부하 제어(throttle·slices)와 진행 중 신규 쓰기(**delta**) 처리, 그리고 전환 전
> **검증**이 핵심이다. 직접 실행은 사용자가 하고, 에이전트는 명령·순서를 제시한다.

## 리뷰 훅
- [ ] reindex를 `wait_for_completion=false`로 던지고 **task로 추적**하는가(긴 작업 timeout 회피).
- [ ] 운영 부하를 `requests_per_second`(throttle)·`slices`로 제어하는가.
- [ ] 진행 중 신규 쓰기(**delta**)를 dual-write 또는 catch-up reindex로 정합 맞추는가.
- [ ] flip 전 **doc count 대조**(`_count`)와 핵심 쿼리/recall 비교를 수행하는가.

## reindex 옵션
| 옵션 | 효과 |
|---|---|
| `wait_for_completion=false` | task id 반환 → `GET _tasks/<id>`로 진행/완료 추적 |
| `requests_per_second` | 처리율 상한(throttle) — 운영 부하 보호 |
| `slices` (예: `auto`) | 병렬 분할로 처리량↑ (부하와 trade-off) |
| `conflicts=proceed` | version conflict 무시하고 계속(주의해서 사용) |
| `query`(source) | 부분 reindex·catch-up용 범위 한정 |

## delta(전환 중 신규 쓰기) 처리
- **dual-write**: 애플리케이션이 구·신 인덱스에 동시 쓰기 → 전환 단순, 코드 변경 필요.
- **catch-up reindex**: 1차 reindex 후, `range`(예: `updated_at >= 시작시각`) 쿼리로 **증분만** 재복사.
  타임스탬프 필드가 없으면 catch-up이 어려우므로 dual-write를 검토.

## 검증 (flip 전 — alias는 아직 구 인덱스)
1. `GET <old>/_count` vs `GET <new>/_count` 대조(delta 감안).
2. 대표 쿼리 N개 결과·정렬·recall 비교. 분석기 변경이면 `_analyze` 토큰 비교.
3. 통과 시에만 atomic alias flip(`zero-downtime-reindex-alias.md`).

## 진단 명령 (읽기전용)
```
GET _cat/indices/<index>_v*?v
GET _cat/aliases/<index>?v
GET <old>/_count
GET <new>/_count
GET _tasks/<task_id>
```

## 인용 시
"OpenSearch reindex 기준 대용량은 wait_for_completion=false + requests_per_second throttle; count 대조 후 flip" 식으로 근거를 단다.

## 문서 미확인 (재확인 필요)
- `slices=auto` 권장 상한, throttle와 slices 동시 적용 시 실효 처리율.
