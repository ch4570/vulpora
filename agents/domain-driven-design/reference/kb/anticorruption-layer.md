---
title: Anticorruption Layer — 외부 모델로부터 Downstream Domain 보호
source: https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf
last_fetched: 2026-08-11
consumers: [domain-driven-design-reviewer]
owner: domain-driven-design-reviewer
source_type: official
sources:
  - uri: https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf
    version: 2015
    locator: Context Mapping for Strategic Design — Anticorruption Layer, pages 40-41
  - uri: Domain-Driven Design — Eric Evans
    version: 2004
    locator: Chapter 14 — Maintaining Model Integrity / Anticorruption Layer
last_verified: 2026-08-11
verified_by: vulpora-authoring
review_after: 2027-02-11
status: verified
evals: [domain-driven-design-reviewer.anticorruption-layer.v1]
revalidate_on: [source-change, integration-contract-change, eval-failure]
---

# Anticorruption Layer

## 리뷰 훅

### 적용 판단

- [ ] 실제로 서로 다른 Bounded Context와 모델이 있고 upstream/downstream 관계가 확인되는가.
- [ ] Downstream이 Upstream의 용어·타입·lifecycle·error semantics를 그대로 받아 모델이 변형되고 있는가.
- [ ] 통합 가치가 번역 비용보다 크며, Conformist나 단순 Adapter보다 독립 모델을 지킬 이유가 있는가.
- [ ] Shared Kernel·Customer/Supplier·Published Language 같은 더 적합한 Context Map 관계를 먼저 비교했는가.

### 경계와 번역

- [ ] Upstream DTO, SDK type, enum, identifier, exception이 ACL 밖의 Domain/Application API로 새는가.
- [ ] Facade가 Upstream의 넓고 불안정한 protocol surface를 필요한 기능으로 축소하는가.
- [ ] Adapter가 Downstream이 기대하는 interface에 맞추고 Translator가 두 모델의 의미를 명시적으로 변환하는가.
- [ ] 이름이 같은 field의 단순 복사가 아니라 단위·상태·identity·null/unknown·시간 의미까지 번역하는가.
- [ ] 양방향 통합이면 각 방향의 source of truth와 허용되는 information loss가 분리돼 있는가.

### 실패·운영·테스트

- [ ] unknown enum, 누락 field, 중복/out-of-order event, partial response, upstream version drift를 fail-safe하게 처리하는가.
- [ ] Upstream error/timeout이 Downstream의 domain failure vocabulary로 변환되고 raw error가 전파되지 않는가.
- [ ] Translator table test가 정상·경계·unknown·손실 변환을 검증하는가.
- [ ] 실제 Upstream sandbox/container 또는 contract fixture로 ACL의 protocol assumption을 검증하는 contract/integration test가 있는가.
- [ ] ACL 관측성에 upstream version, translation failure reason, correlation은 남기되 PII·secret·raw payload를 과다 기록하지 않는가.

## 적용 조건과 대안

Evans의 ACL은 Upstream을 수정하기 어렵고 그 모델에 Conform하면 Downstream model의 의도가 훼손되지만, 통합 자체는
필요할 때 쓰는 **방어적 translation layer**다. 단순히 외부 API를 호출한다는 이유만으로 ACL이 필요한 것은 아니다.

| 관계/해법 | 적합한 조건 | 주된 비용·위험 |
|---|---|---|
| Customer/Supplier | Upstream이 Downstream 요구를 계획에 반영하고 공동 acceptance test가 가능 | 조직 간 조정 비용 |
| Shared Kernel | 두 팀이 작고 명시적인 model subset을 공동 소유할 수 있음 | 강한 변경 결합과 동시 통합 필요 |
| Conformist | 번역 이익이 작고 Upstream model을 받아들이는 것이 경제적 | Downstream model 자율성 포기 |
| Adapter | protocol/type 차이만 있고 의미 모델은 사실상 동일 | 의미 차이를 과소평가할 위험 |
| Anticorruption Layer | 의미 모델이 다르고 Downstream autonomy를 보호해야 함 | 중복 모델·translation·운영 복잡성 |

ACL은 반드시 별도 service일 필요가 없다. 같은 process의 module/package boundary일 수 있다. 독립 배포는 latency,
failure mode, ownership이 실제로 분리될 때만 선택한다.

## 권장 책임 분해

- **Facade**: Upstream client의 넓은 API를 현재 use case에 필요한 최소 operation으로 제한한다.
- **Adapter**: Downstream-owned port/interface를 구현하고 호출·응답 흐름을 조정한다.
- **Translator**: Upstream representation과 Downstream model 사이의 의미 변환을 담당한다.
- **Identity mapping**: 서로 다른 identifier namespace와 lifecycle을 명시적으로 연결한다.

이 분해는 클래스 세 개를 반드시 만들라는 규칙이 아니다. 책임이 작으면 한 adapter 안의 명시적 함수로 충분하다.
중요한 불변식은 Upstream type과 vocabulary가 경계를 넘어 Downstream core의 public model이 되지 않는 것이다.

## 대표 안티패턴

- **Pass-through ACL**: 이름만 ACL이고 Upstream DTO를 그대로 반환한다.
- **Shared integration model**: 두 Context가 한 DTO/ORM Entity/enum package를 공동 domain model처럼 사용한다.
- **Generic mapper illusion**: field-name 기반 자동 mapper가 상태·단위·identity 차이를 숨긴다.
- **Leaky errors**: Upstream status code/SDK exception이 Downstream use case contract가 된다.
- **Bidirectional ambiguity**: 양쪽이 source of truth라고 가정해 update loop와 data loss가 발생한다.
- **Business logic dumping ground**: ACL이 Downstream invariant까지 소유해 새 결합 지점이 된다.
- **Premature service extraction**: local translation이면 충분한데 network hop과 별도 운영을 추가한다.

## 테스트 전략

1. Downstream scenario와 기대 domain outcome을 먼저 쓴다.
2. Translator를 table-driven test로 검증한다. unknown/누락/손실 변환을 반드시 포함한다.
3. Downstream invariant는 Domain test에서 ACL 구현과 무관하게 검증한다.
4. Upstream protocol은 실제 sandbox/container 또는 provider contract fixture로 검증한다. mock만으로 schema drift를 숨기지 않는다.
5. Consumer contract가 바뀌면 translator와 fixture가 함께 실패하도록 version을 고정한다.

## 심각도 캘리브레이션

- **HIGH**: 확인된 Upstream type 공유 때문에 Downstream invariant·public contract가 직접 오염되거나 정상 경로의 의미 변환이 틀림.
- **MEDIUM**: pass-through DTO, raw error, unknown enum 정책 부재처럼 변경 확산 가능성이 있으나 실제 결함은 미확인.
- **LOW**: 책임 명명·작은 translator 분리 제안.

ACL 부재 자체는 결함이 아니다. 서로 다른 모델과 보호할 Downstream autonomy가 코드·ownership 증거로 확인되지 않으면
적용 권고를 하지 않는다.

## 리뷰 인용 형식

`Evans DDD Reference — Anticorruption Layer 기준, <path:line>에서 Upstream의 <type/term>이 Downstream public model로
통과해 <구체 의미>를 강제한다. <Facade/Adapter/Translator 중 필요한 최소 책임>으로 번역하라.`처럼 적는다.
