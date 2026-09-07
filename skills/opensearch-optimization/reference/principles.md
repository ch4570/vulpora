# OpenSearch 최적화 / 운영 리스크 핵심 원칙 (Principles)

> 인덱싱 처리량·검색 지연·메모리·벡터 튜닝과 운영 안전성을 진단할 때의 "헌법".
> **사실(기본값·공식 규칙·메모리 공식)은 `kb/`(공식 문서 distill)가 우선**하고, 이 문서는 그 위의
> 통찰·우선순위를 담는다. 충돌 시 **KB(공식 문서) > principles**.
>
> **출처(Sources)**
> - OpenSearch 공식 문서 — Tuning, Vector search(optimizing storage/performance) (docs.opensearch.org/latest)
>
> 도메인 예시는 특정 서비스에 묶이지 않는 **일반 검색 인덱스**로 든다.

---

## 0. 대전제: recall · latency · memory 삼각을 동시에 본다

벡터/검색 튜닝은 셋 중 하나만 보면 반드시 틀린다.
- recall@k 없이 latency만 낮추면 "빠르지만 틀린" 검색.
- memory 없이 recall만 올리면 OOM/eviction으로 운영이 무너진다.
- 모든 권고는 "recall@k ≥ 목표 유지하며 latency/memory를 X% 개선" 형태로 정량화.
- **측정 → 가설 → 조정 → 재측정** 루프. recall@k와 p99를 함께 보지 않는 튜닝은 거부.

---

## 1. 스케일이 모든 권고의 전제다

N · QPS · p99 SLO · RAM/heap · 벡터 dimension 없이 한 파라미터 추천은 일반론이다.
코드/문서에서 못 찾으면 **묻거나 가정을 명시**하고 권고한다.

---

## 2. 인덱싱 튜닝은 "복원 경로"와 한 쌍이다

- 대량 적재 시 `refresh_interval:-1`·`replicas:0`로 처리량을 올릴 수 있으나, **적재 후 복원
  코드 경로가 실제로 있는지** 확인한다. `replicas:0` 구간의 노드 장애는 데이터 유실.
- force merge(`max_num_segments=1`)는 **쓰기 종료 후에만**. 쓰기 지속 인덱스엔 금물.

---

## 3. ANN 정확도는 파라미터로 산다 (재색인 비용 의식)

- `ef_search`는 검색측 1순위 노브(↑recall·↑latency, **재색인 불필요**). **반드시 `ef_search ≥ k`**.
  `k`가 가변이면 `ef_search`도 동반 가변(통상 k의 1.5~2배). `ef_search == k`는 recall headroom 0.
- `m`/`ef_construction`은 빌드측(재색인 필요). IVF는 학습 필요 + `nprobes`로 검색측 조절.

---

## 4. 메모리는 heap이 전부가 아니다 (k-NN 운영 1번 함정)

- k-NN 그래프는 **JVM heap이 아닌 off-heap(native)** 에 상주 → **heap 증설로 k-NN OOM은 안 풀린다.**
- `knn.memory.circuit_breaker.limit`(기본 50%)로 관리. 실측 N → 메모리 추정식 → breaker 여유를
  **수치로** 계산. heap은 RAM 50%, 나머지는 OS 캐시 + native에 남긴다.
- 메모리 절감은 **SQ(fp16) first** → 초대용량만 PQ/BQ/on_disk.

---

## 5. 설정은 코드로 검증한다 (정적 단정 금지)

- **기본값 / 런타임 yml / 테스트 기대값 3중 대조** — 위험한 코드 기본값을 yml이 가린 경우.
- **진단·임시 설정의 운영 잔존**(timeout·상한)을 의심.
- **결함값을 고정한 테스트**는 회귀 탐지를 무력화 → 결함과 함께 수정 대상.
- **가변-고정 파라미터 짝 불일치**(`k` 가변 ↔ `ef_search` 고정) → 상한 검증.
- `replicas:0`/`refresh:-1`은 매핑이 아니라 **토글·복원 코드 경로**로 판별.

---

## 6. 샤드는 적정 크기로 (오버/언더 샤딩 모두 비용)

- 오버샤딩 → 클러스터 상태·힙 과소비. 언더샤딩 → 분산 불균형·복구 지연.
- 시계열 인덱스는 단일 비대 인덱스 대신 **ISM rollover/retention**로 관리.

---

## 7. 파괴적 변경은 무중단 전략을 먼저 댄다

- 매핑 타입 변경·reindex·force merge·모델 교체는 리스크·무중단 전략(alias/blue-green)을
  **먼저 명시**한 뒤 권한다. `_vN` 네이밍만으론 무중단이 아니다.

---

## 8. 심각도 캘리브레이션

| 심각도 | 의미 | 조치 |
|---|---|---|
| **CRITICAL** | recall 붕괴·데이터 유실·운영 장애·OOM | 차단, 즉시 수정 |
| **HIGH** | under-fetch·ef_search<k·복원 경로 부재·force merge 오용 | 머지 전 수정 |
| **MEDIUM** | 비효율 캐시·샤드 사이징·튜닝 여지 | 가능하면 수정 |
| **LOW** | 스타일·관습 | 선택 |

검증 안 된 가정(스케일·접근패턴 미확인)에 의존하는 지적은 측정/`_knn/stats` 확인 전까지
**MEDIUM 상한**. 올바른 부분은 **"확인된 정합"** 으로 명시한다.
