---
title: 분석기 · 토크나이저 (analyzer 구성 · search vs index · normalizer · nori)
source: https://docs.opensearch.org/latest/analyzers/
last_fetched: 2026-06-24
skills: [opensearch-schema-review]
---

# KB: 분석기 · 토크나이저

> 분석기가 전문검색 품질을 만든다. 예시는 일반 인덱스(`Article` 본문).

## 리뷰 훅
- [ ] 색인 시 분석기와 검색 시 분석기가 **호환**되는가(다르면 토큰 불일치로 0건).
- [ ] `keyword` 정규화(소문자·악센트)에 analyzer 대신 **normalizer**를 쓰는가.
- [ ] 한국어 `text`에 standard 대신 **nori**를 쓰는가(미설치면 품질 붕괴).
- [ ] 동의어를 **search-time `synonym_graph`** 로 처리하는가(index-time은 토큰 그래프 무시·갱신 시 reindex).
- [ ] 분석 결과를 **`_analyze` API**로 실제 검증했는가.

## analyzer 구성 3요소
1. **character filter**(0+): 토큰화 전 문자 치환(`html_strip`, `mapping`, `pattern_replace`).
2. **tokenizer**(정확히 1): 텍스트를 토큰으로(`standard`, `whitespace`, `ngram`, `edge_ngram`,
   `pattern`, `keyword`(통째), 언어별 토크나이저).
3. **token filter**(0+): 토큰 가공(`lowercase`, `stop`, `stemmer`, `synonym`/`synonym_graph`,
   `asciifolding`, `ngram`).

내장 analyzer: `standard`(기본), `simple`, `whitespace`, `keyword`, `pattern`, 언어별, `fingerprint`.

## index analyzer vs search analyzer
- 색인 시(`analyzer`)와 검색 시(`search_analyzer`)에 **다른 분석기**를 지정할 수 있다.
- **규칙**: 둘은 호환돼야 한다. 예) index-time edge_ngram + search-time standard(쿼리는 ngram 안 함)는
  자동완성 정석 패턴. 무심코 다르게 두면 토큰이 안 맞아 매칭 실패.

## normalizer (keyword 전용)
- `keyword` 필드를 토큰화 없이 **정규화만**(소문자·악센트 제거 등) 한다. char/token filter 일부만.
- 대소문자 무시 exact 매칭/정렬에 사용(전체 analyzer를 쓰면 토큰이 쪼개져 keyword 의미 깨짐).

## 동의어 (synonym vs synonym_graph)
- 다중어(멀티 토큰) 동의어는 **search-time + `synonym_graph`** 에서만 토큰 그래프가 정상 처리된다.
- `expand` 기본 true, `lenient` 기본 false. Synonyms API/`updateable:true`는 search analyzer
  전용으로 **무중단 갱신** 가능.
- **⚠️**: index-time 동의어는 빠르지만 갱신 시 reindex 필요. search-time은 매 쿼리 비용↑.

## 한국어 (nori) — 한국어 인덱스일 때만
- nori는 **번들 아님, 별도 설치**: `opensearch-plugin install analysis-nori`(전 노드 + 재시작).
- `nori_tokenizer`의 `decompound_mode`: `none`/`discard`(분해+원형 폐기, **기본**)/`mixed`
  (분해+원형 유지, 재현율↑). `user_dictionary`(고유명사·도메인 용어, **변경 시 reindex**),
  `nori_part_of_speech`(조사·어미 등 품사 제거).
- **순수 벡터(nori grep 0건)면 "해당 없음"** 으로 명시.

## 검증
- **`_analyze` API**(`{"analyzer": "...", "text": "..."}`)로 실제 토큰을 확인한다.
  매핑만 보고 단정하지 않는다.

## 근거
- analyzer = char filter + tokenizer + token filter, normalizer가 keyword 전용, 다중어 동의어는
  search-time synonym_graph라는 점은 공식 analyzers 문서에 근거한다.
