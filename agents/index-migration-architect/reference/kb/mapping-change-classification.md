---
title: 매핑 변경 분류 (additive vs reindex 필요)
source: https://docs.opensearch.org/latest/field-types/index/
last_fetched: 2026-06-25
consumers: [index-migration-architect, opensearch-expert]
---

# KB: 매핑 변경 분류 (additive vs reindex)

> 매핑 변경을 **update-mapping으로 가능(additive)** 한지, **새 인덱스+reindex가 필요(immutable)** 한지
> 분류한다. 의심스러우면 보수적으로 **reindex 쪽**으로 본다. 실제 매핑 diff 없이 "additive/safe"로
> 단정하지 않는다.

## 리뷰 훅
- [ ] 각 변경을 **실제 구 매핑 vs 신 매핑 diff**와 대조해 분류했는가(설명의 자기-확언 불가).
- [ ] 새 필드 추가/multi-field 추가 등 **additive 항목만** update-mapping으로 처리하는가.
- [ ] 타입 변경·분석기 변경·`knn_vector` 파라미터 변경·필드 삭제는 **reindex 필요**로 분류했는가.
- [ ] additive라도 매핑 폭발(과도한 dynamic 필드) 리스크를 점검했는가.

## Additive (update-mapping 허용 — 재색인 불필요)
| 변경 | 비고 |
|---|---|
| **새 필드 추가** | `PUT <index>/_mapping`으로 가능. 기존 문서엔 값 없음(검색 시 missing). |
| 기존 필드에 **multi-field(sub-field) 추가** | 예: `text`에 `.keyword` 추가. 단, **기존 문서엔 소급 적용 안 됨** → 전체 적용 원하면 reindex. |
| 일부 파라미터 update | `ignore_above`, `dynamic`, `meta` 등 (버전·필드별 허용 여부는 source 확인). |

## Reindex 필요 (immutable — 새 인덱스 + reindex)
| 변경 | 이유 |
|---|---|
| **필드 타입 변경** (예: `long`→`keyword`) | 타입은 변경 불가. 색인된 doc value/역색인 구조가 다름. |
| **analyzer/tokenizer 변경** | 색인된 토큰 자체가 바뀜 → 기존 토큰 재생성 필요(`analyzer-migration-nori-synonyms.md`). |
| `knn_vector`의 **dimension/space_type/method/engine** | 벡터 그래프 구조 immutable. |
| **필드 삭제·이름 변경(rename)** | 매핑에서 제거 불가. rename = 새 필드 + reindex(또는 copy). |
| `index`/`doc_values` 토글 등 색인 구조 영향 | 기존 문서에 소급 적용 불가. |

## 핵심 주의
- **multi-field 추가는 "additive"지만 소급되지 않는다** — 신규 문서에만 적용. 기존 문서까지 새 sub-field로
  검색하려면 결국 reindex가 필요하다. "필드를 추가했으니 안전"이 곧 "전체 데이터에 반영"은 아니다.

## 인용 시
"OpenSearch field-types/update-mapping 기준 타입 변경은 immutable → reindex 단위" 식으로 근거를 단다.

## 문서 미확인 (재확인 필요)
- 버전별 update-mapping 허용 파라미터 전체 목록, `ignore_above` 소급 동작.
