# OpenSearch 쿼리 검토 핵심 원칙 (Principles)

> 검색 쿼리(Query DSL·k-NN·하이브리드)를 검토할 때 판단 근거가 되는 "헌법". **사실(문법·기본값·
> 지원 매트릭스)은 `kb/`(공식 문서 distill)가 우선**하고, 이 문서는 그 위의 통찰·우선순위·
> trade-off 판단을 담는다. 충돌 시 **KB(공식 문서) > principles**.
>
> **출처(Sources)**
> - OpenSearch 공식 문서 — Query DSL, Vector search, Search pipelines (docs.opensearch.org/latest)
> - Lucene 스코어링(BM25) 일반 이론
>
> 도메인 예시는 특정 서비스에 묶이지 않는 **일반 검색 인덱스**(예: `Article`/`Product`/`Order`
> 같은 엔티티의 텍스트·벡터 필드)로 든다.

---

## 0. 대전제: 쿼리는 "무엇을 묻는가"부터 정의한다

튜닝 전에 **결과 집합·필터 셀렉티비티·호출 빈도·정렬/페이징 패턴**을 먼저 규정한다.
이 전제 없이 단일 절을 고치는 것은 추측이다. recall@k와 p99 latency는 항상 **함께** 본다.

---

## 1. filter context 우선 — 점수가 필요 없으면 스코어링하지 마라

- 정확 매칭(권한·테넌트·상태 플래그)은 `must`가 아니라 **`bool.filter`/`must_not`**.
  filter context는 **스코어 계산을 건너뛰고 node query cache에 적중**한다.
- `should`는 점수를 부여하므로 OR 조건이 결과 포함 자체를 좌우해야 할 때만,
  그리고 `minimum_should_match`를 명시한다.

---

## 2. 동적 빌더는 신뢰 경계다 — 화이트리스트로 막아라

- 사용자 입력으로 절을 조립하는 빌더는 **필드명 화이트리스트**·**`terms` 크기 상한**·
  **`script`/leading wildcard/`query_string` 회피**를 강제한다.
- 타입 기반 client가 native 절을 흉내 내려고 `terms`를 `bool.should` 다발로 푸는 패턴은
  성능·정확성 모두 손해 → native 절로 치환.

---

## 3. 깊은 페이징은 `from`+`size`로 하지 않는다

- `from`+`size`는 `index.max_result_window`(기본 10,000)에서 막히고, 깊어질수록 코디네이팅
  노드 메모리를 잡아먹는다 → **`search_after`(sort 필수)** 또는 **PIT + search_after**로.
- scroll은 구식(상태 유지·slice 제한). 실시간 커서 페이지네이션엔 PIT를 쓴다.

---

## 4. ANN은 근사다 — `k`와 `ef_search`의 관계가 정확도를 만든다

- k-NN 쿼리는 `k`/`max_distance`/`min_score` 중 **정확히 하나만** 지정한다.
- HNSW는 `ef_search ≥ k`가 **불변식**. `k`가 가변인데 `ef_search`가 전역 고정이면
  상한 불일치를 의심한다(통상 `ef_search`는 k의 1.5~2배).
- 점수 정렬·결과 수 기대치는 **엔진별로 다르다**(faiss/nmslib=샤드 통합, lucene=샤드당).

---

## 5. 벡터+필터는 efficient filtering으로 — post-filter는 under-fetch를 부른다

- 필터가 있으면 k-NN 절 **내부 `.filter`**(efficient k-NN filtering)로 ANN 탐색에 필터를
  푸시다운한다. 바깥 `bool.filter`로 감싸는 post-filter는 k개를 못 채우는 **under-fetch** 위험.
- selective 필터(모집단 작음)는 over-fetch 배수 또는 exact fallback으로 k 보장을 확인한다.

---

## 6. 하이브리드는 점수 스케일을 정규화해야 의미가 있다

- BM25와 벡터 점수는 스케일이 다르다. 단순 합산은 한쪽이 지배한다 →
  **normalization-processor**(min_max/l2/z_score) 또는 **RRF(score-ranker-processor)**.
- neural 검색은 **ingest model_id ↔ query model_id가 동일 모델**이어야 한다.
- 코드베이스에 hybrid/neural/semantic이 grep 0건이면 이 축은 **"해당 없음"** 으로 명시하고
  없는 기능을 억지 발견으로 만들지 않는다.

---

## 7. "빨라졌다"는 측정으로만 확정한다

- 모든 쿼리 변경은 **측정 → 가설 → 조정 → 재측정** 루프로 검증한다.
- recall@k 스윕(+brute-force ground truth) 없이 ANN 파라미터 변경을 승인하지 않는다.
- p99 latency와 recall@k를 함께 보지 않는 튜닝은 거부한다.

---

## 8. 심각도 캘리브레이션

| 심각도 | 의미 | 조치 |
|---|---|---|
| **CRITICAL** | recall 붕괴·결과 유실·주입(injection)·장애 | 차단, 즉시 수정 |
| **HIGH** | under-fetch·딥페이징 폭주·잘못된 model_id | 머지 전 수정 |
| **MEDIUM** | 불필요 스코어링·캐시 미적중 | 가능하면 수정 |
| **LOW** | 스타일·관습 | 선택 |

검증 안 된 가정(셀렉티비티·접근패턴 미확인)에 의존하는 지적은 측정 전까지 **MEDIUM 상한**.
올바른 부분은 **"확인된 정합"** 으로 명시한다.
