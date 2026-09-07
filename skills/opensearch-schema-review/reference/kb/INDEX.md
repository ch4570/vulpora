# OpenSearch Schema KB — 색인 (INDEX)

> OpenSearch **공식 문서**(docs.opensearch.org/latest) Mappings·Field types·Analyzers·Vector를
> distill한 인용 가능한 KB. 각 파일 frontmatter에 `source`·`last_fetched`·`skills`.
> **리뷰 시 사용법**: 작업 유형에 맞는 KB를 먼저 읽고 "리뷰 훅"으로 점검하며, 지적 시 KB의
> `source` URL을 근거로 인용한다.

## 작업 유형 → 읽을 KB

| 작업 | KB | 다룸 |
|---|---|---|
| 필드 타입 선택 | [field-types](field-types.md) | text/keyword, multi-field, numeric/date/ip, object/nested/flat_object, index/doc_values |
| 분석기 설계 | [analyzers-tokenizers](analyzers-tokenizers.md) | analyzer 구성, char/token filter, search vs index analyzer, normalizer, nori(한국어), _analyze |
| 벡터 필드 | [knn-vector-field](knn-vector-field.md) | knn_vector, dimension/space_type/engine/method/mode, immutable, derived source |
| 템플릿 | [index-templates](index-templates.md) | index/component template, 우선순위, settings/mappings/aliases, ism_template |
| dynamic 위험 | [dynamic-mapping-risks](dynamic-mapping-risks.md) | dynamic 모드, 매핑 폭발, dynamic_templates, limit 설정 |

## 원칙 문서와의 관계
- 상위 통찰·우선순위는 `../principles.md`(헌법). KB는 그 원칙의 **공식 문서 근거·세부 규칙**.
- 충돌 시 **KB(공식 문서)가 우선**.

## 갱신
- 각 파일 `last_fetched` 기준. OpenSearch 메이저 업글 시 `source`를 재fetch.
- TODO(차기 KB 후보): `runtime` 필드, `copy_to`/`alias` 필드, `join` 필드, percolator 매핑.
