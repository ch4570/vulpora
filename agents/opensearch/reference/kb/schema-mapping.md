---
title: 스키마/매핑 (dynamic · text/keyword · derived source · nested)
source: https://docs.opensearch.org/latest/field-types/mapping-parameters/
os_version: 3.5.0
last_fetched: 2026-06-22
consumers: [opensearch-expert]
---

# KB: 스키마/매핑

> **공통 ⚠️**: 기존 필드 타입은 변경 불가 — 대부분 변경은 **새 인덱스 + reindex**(alias 스왑/blue-green).

## 리뷰 훅
- [ ] 운영 인덱스 `dynamic`이 `strict`/`false`인가(매핑 폭발 방지).
- [ ] 정렬·집계·exact 필드가 `keyword`(doc_values), 전문검색이 `text`인가.
- [ ] 검색 불필요 대용량 필드에 `index:false`, 미사용 keyword에 `doc_values:false`인가.
- [ ] 큰 벡터를 `_source`에 중복 저장하는가 → derived source 검토(nested/copy_to 미지원 주의).
- [ ] `dimension` 등 핵심 필드가 매핑에 명시됐는가(dynamic 추론으로 잘못 굳지 않게).

## 검증된 기본값
| 설정 | 기본 |
|---|---|
| `dynamic` | true |
| `index` | true |
| `doc_values` | true (text 미지원) |
| `index.mapping.nested_objects.limit` | 10000 |
| `index.mapping.nested_fields.limit` | 50 |
| `index.mapping.total_fields.limit` | 1000 |

## 항목별 (최적화 ↔ 리스크)
| 항목 | 최적화 | 리스크 |
|---|---|---|
| `dynamic` | 운영 `strict`/`false` | strict는 미정의 필드 인입 시 색인 실패(400); false는 새 필드 검색 불가 |
| text vs keyword | 정렬·집계 keyword, full-text text | text 정렬/집계는 fielddata(힙) 필요 |
| multi-field | 1입력 → text+keyword.raw+ngram | 서브필드마다 색인↑, 소급 적용 안 됨 |
| `index:false` | 검색 불필요 대용량 → 크기↓ | text는 doc_values 미지원이라 검색 완전 불가 |
| `doc_values:false` | 정렬·집계 안 쓰는 keyword 디스크↓ | 비활성 시 정렬·집계·스크립트 불가 |
| `_source` 비활성 | — | **update/reindex/디버깅 불가**(공식 warning) |
| derived source | _source 미저장 절감+update/reindex 유지 | nested·copy_to·ignore_above/normalizer keyword 미지원, 재구성 느림 |
| flat_object | **매핑 폭발 방지**(서브필드 미색인) | 서브필드 검색 비효율, 수치연산·정렬·집계 미지원 |
| nested | 객체 단위 정확 매칭 필요시만 | 객체당 별도 Lucene 문서(문서 수↑), limit 초과 실패, derived source 미지원 |

## 인용 시
"OpenSearch `mapping-parameters` 기준 `_source` 비활성은 update/reindex 불가" 식으로.
