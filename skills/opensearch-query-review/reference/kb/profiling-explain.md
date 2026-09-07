---
title: 쿼리 프로파일링 (Profile API · explain · slow log)
source: https://docs.opensearch.org/latest/api-reference/profile/
last_fetched: 2026-06-24
skills: [opensearch-query-review]
---

# KB: 쿼리 프로파일링

> 느린 쿼리를 추측이 아니라 측정으로 진단한다.

## 리뷰 훅
- [ ] 느림 진단을 추측이 아니라 **Profile API**로 했는가.
- [ ] `profile: true`/`explain: true`를 **운영 상시**로 켜두지 않는가(둘 다 비용 큼).
- [ ] 무거운 집계/스크립트가 매 요청 실행되는데 캐시·`size:0`을 못 쓰는가.
- [ ] 상한이 필요한 탐색에 `terminate_after`/`timeout`을 고려했는가.
- [ ] slow log 임계가 운영 인덱스에 설정돼 회귀를 잡는가.

## Profile API
- `"profile": true`를 검색 본문에 넣으면 **샤드별 쿼리/집계 실행 분해**(각 Lucene 절의
  `time_in_nanos`, `breakdown`)를 반환한다.
- 읽는 법: 어느 절이 시간을 먹는지(`build_scorer`/`next_doc`/`score`), collector 단계,
  집계의 `initialize`/`collect`/`reduce` 비중을 본다.
- **⚠️**: profile은 오버헤드가 크고 출력이 방대 → **진단 시에만**. 네트워크/코디네이팅 reduce
  비용은 profile에 완전히 드러나지 않는다.

## explain (점수 분해)
- `explain: true`는 각 문서 **점수의 산식**(tf/idf/boost)을 보여준다. "왜 이 순서인가"를 따질 때.
- 단일 문서는 `_explain/{id}`로 더 가볍게. **운영 상시 금지**.

## 상한 / 타임아웃
- `terminate_after`: 샤드당 수집 문서 수 상한(조기 종료, 근사 카운트 감수).
- `timeout`: 요청 시간 상한(부분 결과 가능). 무거운 탐색의 폭주 방어.
- `track_total_hits: false`로 카운트 비용 절감(pagination KB 참조).

## slow log
- `index.search.slowlog.threshold.query.*` / `.fetch.*`(warn/info/debug/trace)로 임계 초과
  쿼리를 로깅 → 회귀·이상 쿼리 탐지. 운영 인덱스에 임계를 걸어둔다.

## 흔한 병목 (점검 순서)
1. 점수 불필요 조건이 query context에 → `filter`로(캐시 미적중·불필요 스코어링).
2. 딥 페이징(`from`+`size`) → search_after/PIT.
3. 광역 집계/정렬을 매 요청 → shard request cache(`size:0`)·사전 집계.
4. leading wildcard/`query_string`/`script` → 대안 절·표현식 필드.
5. k-NN `ef_search`/`k` 불일치, post-filter under-fetch(vector-hybrid-query.md).

## 근거
- profile/explain이 비용이 크고 진단용이라는 점, terminate_after/timeout이 상한 수단이라는 점은
  공식 Profile API·검색 문서에 근거한다.
