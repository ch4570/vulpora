---
title: 분석기 마이그레이션 (nori · 동의어/오타)
source: https://docs.opensearch.org/latest/analyzers/token-filters/synonym-graph/
last_fetched: 2026-06-25
consumers: [index-migration-architect, opensearch-expert]
---

# KB: 분석기 마이그레이션 (nori · 동의어/오타)

> 분석기/토크나이저 변경은 **색인된 토큰 자체를 바꾸므로 항상 reindex 단위**다. 단, search-time
> 동의어는 무중단 갱신이 가능한 예외가 있다. 한국어 `text`는 nori(별도 설치) 없이는 품질이 붕괴한다.
> nori grep 0건이면 **"해당 없음"** 으로 명시한다.

## 리뷰 훅
- [ ] index-time 분석기(tokenizer·char_filter·index-time filter) 변경을 **reindex 단위**로 분류했는가.
- [ ] nori `decompound_mode`·사용자 사전(`user_dictionary`) 변경이 reindex 필요임을 인지했는가.
- [ ] 다중어 동의어/오타를 **search-time `synonym_graph`** 로 처리하는가(index-time은 토큰 그래프 무시).
- [ ] search-time 동의어를 `updateable:true` + Synonyms API로 **무중단 갱신**할 수 있는지 확인했는가.
- [ ] 마이그레이션 검증에 `_analyze`로 신·구 토큰을 비교하는 단계를 넣었는가.

## index-time vs search-time
| 변경 위치 | reindex 필요? | 무중단 갱신 |
|---|---|---|
| **index-time analyzer/tokenizer** (예: standard→nori, decompound_mode 변경, 사용자 사전) | **필요** (토큰 재생성) | 불가 → 새 인덱스+reindex+alias |
| **search-time `synonym_graph`** (다중어 동의어·오타 매핑) | 불필요 (질의 시 확장) | `updateable:true` + Synonyms API로 갱신 가능 |

## nori 변경 시
- `decompound_mode`(`none`/`discard`(기본)/`mixed`)·`user_dictionary`·`nori_part_of_speech` stoptags 변경은
  색인 토큰을 바꾼다 → **reindex 단위**. mixed는 토큰 수↑(인덱스 크기·점수 통계 영향).
- **검증**: `GET <new>/_analyze`로 대표 문서 토큰을 구 인덱스와 비교한 뒤 alias flip.

## 동의어/오타
- 다중어(공백 포함) 동의어는 **search-time + `synonym_graph`** 에서만 토큰 그래프가 정상 처리된다.
  `expand` 기본 true, `lenient` 기본 false.
- search analyzer에 `updateable:true`로 두면 reindex 없이 사전 갱신(무중단) 가능. index analyzer엔 적용 불가.
- 오타 보정을 분석 단계(동의어 사전)가 아니라 쿼리 `fuzziness`로 할지 분리해 설계한다.

## 인용 시
"OpenSearch synonym-graph 기준 다중어 동의어는 search-time graph filter에서만 정상 처리; index-time 변경은 reindex 단위" 식으로 근거를 단다.

## 문서 미확인 (재확인 필요)
- nori 플러그인 설치 절차(전 노드+재시작) 세부, Synonyms API reload 동작.
