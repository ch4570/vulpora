---
title: 관계 카디널리티 추론 (1:1 / 1:N / N:M · 선택성)
source: https://mermaid.js.org/syntax/entityRelationshipDiagram.html (표기) + 관계형 모델링 일반 이론 (방법 노트)
last_fetched: 2026-06-24
consumers: [schema-cartographer]
---

# KB: 관계 카디널리티 추론

> ⚠️ 방법 노트: 카디널리티/선택성은 **추론**이다(단일 공식 표준이 아님). 신호가 약하면 보수적으로
> 표기하고 "추정/가정"을 명시한다(principles §3·§4). 표기 토큰은 Mermaid ER 문법을 따른다.

## 리뷰 훅 (이걸 점검하라)
- [ ] FK 컬럼이 있는 쪽을 **N(다)측**, 참조되는 쪽을 **1(일)측**으로 잡았는가.
- [ ] FK 컬럼에 **UNIQUE/PK**가 걸려 있으면 **1:1**로 좁혔는가.
- [ ] **조인 테이블**(FK 2개 + 복합 PK, 다른 비키 컬럼 거의 없음)을 **N:M**으로 인식했는가.
- [ ] FK가 **nullable**이면 해당 측을 **선택적(0..1 / o)**으로 표기했는가.
- [ ] 자기참조 FK(같은 테이블 참조)를 트리/계층 관계로 표기했는가.
- [ ] 코드 관계 어노테이션과 물리(제약)가 충돌하면 **물리 우선**으로 정했는가.
- [ ] 추론 근거(어느 컬럼·제약)를 관계 줄/명세에 남겼는가.

## 추론 규칙

### 1) 방향 (누가 N측인가)
- **FK 컬럼을 가진 테이블이 N(다)측.** 그 FK가 가리키는 테이블이 1(일)측.
  - 예: `ORDER.member_id → MEMBER.member_id` ⇒ MEMBER **1** — ORDER **N**.

### 2) 1:1 vs 1:N
- FK 컬럼에 **UNIQUE 제약** 또는 그 FK가 **PK와 동일**(공유 PK) ⇒ **1:1**.
  - 예: `PROFILE.member_id`가 PK이자 FK ⇒ MEMBER **1** — PROFILE **1(0..1)**.
- UNIQUE가 없으면 기본 **1:N**.

### 3) N:M (조인/연결 테이블)
- 테이블이 사실상 **FK 2개 + 그 둘의 복합 PK**로 구성(추가 속성은 거의 없거나 관계 속성뿐) ⇒ **N:M 연결 테이블**.
  - 예: `ARTICLE_TAG(article_id FK, tag_id FK, PK(article_id, tag_id))` ⇒ ARTICLE **N** — TAG **M**.
- ERD에선 연결 테이블을 (a) 두 1:N 관계로 펼치거나 (b) `}o--o{`로 직접 N:M 표기. 하우스 기본은 **연결 테이블을 엔티티로 펼쳐** 두 1:N로 표기(컬럼·제약을 명세에 남길 수 있어 충실).

### 4) 선택성 (필수 vs 선택)
- **FK 컬럼이 NOT NULL** ⇒ N측이 1측을 **항상 참조(필수, `||`)**.
- **FK 컬럼이 nullable** ⇒ N측이 1측을 **참조 안 할 수 있음(선택, `o`)**.
  - 예: `ORDER.member_id NOT NULL` ⇒ `MEMBER ||--o{ ORDER`(주문은 항상 회원, 회원은 0..N 주문).
  - 예: `ORDER.coupon_id NULL` ⇒ `COUPON |o--o{ ORDER`(쿠폰 없을 수 있음).

### 5) 자기참조
- 같은 테이블을 가리키는 FK(예: `CATEGORY.parent_id → CATEGORY.category_id`) ⇒ 계층/트리.
  nullable parent ⇒ 루트 허용. 표기: `CATEGORY ||--o{ CATEGORY : "parent of"`.

## 코드 신호와의 정합
- `@ManyToOne` ↔ FK 보유측(N), `@OneToMany(mappedBy)` ↔ 역방향(1).
- `@OneToOne` ↔ 1:1 (보통 FK에 UNIQUE). `@ManyToMany`+`@JoinTable` ↔ N:M 조인 테이블.
- **충돌 시 물리(제약) 우선**(principles §2·§4). 코드 관계는 보강·드리프트 신호로만.

## Mermaid 토큰 매핑 (요약)
| 추론 결과 | 토큰 예 |
|-----------|---------|
| 1 — 0..N (필수 N측) | `A ||--o{ B` |
| 1 — 1..N | `A ||--|{ B` |
| 1 — 0..1 (1:1 선택) | `A ||--o| B` |
| 0..1 — 0..N (nullable FK) | `A |o--o{ B` |
| N — M | `A }o--o{ B` |

## 인용 시
"카디널리티 추론(FK nullable=선택, UNIQUE=1:1) 기준, `member_id` NOT NULL이므로 ORDER는 MEMBER 필수참조" 식으로 근거를 단다.
