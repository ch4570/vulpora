---
title: 관계, Cardinality와 Key 설계
source: An Introduction to Database Systems, 8th ed. (C. J. Date), Parts II-III
last_fetched: 2026-08-11
consumers: [data-modeling-reviewer]
owner: data-modeling-reviewer
source_type: book
sources:
  - uri: An Introduction to Database Systems (C. J. Date)
    version: 8th edition
    locator: Parts II-III / Keys, Integrity, Further Normalization
  - uri: Database System Concepts (Silberschatz, Korth, Sudarshan)
    version: 7th edition
    locator: Ch.6 Database Design Using the E-R Model
last_verified: 2026-08-11
verified_by: Vulpora maintainers
review_after: 2026-11-11
status: verified
evals: [data-modeling-reviewer.order-integrity-review.v1]
revalidate_on: [new-edition, eval-failure, integrity-incident]
---

# 관계, Cardinality와 Key 설계

## 리뷰 훅

- [ ] entity의 identity가 무엇이며 수명 동안 유지되는지 시나리오로 확인했는가.
- [ ] candidate/natural key와 선택한 primary/surrogate key를 구분했는가.
- [ ] surrogate key가 business uniqueness를 가리지 않는가.
- [ ] 관계의 양쪽에서 최소/최대 cardinality와 optionality를 문장으로 표현했는가.
- [ ] N:M 관계에 관계 자체의 속성/identity/history가 있으면 association entity를 검토했는가.
- [ ] FK/ORM annotation에서 추론한 관계를 business rule로 오인하지 않았는가.

## Identity와 key

- **superkey**는 row/tuple을 유일하게 식별하는 attribute 집합이다.
- **candidate key**는 불필요한 attribute가 없는 최소 superkey다.
- **primary key**는 candidate key 중 물리적으로 대표 선택한 key다.
- **surrogate key**는 business 의미와 독립적으로 발급한 identifier다.

surrogate key는 안정된 참조와 작은 FK를 제공하지만 email, external reference, `(owner, name)` 같은 business
uniqueness를 제거하지 않는다. business duplicate가 금지라면 별도의 invariant/enforcement가 필요하다. natural key는
의미가 변하거나 개인정보인 경우 참조 key로 부적합할 수 있으므로 lifetime과 변경 정책을 확인한다.

## Cardinality 문장

`Customer 1:N Order`만으로는 부족하다. 다음처럼 양방향 최소/최대를 쓴다.

- 한 Order는 **정확히 한** Customer에 속한다.
- 한 Customer는 **0개 이상** Order를 가질 수 있다.

FK `NOT NULL`/`UNIQUE`는 physical enforcement의 증거지만, soft delete, temporal version, application validation과
실제 의미가 다를 수 있다. 반대로 ORM `@OneToOne`만 있고 unique constraint가 없으면 경쟁 쓰기까지 1:1을
보장한다고 단정할 수 없다.

## Association entity

N:M 연결에 가입일, 역할, 수량, 가격, 상태, history가 있으면 단순 join이 아니라 독자적인 관계 entity일 수 있다.
그 identity와 duplicate rule을 정의한다. 하지만 속성 없는 단순 연결에 억지 surrogate entity와 lifecycle을
추가하지 않는다.
