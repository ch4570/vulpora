# OpenSearch 스키마/매핑 검토 핵심 원칙 (Principles)

> 인덱스 매핑·분석기·벡터 필드를 검토할 때 판단 근거가 되는 "헌법". **사실(파라미터·기본값·
> 지원 매트릭스)은 `kb/`(공식 문서 distill)가 우선**하고, 이 문서는 그 위의 통찰·우선순위를 담는다.
> 충돌 시 **KB(공식 문서) > principles**.
>
> **출처(Sources)**
> - OpenSearch 공식 문서 — Mappings, Field types, Analyzers, Vector search (docs.opensearch.org/latest)
>
> 도메인 예시는 특정 서비스에 묶이지 않는 **일반 검색 인덱스**(`Article`/`Product`/`Order`의
> 텍스트·keyword·벡터 필드)로 든다.

---

## 0. 대전제: 매핑은 사실상 immutable이다

- 기존 필드 타입, `knn_vector`의 `dimension`/`space_type`/`method`/`engine`은 생성 후 변경 불가.
- 변경 = **새 인덱스 + reindex + alias 스왑**(blue-green). 운영 영향 변경엔 항상 무중단 전략을 동반.
- 그래서 매핑 리뷰는 "지금 옳은가"가 아니라 **"바꾸기 어려운 결정을 옳게 했는가"** 를 본다.

---

## 1. 무엇을 색인하는 인덱스인지부터 규정한다

도메인·언어(한국어 포함?)·시계열성·규모(N)·검색 패턴(전문검색/정렬/집계/벡터)을 먼저 파악한다.
이 맥락 없이 필드 타입을 논하는 것은 일반론이다.

---

## 2. dynamic은 운영에서 통제한다 (매핑 폭발 방지)

- 운영 인덱스는 `dynamic`을 **`strict`(미정의 필드 거부)** 또는 **`false`(저장만, 색인 안 함)** 로.
- dynamic=true 방치는 임의 입력으로 필드 수가 폭증(매핑 폭발) → 클러스터 상태·힙 부담.
- 핵심 필드(특히 `dimension` 등)는 dynamic 추론에 맡기지 말고 **명시**한다.

---

## 3. 필드 타입은 검색 패턴이 정한다

- **전문검색** → `text`(analyzed). **정렬·집계·exact·필터** → `keyword`(doc_values).
- 하나의 입력이 둘 다 필요하면 **multi-field**(`text` + `keyword` 서브필드).
- 검색 불필요 대용량 필드는 `index:false`, 정렬·집계 안 쓰는 keyword는 `doc_values:false`로 비용↓.
- `text`에 `term`/정렬을 기대하지 않는다(fielddata 힙 폭주).

---

## 4. 벡터 필드는 모델·정규화와 정합해야 한다

- `dimension`은 임베딩 모델 출력과 **정확히 일치**. `space_type`은 정규화 여부와 정합
  (정규화 벡터면 `innerproduct`가 `cosinesimil`보다 빠름).
- `engine`은 `faiss`/`lucene`. **`nmslib`은 deprecated → 신규 설계 회피**.
- 큰 벡터를 `_source`에 중복 저장하면 저장 비용↑ → derived source 검토(제약 확인).

---

## 5. 한국어 검색은 분석기에서 갈린다

- 한국어 `text`는 **nori**(별도 설치) 없이는 품질이 붕괴한다. `decompound_mode`·사용자 사전·
  품사 필터·동의어(다중어는 search-time `synonym_graph`)를 점검한다.
- 코드베이스가 순수 벡터(nori grep 0건)면 이 축은 **"해당 없음"** 으로 명시(억지 발견 금지).

---

## 6. nested·flat_object는 비용을 의식하고 쓴다

- `nested`는 객체 단위 정확 매칭에 필요하지만 객체마다 별도 Lucene 문서 → 문서 수·쿼리 비용↑.
- `flat_object`는 매핑 폭발은 막지만 서브필드 검색·정렬·집계가 제한된다.
- 둘 다 "필요해서" 쓰는지, 기본 object로 충분한지 먼저 따진다.

---

## 7. 안전한 변경 (마이그레이션)

- 매핑 변경은 reindex가 기본 → **alias로 읽기 전환** 후 새 인덱스 reindex, 검증 후 스왑.
- `_vN` 네이밍만으로는 무중단이 아니다 — **alias·reindex 자동화 코드가 실제로 있는지** 확인.
- 임베딩 모델이 dimension/정규화를 바꾸면 기존 인덱스 재사용 불가 → 무중단 교체 경로 확인.

---

## 8. 심각도 캘리브레이션

| 심각도 | 의미 | 조치 |
|---|---|---|
| **CRITICAL** | dimension/space_type 불일치로 recall 붕괴·데이터 유실 | 차단, 즉시 수정 |
| **HIGH** | dynamic 방치·nmslib 신규 채택·무중단 경로 부재 | 머지 전 수정 |
| **MEDIUM** | 불필요 doc_values/index, nested 남용 | 가능하면 수정 |
| **LOW** | 네이밍·관습 | 선택 |

검증 안 된 가정에 의존하는 지적은 `_mapping`/`_analyze` 확인 전까지 **MEDIUM 상한**.
올바른 부분은 **"확인된 정합"** 으로 명시한다.
