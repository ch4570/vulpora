---
title: 테이블 명세 Markdown 포맷 (하우스 규약)
source: Vulpora 산출물 규약 (내부 규약, STANDARD.md) — 외부 표준 아님
last_fetched: 2026-06-24
consumers: [schema-cartographer]
---

# KB: 테이블 명세 Markdown 포맷 (하우스 규약)

> 이 포맷은 **내부 산출물 규약**이다(외부 표준 아님). 이 에이전트가 ERD와 함께 내보내는
> 테이블 명세의 하우스 포맷을 고정한다. 결정론을 위해 컬럼/순서/머리글을 그대로 따른다.

## 리뷰 훅 (이걸 점검하라)
- [ ] 테이블 명세가 **스키마당 파일 하나**(`docs/schema/tables/<schema>.md`)로 분리됐고, 한 파일에 다른 스키마 테이블이 섞이지 않았는가.
- [ ] `tables/_index.md`가 존재하고 모든 스키마 파일을 사전순으로 링크하며 테이블 수가 맞는가(레거시 단일 `tables.md`를 남기지 않았는가).
- [ ] 테이블마다 `## <TABLE_NAME> (<한글 설명>)` 섹션 헤더가 있는가.
- [ ] 섹션 첫 줄에 **스키마 · PK · 출처(어느 V 파일)** 메타를 달았는가.
- [ ] 컬럼 표 머리글이 정확히 `컬럼 | 타입 | NULL | 기본값 | 키 | 설명` 인가.
- [ ] 타입은 마이그레이션 기준 **정확 타입**(`varchar(50)`, `numeric(15,2)`)인가.
- [ ] NULL 컬럼은 `Y`/`N`로, 기본값 없으면 `—`로 표기했는가.
- [ ] **인덱스 / 제약 / 관계** 목록을 섹션 하단에 적었는가(없으면 "없음"으로 명시).
- [ ] 드리프트가 있으면 `⚠️ 드리프트` 줄로 양쪽 값을 병기했는가.
- [ ] 컬럼 순서를 **마이그레이션 정의 순서**로 유지했는가(결정론).

## 섹션 구조

```markdown
## ORDER (주문)
> 스키마: `order` · PK: `order_id` · 출처: V20260101.000000__order__create_table_order.sql

| 컬럼 | 타입 | NULL | 기본값 | 키 | 설명 |
|------|------|------|--------|----|------|
| order_id     | bigint        | N | —         | PK            | 주문 식별자 |
| member_id    | bigint        | N | —         | FK→MEMBER.member_id | 주문 회원 |
| status       | varchar(50)   | N | 'PENDING' | —             | 주문 상태 |
| total_amount | numeric(15,2) | N | 0         | —             | 총 금액 |
| created_at   | timestamptz   | N | now()     | —             | 생성 시각 |

**인덱스**
- `ix_order_member_id (member_id)`
- `ix_order_status (status)` — 부분: `WHERE deleted = false`

**제약**
- PK: `pk_order (order_id)`
- FK: `fk_order_member (member_id) → MEMBER(member_id)`
- CHECK: `chk_order_total (total_amount >= 0)`

**관계**
- MEMBER **1 — N** ORDER (`member_id`, NOT NULL → 필수)

> ⚠️ 드리프트: 엔티티 `Order.amount`는 `numeric`, 마이그레이션은 `numeric(15,2)`. 물리=마이그레이션 채택.
```

## 컬럼 표 규약
| 열 | 채우는 법 |
|----|-----------|
| 컬럼 | DB 컬럼명(snake_case, 마이그레이션 기준) |
| 타입 | 마이그레이션 기준 정확 타입(길이·정밀도 포함) |
| NULL | `Y`(nullable) / `N`(NOT NULL) |
| 기본값 | `DEFAULT` 값. 없으면 `—` |
| 키 | `PK` / `UK` / `FK→<TABLE>.<col>` (복수면 콤마). 없으면 `—` |
| 설명 | 코드 주석·`COMMENT ON`·필드 의미. 추정이면 "(추정)" |

## 산출 파일 구조 (스키마별 분리)
테이블 명세는 **스키마당 파일 하나**로 나눠 쓴다. 단일 파일에 전 스키마를 몰지 않는다.

```text
docs/schema/
├── erd.md              # 전체 ERD (Mermaid erDiagram, KB: mermaid-erdiagram-syntax) — 단일 유지
└── tables/
    ├── _index.md       # 스키마 인덱스(스키마 → 테이블 수·링크) + 전역 드리프트 요약
    └── <schema>.md     # 스키마별 1파일: 위 섹션 구조를 테이블명 사전순으로 나열
```

각 `tables/<schema>.md` 내부 구조:
1. 머리말: 스키마명·생성 출처(마이그레이션 + 엔티티, 정적).
2. **테이블 명세**: 그 스키마 테이블의 위 섹션을 **테이블명 사전순**으로 나열.
3. **부록 — 미해결/주의(해당 스키마 한정)**: 드리프트 목록, 모호한 카디널리티, 매핑 불가, 마스킹한 시드, R(뷰/함수) 등.

- **ERD는 `erd.md` 단일**: 관계가 스키마 경계를 넘으므로 쪼개지 않는다.
- 단일 스키마여도 `tables/public.md`처럼 디렉터리 형태를 유지한다(결정론·확장성).
- 정렬: 스키마 파일/인덱스는 스키마명 사전순, 파일 내 테이블은 이름 사전순(diff 안정성).

## 금기
- 실제 데이터 값(PII·비밀)을 "설명"이나 예시에 전사하지 않는다 — 마스킹(principles §5).
- 스키마를 평가·비판하지 않는다 — 사실만 기술(principles §7).

## 인용 시
"하우스 명세 포맷(table-spec-format) 기준, FK는 키 열에 `FK→TABLE.col`로 표기" 식으로 근거를 단다.
