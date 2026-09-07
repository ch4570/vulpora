---
title: Query DSL 기본 (bool · term · match · context)
source: https://docs.opensearch.org/latest/query-dsl/
last_fetched: 2026-06-24
skills: [opensearch-query-review]
---

# KB: Query DSL 기본 (bool · term · match · context)

> 모든 검색 쿼리의 토대. 예시는 일반 인덱스(`Article`/`Product`)의 텍스트·keyword 필드 기준.

## 리뷰 훅
- [ ] 스코어 불필요 조건이 `must`/`should`에 있는가 → `filter`/`must_not`(스코어 스킵 + 캐시).
- [ ] 정확값 비교를 `match`로 하는가 → `term`/`terms`(analyzed text엔 `term` 부적합).
- [ ] `should`만 있는 bool에 `minimum_should_match`가 명시됐는가(기본 동작 주의).
- [ ] 동적 빌더가 필드명을 **화이트리스트**로 제한하는가(임의 필드 주입 차단).
- [ ] `terms` 배열에 크기 상한 가드가 있는가(`index.max_terms_count` 기본 65,536).
- [ ] leading wildcard(`*foo`)·`query_string`·`script` 절을 사용자 입력으로 조립하지 않는가.

## leaf vs compound
- **Leaf 쿼리**: 특정 필드의 값을 찾는다 — `term`, `terms`, `match`, `match_phrase`, `range`,
  `prefix`, `wildcard`, `exists`, `ids`.
- **Compound 쿼리**: leaf/compound를 감싸 결합한다 — `bool`, `dis_max`, `function_score`,
  `constant_score`, `boosting`.

## filter context vs query context (가장 중요)
| 위치 | 점수 | 캐시 | 용도 |
|---|---|---|---|
| `bool.must` | O (관련도 기여) | X | 매칭 + 점수 둘 다 필요 |
| `bool.should` | O | X | OR, 점수 가산 |
| `bool.filter` | **X** | **node query cache** | 정확 매칭(상태·권한·범위) |
| `bool.must_not` | **X** | node query cache | 제외 |

- `filter`/`must_not`은 점수 계산을 생략하고 결과를 캐시한다 → 재사용 필터(권한/테넌트/카테고리)에
  강력. 점수가 필요 없는 모든 조건은 여기로 옮긴다.

## term-level vs full-text
- **`term`/`terms`**: 입력을 분석하지 **않고** 역색인 토큰과 정확 비교 → `keyword` 필드,
  상태값·ID·enum에 사용. **`text` 필드에 `term`을 쓰면** 분석된 토큰과 안 맞아 0건이 흔하다.
- **`match`**: 입력을 해당 필드 analyzer로 분석 후 OR(기본) 매칭 → `text` 전문검색.
  `operator: and`, `minimum_should_match`로 정밀도 조절. `match_phrase`는 순서·인접까지.
- **`range`**: 수치/날짜/`ip` 범위(`gte`/`lte`). 날짜는 date math(`now-7d/d`) 지원.

## bool 조립 규칙
- `must`(AND, 점수) + `filter`(AND, 무점수) + `should`(OR, 점수) + `must_not`(제외).
- `should`만 있고 `must`/`filter`가 없으면 **`should` 중 최소 1개**가 매칭돼야 한다.
  `must`/`filter`와 함께면 `should`는 기본적으로 **선택**(점수 가산만) → 필요 시
  `minimum_should_match`로 강제.

## 동적 빌더 안전성
- 필드명·연산자를 **화이트리스트**로 제한(임의 필드/스크립트 주입 차단).
- `terms` 배열 길이 가드(`index.max_terms_count` 65,536 이하), 사용자 free-text를
  `query_string`/leading wildcard로 직결하지 않는다.
- **⚠️ 안티패턴**: 타입 기반 client에서 `terms`를 `bool.should`의 `term` 다발로 우회 구현 →
  절 수 폭증·캐시 비효율. native `terms` 절로 치환.

## 근거
- filter context가 점수를 건너뛰고 캐시된다는 점, term은 비분석·match는 분석된다는 점은
  공식 Query DSL 문서의 핵심 규칙이다.
