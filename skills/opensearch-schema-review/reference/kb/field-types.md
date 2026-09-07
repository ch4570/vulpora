---
title: 필드 타입 (text/keyword · numeric/date · object/nested · index/doc_values)
source: https://docs.opensearch.org/latest/field-types/
last_fetched: 2026-06-24
skills: [opensearch-schema-review]
---

# KB: 필드 타입

> 검색 패턴이 타입을 정한다. 예시는 일반 인덱스(`Article`/`Product`/`Order`).

## 리뷰 훅
- [ ] 정렬·집계·exact·필터 필드가 `keyword`(doc_values), 전문검색이 `text`인가.
- [ ] 하나의 입력에 전문검색+정렬이 모두 필요하면 **multi-field**로 분리했는가.
- [ ] 검색 불필요 대용량 필드에 `index:false`, 미사용 keyword에 `doc_values:false`인가.
- [ ] `text` 필드에 정렬/집계/`term`을 기대하지 않는가(fielddata 힙 위험).
- [ ] 금액/정밀 수치를 float가 아니라 `scaled_float`/정수로 다루는가.
- [ ] `keyword`에 `ignore_above`로 비정상 장문 유입을 막는가.

## 검증된 기본값
| 설정 | 기본 |
|---|---|
| `index` | true |
| `doc_values` | true (text 미지원) |
| `index.mapping.total_fields.limit` | 1000 |
| `index.mapping.nested_fields.limit` | 50 |
| `index.mapping.nested_objects.limit` | 10000 |

## text vs keyword (핵심)
| | text | keyword |
|---|---|---|
| 분석 | analyzer로 토큰화 | 비분석(원문 그대로) |
| 용도 | 전문검색(`match`) | exact/필터/정렬/집계(`term`) |
| doc_values | **미지원** (정렬·집계엔 fielddata 필요, 힙↑) | 지원 |
| 권장 | 본문·제목 검색 | 상태·카테고리·ID·태그 |

- **multi-field**: 한 입력을 `text`(검색) + `keyword` 서브필드(정렬·집계)로 동시 색인.
  서브필드마다 색인 비용↑, **소급 적용 안 됨**(추가 후 reindex 필요).

## 수치 / 날짜 / 기타
- 정수 `byte/short/integer/long`, 부동 `float/double/half_float`, **`scaled_float`**(고정 스케일,
  금액에 적합). 금액을 `float`로 두면 반올림 오차.
- 날짜 `date`(밀리초)/`date_nanos`. 포맷·timezone을 명시.
- `boolean`, `ip`, `geo_point`/`geo_shape`, `range` 타입(정수/날짜 범위) 등.

## object / nested / flat_object
- **object**(기본): JSON 객체를 평탄화(`a.b`)해 색인. 배열 객체는 **필드별로 분리**되어
  "같은 객체 안" 조건을 보장 못 함.
- **nested**: 배열 객체를 객체 단위로 정확 매칭(객체당 별도 Lucene 문서). 문서 수↑·쿼리 비용↑,
  `nested_fields.limit`/`nested_objects.limit` 초과 시 실패.
- **flat_object**: 객체 전체를 한 필드로 — **매핑 폭발 방지**(서브필드 미색인). 단 서브필드
  검색은 제한, 수치연산·정렬·집계 불가.

## 비용 절감 파라미터
| 파라미터 | 효과 | 리스크 |
|---|---|---|
| `index:false` | 검색 불필요 대용량 → 인덱스 크기↓ | text는 검색 완전 불가 |
| `doc_values:false` | 정렬·집계 안 쓰는 keyword 디스크↓ | 정렬·집계·스크립트 불가 |
| `ignore_above` | 긴 keyword 색인 생략 | 임계 초과분 검색 불가(저장은 됨) |
| `norms:false` | 길이 정규화 점수 정보 제거 | 관련도 점수 약화 |
| `_source` 비활성 | — | **update/reindex/디버깅 불가**(공식 warning) |

## 근거
- text는 doc_values 미지원·keyword는 지원, multi-field가 소급 적용 안 된다는 점은 공식 field-types
  문서에 근거한다.
