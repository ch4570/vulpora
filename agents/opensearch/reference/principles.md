# OpenSearch 검색/벡터 핵심 원칙 (Principles)

> 30년+ NoSQL·검색엔진 연구자 관점에서 추출한 OpenSearch 운영·튜닝의 "헌법". 에이전트와 스킬이
> 판단 근거로 삼는다. **사실(기본값·지원 매트릭스·공식 규칙)은 `kb/`(공식 문서 distill)가 우선**하고,
> 이 문서는 그 위의 통찰·우선순위·trade-off 판단을 담는다. 대상: **OpenSearch 3.5.0**.
>
> **출처**: OpenSearch 공식 문서(docs.opensearch.org / documentation-website main) + 3.5.0 릴리스 노트.
> 상세 근거와 수치는 `kb/INDEX.md` 참조.

---

## 0. 대전제: recall · latency · memory 삼각을 동시에 본다

벡터 검색 튜닝은 셋 중 하나만 보면 반드시 틀린다.
- **recall@k 없이 latency만** 낮추면 "빠르지만 틀린" 검색이 된다.
- **memory 없이 recall만** 올리면 OOM/eviction으로 운영이 무너진다.
- 모든 권고는 "recall@k ≥ 목표 유지하며 latency/memory를 X% 개선" 형태로 정량화한다.
- **측정 → 가설 → 조정 → 재측정** 루프. recall@k와 p99를 함께 보지 않는 튜닝은 거부한다.

---

## 1. 스케일이 모든 권고의 전제다

데이터 규모(N) · QPS · latency SLO(p99) · 클러스터 RAM/heap · 벡터 dimension 없이 한 파라미터
추천은 일반론일 뿐이다. 코드/문서에서 못 찾으면 **묻거나, 가정을 명시**하고 권고한다.

---

## 2. 매핑은 사실상 immutable이다

필드 타입·`knn_vector`의 `dimension`/`space_type`/`method`/`engine`은 생성 후 변경 불가.
- 변경 = **새 인덱스 + reindex + alias 스왑**. 운영 영향 변경엔 항상 blue-green/무중단 전략을 동반한다.
- 임베딩 모델 업그레이드가 dimension/정규화를 바꾸면 기존 인덱스 재사용 불가 → 무중단 교체 경로
  (alias·reindex 자동화)가 **코드에 실제로 있는지** 확인한다(`_vN` 네이밍만으론 부족).

---

## 3. ANN은 근사다 — 정확도는 파라미터로 산다

- HNSW: `ef_search`가 검색측 핵심 노브(↑recall·↑latency, 재색인 불필요). **반드시 `ef_search ≥ k`**.
  `k`가 가변이면 `ef_search`도 동반 가변(통상 k의 1.5~2배). 두 값이 다른 설정 소스면 상한 불일치를 의심.
- `m`·`ef_construction`은 빌드측(재색인 필요). IVF는 학습 필요 + `nprobes`로 검색측 조절.
- 정규화 벡터면 `innerproduct`로 cosine을 대체해 더 빠르게(단위 일치 확인).

---

## 4. 필터는 context를 가린다

- 스코어 불필요한 정확 매칭은 **`bool.filter`/`must_not`**(스코어 스킵 + filter cache).
- 벡터+필터는 **efficient k-NN filtering**(faiss/lucene)으로 필터를 ANN 탐색에 푸시다운.
  selective 필터에서 post-filter는 **under-fetch**(k 미달) 위험 → over-fetch 배수 또는 exact fallback.

---

## 5. 메모리는 heap이 전부가 아니다 (k-NN 운영 1번 함정)

- k-NN 그래프는 **JVM heap이 아닌 off-heap(native)** 에 상주. **heap 증설로 k-NN OOM은 안 풀린다.**
- `knn.memory.circuit_breaker.limit`(기본 50%)로 관리. 실측 N → 메모리 추정식 → breaker 여유를
  **수치로** 계산한다. heap은 RAM 50%, 나머지는 OS 캐시 + native에 남긴다.

---

## 6. 한국어 검색은 분석기에서 갈린다

상품명·게시글 본문 등 한국어 전문검색은 **nori**(별도 플러그인) 없이는 품질이 붕괴한다.
`decompound_mode`·사용자 사전·`nori_part_of_speech`·동의어(다중어는 search-time `synonym_graph`)를
점검한다. 단, 코드베이스가 순수 벡터(nori 미사용)면 **"해당 없음(grep 0건)"** 으로 명시하고
없는 기능을 발견으로 만들지 않는다.

---

## 7. 설정은 코드로 검증한다 (정적 단정 금지)

- **기본값 / 런타임 yml / 테스트 기대값 3중 대조** — 위험한 코드 기본값을 yml이 가린 경우가 흔하다.
- **진단·임시 설정의 운영 잔존**(timeout 상향 등)을 의심한다.
- **결함값을 고정한 테스트**는 회귀 탐지를 무력화 → 결함과 함께 수정 대상.
- `replicas:0`/`refresh_interval:-1`은 매핑 JSON이 아니라 **토글·복원 코드 경로**로 운영/튜닝을 판별.

---

## 8. 심각도 캘리브레이션

| 심각도 | 의미 | 조치 |
|---|---|---|
| **CRITICAL** | recall 붕괴·데이터 유실·운영 장애·보안 | 차단, 즉시 수정 |
| **HIGH** | 명확한 성능/정합성 문제(under-fetch, 락 폭주) | 머지 전 수정 |
| **MEDIUM** | 유지보수성·확장성 | 가능하면 수정 |
| **LOW** | 스타일·관습 | 선택 |

검증 안 된 가정(스케일·접근패턴 미확인)에 의존하는 지적은 코드/측정 전까지 **MEDIUM 상한**.
CRITICAL은 recall 붕괴·데이터 유실·장애·보안에 한정한다. **올바른 부분은 "확인된 정합"으로 명시**한다.
