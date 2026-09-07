---
title: 한국어 분석 (nori 형태소 분석기)
source: https://docs.opensearch.org/latest/analyzers/language-analyzers/
os_version: 3.5.0
last_fetched: 2026-06-22
consumers: [opensearch-expert]
---

# KB: 한국어 분석 (nori)

> ⚠️ nori는 **번들 아님, 별도 설치**: `opensearch-plugin install analysis-nori`(전 노드 + 재시작).
> 내장 language-analyzers 목록에 Korean 없음(CJK는 icu_analyzer만 명시).
> 코드베이스가 순수 벡터(nori grep 0건)면 이 축은 **"해당 없음"** 으로 명시.

## 리뷰 훅
- [ ] 한국어 `text` 필드에 standard 대신 **nori** 분석기를 쓰는가.
- [ ] `decompound_mode`가 의도(재현율 vs 정밀)에 맞는가.
- [ ] 도메인 고유명사(직무·기업명)에 **사용자 사전**이 있는가.
- [ ] 다중어 동의어를 **search-time `synonym_graph`** 로 처리하는가(index-time은 토큰 그래프 무시).
- [ ] `_analyze` API로 분석 결과를 검증했는가.

## 핵심 설정
- **`nori_tokenizer` `decompound_mode`**: `none`(분해 안 함) / `discard`(분해+원형 폐기, **기본**) / `mixed`(분해+원형 유지). 재현율↑면 mixed.
  - **⚠️**: mixed는 토큰 수↑(인덱스 크기·점수 통계 영향), none은 복합명사 부분매칭 약화.
- **`user_dictionary`**(파일) / **`user_dictionary_rules`**(인라인): 고유명사·직무·기업명. **⚠️ 변경 시 reindex**.
- **`nori_part_of_speech` (stoptags)**: 조사(J)·어미(E) 등 품사 토큰 제거. **⚠️** 과다 지정 시 의미 토큰 손실, 커스텀은 기본 목록 덮어씀.
- **synonym vs synonym_graph**: 다중어 동의어는 **search-time + `synonym_graph`** 에서만 토큰 그래프 정상 처리. `expand` 기본 true, `lenient` 기본 false. Synonyms API/`updateable:true`는 search analyzer 전용(무중단 갱신).
  - **⚠️**: index-time은 빠르나 갱신 시 reindex, search-time은 매 쿼리 비용↑.

## 문서 미확인
- `nori_readingform` OpenSearch 페이지 직접 인용, 기본 stoptags 전체 목록.
