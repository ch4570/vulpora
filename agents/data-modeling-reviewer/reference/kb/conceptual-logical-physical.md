---
title: Conceptual, Logical, Physical 데이터 모델 구분
source: Database System Concepts, 7th ed. (Silberschatz, Korth, Sudarshan), Ch.2-7
last_fetched: 2026-08-11
consumers: [data-modeling-reviewer]
owner: data-modeling-reviewer
source_type: book
sources:
  - uri: Database System Concepts, 7th ed. (Silberschatz, Korth, Sudarshan)
    version: 7th edition
    locator: Ch.2 Introduction to the Relational Model / Ch.6 Database Design Using the E-R Model / Ch.7 Relational Database Design
  - uri: Domain-Driven Design (Eric Evans)
    version: 1st edition
    locator: Part II The Building Blocks of a Model-Driven Design / Part IV Strategic Design
last_verified: 2026-08-11
verified_by: Vulpora maintainers
review_after: 2026-11-11
status: verified
evals: [data-modeling-reviewer.order-integrity-review.v1, data-modeling-reviewer.avoid-modeling-overkill.v1]
revalidate_on: [new-edition, eval-failure, modeling-regression]
---

# Conceptual, Logical, Physical 데이터 모델 구분

## 리뷰 훅

- [ ] actor/event/business rule에서 conceptual entity와 language를 먼저 복원했는가.
- [ ] 화면, API payload, ORM class 또는 table 하나를 conceptual entity 하나로 자동 대응하지 않았는가.
- [ ] logical model에 entity, attribute, relationship, key, cardinality, invariant가 DB syntax 없이 표현되는가.
- [ ] physical model의 table/document, type, nullability, constraint, index를 별도로 기록했는가.
- [ ] conceptual rule → logical constraint → physical enforcement의 traceability와 drift가 보이는가.
- [ ] source가 부족한 관계/속성을 발명하지 않고 질문으로 남겼는가.

## 단계별 질문

| 단계 | 핵심 질문 | 대표 산출물 | 대표 오류 |
|---|---|---|---|
| Conceptual | 어떤 business fact와 용어가 존재하는가 | 용어·entity·event·rule 지도 | 현재 table을 그대로 business reality로 간주 |
| Logical | identity, attribute, relationship, constraint가 무엇인가 | DB 독립 ER/model specification | cardinality/uniqueness/optionality 누락 |
| Physical | 선택한 저장소에서 어떻게 표현·강제하는가 | schema, type, key/constraint/index/mapping | index를 business rule처럼 취급 |

conceptual model은 모든 구현 세부를 제거한 추상화가 아니라 이해관계자와 공유할 의미 모델이다. logical model은
관계형만을 뜻하지 않으며 선택한 logical data model 안에서 구조와 제약을 명확히 한다. physical model은 특정
DB/버전의 capability와 access pattern을 반영한다.

## Traceability

리뷰는 최소 다음 연결을 만든다.

`scenario sentence → business term/rule → logical entity/relationship/key → physical field/constraint/code → verification`

연결이 없다고 모두 결함은 아니다. 예를 들어 UI 표시명은 저장하지 않을 수 있다. 그러나 필수 uniqueness나
history가 어느 단계에서도 enforcement되지 않으면 데이터 결함으로 이어질 수 있으므로 owner와 검증을 요구한다.

## 비례성

단일 owner의 ephemeral key-value 설정은 detailed ERD나 다수 entity가 필요하지 않을 수 있다. 복잡도는 entity
수보다 identity lifetime, 관계, 경쟁 쓰기, 규제/history와 변화 가능성으로 판단한다.
