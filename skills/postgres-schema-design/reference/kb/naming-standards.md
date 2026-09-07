---
title: 명명 / 데이터 표준화 (Naming & Data Standards)
source: https://www.postgresql.org/docs/current/sql-syntax-lexical.html#SQL-SYNTAX-IDENTIFIERS
last_fetched: 2026-06-24
skills: [postgres-schema-design]
---

# 명명 / 데이터 표준화 (Naming & Data Standards)

> 출처: PostgreSQL `Lexical Structure — Identifiers and Key Words`(공식) + 『핵심 데이터 모델링』 3장(통찰 보강).

## 1. PostgreSQL 식별자 규칙 (반드시 알 것)

- **따옴표 없는 식별자는 자동으로 소문자**로 접힌다. `"CamelCase"`처럼 큰따옴표를 쓰면 대소문자가
  고정되지만, 이후 모든 참조에 따옴표가 강제된다 → **고통의 근원**.
- **결론: 전부 `snake_case` 소문자 + 따옴표 금지.** (Rails/Django/Spring 등과도 무난)
- 식별자 길이 한도는 기본 63바이트. 한글 컬럼명은 가능하나 도구/드라이버 호환성·가독성 때문에
  보통 영문 표준어로.

## 2. 명명 규칙 (권장 표준)

| 대상 | 규칙 | 예 |
|------|------|-----|
| 테이블 | 복수 또는 단수 일관, snake_case | `orders`, `order_items` |
| 컬럼 | snake_case, 의미 명확 | `created_at`, `total_amount` |
| PK | `id`(인조키) | `id` |
| FK | `<참조테이블단수>_id` | `customer_id`, `product_id` |
| 불리언 | `is_`/`has_`/`can_` 접두 | `is_active`, `has_paid` |
| 시각 | `_at`(timestamptz) / 날짜 `_date`(date) | `created_at`, `birth_date` |
| 금액 | `_amount`/`_price` (numeric) | `total_amount` |
| 인덱스 | `ix_<table>_<cols>` | `ix_orders_customer_id` |
| 유니크 | `uq_<table>_<cols>` | `uq_orders_order_no` |
| 제약(CHECK) | `ck_<table>_<rule>` | `ck_orders_amount_nonneg` |
| FK 제약 | `fk_<table>_<ref>` | `fk_orders_customer` |

- `명확성` 질적 특성: `주소1/주소2` 대신 `base_address/detail_address`, `addr` 대신 `address`.
  약어 남용 금지, 표준 용어집을 만들고 일관 적용.

## 3. 데이터 표준화 (책 3장)

- **표준 단어 / 표준 도메인 / 표준 용어**를 정의해 같은 의미는 같은 이름·타입을 쓴다.
  (예: "금액"은 어디서나 `numeric(15,2)`, "여부"는 `boolean`, "코드"는 `varchar(n)`/코드테이블)
- **도메인 타입**으로 표준을 코드화:
  ```sql
  CREATE DOMAIN amount_krw AS numeric(15,2) CHECK (VALUE >= 0);
  CREATE DOMAIN yn AS boolean;
  ```
- 코드값은 매직스트링 대신 **코드 테이블 + FK** 또는 `enum`. 의미를 한곳에서 관리.

## 4. 컬럼 순서/구성 관습

- PK → 자연키/FK → 핵심 업무 속성 → 상태/플래그 → 금액/수량 → 감사 컬럼(`created_at`...) 순으로
  배치하면 가독성이 좋다(가독성 질적 특성).
- 비슷한 특성(예: 신체정보, 주소정보)은 서로 가까이.

## 5. 안티패턴

- `data`, `value`, `info`, `type1`, `flag` 같은 **의미 없는 이름**.
- 같은 개념을 테이블마다 다르게(`cust_id` / `customer_id` / `cstmr_no`) — 표준 위반.
- 큰따옴표로 대소문자 섞기.
- 한 컬럼에 여러 의미(다목적 컬럼) — 1차 정규화/명확성 위반.

## 리뷰 훅

- [ ] 식별자가 전부 `snake_case` 소문자이고 큰따옴표 대소문자 혼용이 없는가.
- [ ] 명명 규칙(테이블/컬럼/PK/FK/불리언/`_at`·`_date`/인덱스·제약 접두)을 일관 적용했는가.
- [ ] 같은 개념을 테이블마다 다르게 부르지 않는가(표준 단어/도메인/용어 일관).
- [ ] 표준 도메인 타입(금액·여부·코드 등)으로 같은 의미에 같은 타입을 강제했는가.
- [ ] `data`/`value`/`info`/`flag` 같은 의미 없는 이름·다목적 컬럼이 없는가.
- [ ] 컬럼 순서(PK→FK→업무속성→상태→금액/수량→감사)가 가독성 있게 배치됐는가.
