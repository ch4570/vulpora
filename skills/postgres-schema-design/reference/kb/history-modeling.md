---
title: 이력 모델링 (History / Temporal)
source: https://www.postgresql.org/docs/current/rangetypes.html
last_fetched: 2026-06-24
skills: [postgres-schema-design]
---

# 이력 모델링 (History / Temporal)

> 출처: PostgreSQL `Range Types`·`Constraints`(EXCLUDE, 공식) + 『핵심 데이터 모델링』 5장(통찰 보강).

## 1. 이력 유형 선택

| 유형 | 의미 | 저장 | 조회 |
|------|------|------|------|
| **점(Point) 이력** | 변경이 일어난 "시점"만 기록 | `changed_at` 한 컬럼 | "그 시점 이후/이전" 계산 필요 |
| **선분(Interval) 이력** | "유효 기간"을 기록 | `valid_from`, `valid_to`(또는 range) | "특정 시점에 유효한 행" 조회가 쉬움 |

- **조회 패턴이 "특정 시점 상태"를 자주 묻는다 → 선분 이력**이 유리(점 이력은 매번 다음 행을
  찾아 기간을 계산해야 함 = 책의 "점 이력을 선분 이력으로" 개선 주제).

## 2. 선분 이력 표준 설계 (PostgreSQL)

핵심 무결성은 **같은 키의 기간이 겹치지 않을 것**. PG는 EXCLUDE로 DB에서 보장한다.

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE price_history (
  product_id bigint    NOT NULL REFERENCES products(id),
  price      numeric(15,2) NOT NULL CHECK (price >= 0),
  valid      daterange NOT NULL,                     -- [시작, 종료)
  PRIMARY KEY (product_id, valid),
  EXCLUDE USING gist (product_id WITH =, valid WITH &&)   -- 기간 중첩 금지
);

-- 특정 일자에 유효한 가격
SELECT price FROM price_history
WHERE product_id = $1 AND valid @> $2::date;
```

- `daterange`/`tstzrange`의 `&&`(중첩), `@>`(포함) 연산자 + GiST 인덱스로 빠른 시점 조회.
- 별도 컬럼(`valid_from`, `valid_to`)을 쓸 거면 `CHECK (valid_from < valid_to)`를 반드시 건다.
  '종료 미정'은 `valid_to = 'infinity'` 또는 NULL 규칙을 정하고 일관 적용.

## 3. 변경 감사(Audit) — 누가/언제 바꿨나

```sql
-- 모든 테이블 공통 감사 컬럼
created_at timestamptz NOT NULL DEFAULT now(),
created_by bigint,
updated_at timestamptz NOT NULL DEFAULT now(),
updated_by bigint
-- updated_at 자동 갱신은 BEFORE UPDATE 트리거 또는 애플리케이션에서 일관 처리
```

- 전체 변경 로그가 필요하면 **별도 audit 테이블 + 트리거**(행 단위 before/after 저장),
  또는 논리적 복제/`pgaudit` 확장. 대량이면 파티셔닝.

## 4. 소프트 삭제 (논리 삭제)

```sql
deleted_at timestamptz   -- NULL = 살아있음
-- 살아있는 행만 유일성
CREATE UNIQUE INDEX ON users (email) WHERE deleted_at IS NULL;
-- 살아있는 행만 빠른 조회
CREATE INDEX ON orders (customer_id) WHERE deleted_at IS NULL;
```

- 소프트 삭제는 FK `ON DELETE`와 충돌할 수 있으니 정책을 일관되게(전부 소프트 or 전부 하드).

## 5. 대용량 이력 = 파티셔닝

```sql
CREATE TABLE event_log (
  id bigint GENERATED ALWAYS AS IDENTITY,
  occurred_at timestamptz NOT NULL,
  ...
) PARTITION BY RANGE (occurred_at);

CREATE TABLE event_log_2026_06 PARTITION OF event_log
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
```

- 오래된 이력은 **대량 DELETE 대신 `DETACH`/`DROP` 파티션**으로 정리 → dead tuple/bloat 회피.
- 파티션 키는 조회 WHERE에 자주 쓰는 시간 컬럼(가지치기 pruning).

## 리뷰 훅

- [ ] 점/선분 이력 선택이 조회 패턴에 맞는가.
- [ ] 선분 이력의 **기간 중첩 금지**가 EXCLUDE(또는 동등 보장)로 강제되는가.
- [ ] '종료 미정' 표현(infinity/NULL)이 일관적인가.
- [ ] 대용량이면 파티셔닝 + 파티션 단위 정리 전략이 있는가.
- [ ] 감사 컬럼/로그가 요구사항을 충족하는가.
