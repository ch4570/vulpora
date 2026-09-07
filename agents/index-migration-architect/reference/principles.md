# 인덱스 마이그레이션 핵심 원칙 (Principles)

> 무중단 마이그레이션·SRE 관점에서 추출한 OpenSearch/Elasticsearch 인덱스 변경의 "헌법".
> 에이전트와 스킬이 판단 근거로 삼는다. **사실(어떤 변경이 update-mapping 허용인지, reindex/alias
> API 동작)은 `kb/`(공식 문서 distill)가 우선**하고, 이 문서는 그 위의 통찰·우선순위·trade-off를 담는다.
> 대상: **OpenSearch 3.5 / Elasticsearch 호환 reindex·alias API**.
>
> **출처(Sources)**:
> - OpenSearch 공식 문서 — Reindex, Index aliases, Mappings/Update mapping (docs.opensearch.org).
> - Elasticsearch 공식 문서 — Reindex API, Aliases, Update mapping API (elastic.co).
> - 상세 근거·세부 규칙은 `kb/INDEX.md` 참조.

---

## 1. 매핑은 사실상 immutable이다

필드 타입, `knn_vector`의 `dimension`/`space_type`/`method`/`engine`, 분석기/토크나이저는 생성 후
변경 불가다. "그냥 매핑을 바꾼다"는 선택지는 없다 — **변경 = 새 인덱스 + reindex + alias 스왑**.
update-mapping으로 가능한 것은 제한적인 additive 항목뿐이며, 그 경계는 `kb/`로 확인한다.

---

## 2. alias 간접화는 항상 켜져 있어야 한다

애플리케이션은 **물리 인덱스명이 아니라 alias**(읽기/쓰기)로만 접근한다. alias가 없으면 무중단
전환의 핵심 도구(atomic flip·즉시 롤백)를 쓸 수 없다. alias 부재 자체가 첫 번째 마이그레이션
선행 과제다. flip은 `_aliases` actions로 remove old + add new를 **하나의 원자적 호출**로 한다.

---

## 3. reindex가 변경의 단위다

immutable 항목을 바꾸려면 새 인덱스로 데이터를 복사(reindex)하는 수밖에 없다.
- reindex는 대용량에서 **throttle**(`requests_per_second`)·**slices**로 부하를 제어하고, `wait_for_completion=false`로 task 추적한다.
- reindex 중 들어온 신규 쓰기(**delta**)는 dual-write 또는 전환 후 `range` 기반 catch-up reindex로 정합을 맞춘다.

---

## 4. additive가 아니면 모두 reindex다 (보수적 분류)

변경을 분류할 때 의심스러우면 **reindex 쪽**으로 본다. additive로 단정하려면 update-mapping이
공식적으로 허용하는 항목임을 **실제 매핑 diff와 KB로 확인**해야 한다. "safe하다"는 변경 설명의
자기-확언은 근거가 아니다.

---

## 5. verify 전엔 flip하지 않는다

새 인덱스로 트래픽을 옮기기 전에 검증을 통과해야 한다.
- **doc count 대조**(`_count` old vs new), 핵심 쿼리 결과·**recall** 비교, 분석기 변경이면 `_analyze` 토큰 비교.
- 검증은 alias가 아직 구 인덱스를 가리키는 상태에서, 신 인덱스에 직접 질의해 수행한다.

---

## 6. 항상 롤백이 있어야 한다

전환은 되돌릴 수 있어야 한다.
- alias 역방향 flip으로 즉시 롤백 → 그래서 **구 인덱스는 drop 전까지 보존**한다(관찰 기간).
- 롤백 시 delta 쓰기가 신 인덱스에만 들어갔다면 구 인덱스로 catch-up 해야 정합이 깨지지 않는다.
- `force_merge`·구 인덱스 `DELETE`는 **되돌릴 수 없으므로** 검증·관찰 이후로 미룬다.

---

## 7. "보장" 단정 금지

"무중단 보장"·"데이터 손실 없음 보장"은 단정하지 않는다. 무중단·무손실은 **전제(alias 간접화·
delta 정합·verify 통과·구 인덱스 보존)가 충족될 때 가능**한 결과일 뿐이다. 항상 조건부로 기술한다.

---

## 8. 운영 클러스터에 직접 쓰지 않는다

매핑 diff·reindex 계획·alias 전략은 설계하되, `_reindex`·`PUT _aliases`·`DELETE`·`force_merge`는
**사용자가 실행할 명령**으로만 제시한다. 에이전트가 직접 실행하는 것은 읽기전용 진단뿐이다.
