---
title: 페이지네이션 (from/size 한계 · search_after · PIT · scroll)
source: https://docs.opensearch.org/latest/search-plugins/searching-data/paginate/
last_fetched: 2026-06-24
skills: [opensearch-query-review]
---

# KB: 페이지네이션

> 딥 페이징을 안전하게. 예시는 일반 인덱스(`Order` 목록)의 정렬 페이지네이션.

## 리뷰 훅
- [ ] 깊은 페이징을 `from`+`size`로 하는가 → `search_after`/PIT로 치환.
- [ ] `from+size`가 `index.max_result_window`(기본 10,000)를 넘을 수 있는가.
- [ ] `search_after`에 **결정적 tie-breaker**(예: `_id`/`_shard_doc`) 정렬이 포함됐는가.
- [ ] 일관된 스냅샷 페이지네이션이 필요한데 PIT 없이 search_after만 쓰는가.
- [ ] 전체 카운트가 꼭 필요한 게 아닌데 `track_total_hits: true`로 비용을 무는가.
- [ ] PIT를 열고 **닫지 않는** 경로가 있는가(컨텍스트 자원 누수).

## 검증된 한계 (기본값)
| 항목 | 설정명 | 기본 |
|---|---|---|
| from+size 한계 | `index.max_result_window` | 10,000 |
| track_total_hits 정확 추적 | (기본) | 10,000 |
| PIT 최대 keep_alive | `point_in_time.max_keep_alive` | 24h |
| 노드당 열린 PIT | `search.max_open_pit_context` | 300 |

## from + size (얕은 페이징만)
- `from`+`size`는 각 샤드에서 `from+size`개를 가져와 코디네이팅 노드에서 합쳐 자른다 →
  깊어질수록 메모리·정렬 비용 폭증, `max_result_window`에서 막힘.
- **얕은 페이지(앞쪽 몇 페이지)** 에만 적합.

## search_after (권장 커서)
- 직전 페이지 **마지막 문서의 sort 값**을 `search_after`로 넘겨 다음 페이지를 읽는다.
  `from` 없이 동작 → 깊이에 무관하게 일정 비용.
- **필수**: `sort`가 있어야 하고, 마지막 정렬 키를 **유니크 tie-breaker**(`_id` 또는
  `_shard_doc`)로 끝내 동점 누락/중복을 막는다.
- 실시간 인덱싱 중에는 페이지 간 결과가 흔들릴 수 있다 → 일관성이 필요하면 PIT와 결합.

## PIT (Point in Time) + search_after
- PIT는 **특정 시점의 인덱스 스냅샷**(`_search/point_in_time`로 생성, `pit_id` 반환)을
  고정해 페이지 간 일관된 뷰를 보장한다.
- `pit.keep_alive`로 수명 연장. **다 쓰면 반드시 DELETE**로 닫는다(컨텍스트 자원, 노드당 300 한계).
- scroll보다 권장: 동시 검색 가능, slice 제약 없음.

## scroll (구식)
- 대량 일괄 추출용 레거시. 상태를 유지하고 slice 수 제약이 있다 → 신규 설계에서는 PIT 권장.

## track_total_hits
- 기본은 **10,000까지만 정확** 카운트(이후 `gte`로 추정). 전체 정확 카운트가 필요하면
  `true`(비용↑), 카운트가 불필요하면 `false`로 명시해 비용 절감.

## 근거
- `max_result_window` 10,000 한계와 search_after/PIT가 딥 페이징 대안이라는 점은 공식
  paginate 문서에 근거한다.
