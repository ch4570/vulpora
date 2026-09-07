# Index Migration Knowledge Base — 색인 (INDEX)

> OpenSearch/Elasticsearch **공식 문서**(Reindex · Index aliases · Update mapping)를 distill한
> 인용 가능한 KB. 각 파일 frontmatter에 `source`·`last_fetched`·`skills`.
> **리뷰 시 사용법**: 작업 유형에 맞는 KB를 먼저 읽고 "리뷰 훅"으로 점검하며, 지적/설계 시 KB의
> `source` URL을 근거로 인용한다.

## 작업 유형 → 읽을 KB

### 무중단 재색인 + alias 설계
| KB | 다룸 |
|----|------|
| [zero-downtime-reindex-alias](zero-downtime-reindex-alias.md) | 새 인덱스→reindex→verify→atomic alias flip→drop old, 읽기/쓰기 alias, 롤백 |
| [reindex-throttle-and-verify](reindex-throttle-and-verify.md) | _reindex 옵션(throttle/slices/task), delta/catch-up, doc count·recall 검증 |

### 매핑 변경 분류
| KB | 다룸 |
|----|------|
| [mapping-change-classification](mapping-change-classification.md) | additive(update-mapping 허용) vs reindex 필요(immutable) 분류 |

### 분석기/토크나이저 변경
| KB | 다룸 |
|----|------|
| [analyzer-migration-nori-synonyms](analyzer-migration-nori-synonyms.md) | nori 분석기·동의어/오타 변경이 reindex 단위인 이유, search-time synonym 무중단 갱신 |

## 원칙 문서와의 관계
- 상위 원칙·trade-off 판단은 `../principles.md`(헌법). KB는 그 원칙의 **공식 문서 근거·세부 규칙**.
- 충돌 시 **KB(공식 문서)가 우선**. principles는 통찰을 보탠다.

## 갱신
- 각 파일 `last_fetched` 기준. OpenSearch/Elasticsearch 메이저 업글 시 `source`를 재fetch.
- "문서 미확인" 항목(각 KB 하단)은 인용 전 재확인 필요.

## TODO (차기 KB 후보)
- blue-green 인덱스 + ISM 롤오버 연동, dual-write 패턴 상세.
