---
title: 동적 매핑 위험 (dynamic 모드 · 매핑 폭발 · dynamic_templates)
source: https://docs.opensearch.org/latest/field-types/mapping-parameters/dynamic/
last_fetched: 2026-06-24
skills: [opensearch-schema-review]
---

# KB: 동적 매핑 위험

> 통제 안 된 dynamic 매핑은 매핑 폭발로 클러스터를 무너뜨린다. 예시는 일반 인덱스(`Order`).

## 리뷰 훅
- [ ] 운영 인덱스 `dynamic`이 `strict`/`false`인가(임의 필드로 인한 매핑 폭발 방지).
- [ ] `index.mapping.total_fields.limit`(기본 1000)을 늘려 폭발을 가리고 있지 않은가.
- [ ] 키가 가변(사용자 정의 key)인 데이터를 object로 두지 않고 **flat_object/nested**로 다루는가.
- [ ] dynamic 추론으로 굳은 타입(예: 첫 값이 정수라 long으로)이 의도와 다르지 않은가.
- [ ] 패턴 기반 자동 매핑이 필요하면 **`dynamic_templates`** 로 명시 제어하는가.

## dynamic 모드
| 값 | 새 필드 동작 |
|---|---|
| `true`(기본) | 자동으로 매핑에 추가·색인 |
| `runtime` | runtime 필드로 추가(쿼리 시 평가, 색인 안 함) |
| `false` | _source에 저장만, **색인 안 함**(검색 불가) |
| `strict` | 미정의 필드 인입 시 **색인 실패(400)** |

- 운영 인덱스는 `strict`(스키마 계약 강제) 또는 `false`(저장만)를 권장. 상속되므로 object별로도 지정 가능.

## 매핑 폭발 (mapping explosion)
- dynamic=true에서 **가변 key**(예: `{"attr_<uuid>": ...}`)가 들어오면 필드가 무한히 늘어
  클러스터 상태·힙을 잠식하고 결국 색인 실패에 이른다.
- **방어**:
  - `dynamic: strict`/`false`.
  - 가변 key 데이터는 **`flat_object`**(서브필드 미색인) 또는 key-value를 **`nested`** 배열로.
  - `index.mapping.total_fields.limit`(기본 1000)은 **안전망일 뿐** — 한계를 올려서 폭발을
    "허용"하는 것은 안티패턴. 근본 원인(가변 key)을 고친다.

## dynamic 타입 추론 함정
- 첫 값으로 타입이 굳는다: 정수 → `long`, 따옴표 문자열 → `text`+`keyword`, 날짜형 문자열은
  `date`로 추론될 수 있음(포맷 의존). 의도와 다르게 굳으면 reindex로만 교정.
- 핵심 필드(특히 `dimension` 등 벡터 관련)는 **반드시 명시**해 추론에 맡기지 않는다.

## dynamic_templates (제어된 자동 매핑)
- `match`/`match_mapping_type`/`path_match`로 조건에 맞는 새 필드를 **지정한 매핑으로** 자동 적용.
  예) 모든 문자열을 `keyword`로, `*_id`는 keyword로. 무통제 dynamic보다 안전한 절충안.

## 근거
- dynamic 4모드 동작과 매핑 폭발, total_fields.limit, dynamic_templates는 공식
  mapping-parameters/dynamic 문서에 근거한다.
