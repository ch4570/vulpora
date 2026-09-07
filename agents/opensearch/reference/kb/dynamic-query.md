---
title: 동적 쿼리 (bool filter context · terms/페이징 한계 · PIT)
source: https://docs.opensearch.org/latest/query-dsl/compound/bool/
os_version: 3.5.0
last_fetched: 2026-06-22
consumers: [opensearch-expert]
---

# KB: 동적 쿼리 (bool · 페이징)

## 리뷰 훅
- [ ] 스코어 불필요 조건이 `must`에 들어가 불필요하게 스코어링되는가 → `filter`/`must_not`로.
- [ ] 동적 빌더가 필드명을 **화이트리스트**로 제한하는가(임의 필드 주입 차단).
- [ ] `terms` 배열에 **크기 상한 가드**가 있는가(`index.max_terms_count` 65,536).
- [ ] 깊은 페이징을 `from`+`size`로 하는가 → `search_after`/PIT로.
- [ ] 타입 기반 client에서 `terms`를 `bool.should`로 우회 구현했는가 → native 절로 치환.

## 검증된 한계 (기본값)
| 항목 | 설정명 | 기본 |
|---|---|---|
| terms 항목 최대 | `index.max_terms_count` | 65,536 |
| from+size 한계 | `index.max_result_window` | 10,000 |
| track_total_hits 정확 추적 | (기본) | 10,000 |
| PIT 최대 keep_alive | `point_in_time.max_keep_alive` | 24h |
| 노드당 열린 PIT | `search.max_open_pit_context` | 300 |

## filter vs query context
- `must`/`should` = query context(점수 부여). `filter`/`must_not` = **filter context**(점수 스킵 + **node query cache**).
- 재사용 필터(권한/테넌트)는 filter context로 캐시 적중↑. `should`는 `minimum_should_match` 명시.

## 딥 페이징
- from+size 10,000 초과 거부 → `search_after`(sort 필수) 또는 **PIT+search_after**(일관 페이지네이션). scroll은 구식(최대 10 slices).
- `track_total_hits`: 기본 10,000까지 정확, `true`면 전체 카운트(비용↑).

## 동적 빌더 안전성
- 필드명 화이트리스트, `terms` 크기 상한 가드, `script`/leading wildcard/`query_string` 남용 회피.
- **⚠️**: filter context는 관련도 정렬 불가. terms 상향(>65,536)은 메모리 부담. PIT 컨텍스트 자원 소비(300 한계)·장애 시 손실.

## 문서 미확인
- `track_total_hits` 3.x 기본 false 전환 적용 여부(제안 이슈만 존재).
