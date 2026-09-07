---
title: 제약과 무결성 (Constraints & Integrity)
source: https://www.postgresql.org/docs/current/ddl-constraints.html
last_fetched: 2026-06-24
skills: [postgres-schema-design]
---

# 제약과 무결성 (Constraints & Integrity)

> 출처: PostgreSQL `Constraints`(DDL, 공식 문서) + 『핵심 데이터 모델링』 4장(통찰 보강).
> 핵심 원칙: **무결성은 DB에 건다. 애플리케이션만 믿지 않는다.**

## 1. 제약 종류 요약 (PG)

| 제약 | 기능 | 다중컬럼 | 자동 인덱스 | NULL 처리 |
|------|------|----------|------------|-----------|
| `NOT NULL` | NULL 거부 | X | X | NULL 거부 |
| `CHECK` | 불리언 검증(같은 행) | O | X | NULL이면 통과 |
| `UNIQUE` | 유일성 | O | O(B-tree) | 기본 NULL끼리 다름 |
| `PRIMARY KEY` | 행 식별자 | O | O | 암묵적 NOT NULL |
| `FOREIGN KEY` | 참조무결성 | O | **X(직접 생성 필요)** | 기본 NULL이면 통과 |
| `EXCLUDE` | 연산자 기반 충돌 방지 | O | O(GiST 등) | 상황별 |

## 2. 설계 규칙 (책 + PG 공식 종합)

1. **모든 테이블에 PK.** (관계이론·실무 공통)
2. **NOT NULL을 기본값으로.** NULL은 비교·집계·인덱스에서 특수 동작 → 무분별한 NULL은 버그원.
   잘 설계된 스키마는 대부분 컬럼이 NOT NULL.
3. **FK로 참조무결성을 건다.** `ON DELETE` 의미 매핑:
   - 구성요소(주문↔주문상품) → `CASCADE`
   - 독립 객체 보호 → `RESTRICT` / `NO ACTION`(기본, 지연가능)
   - 선택적 관계 → `SET NULL` / `SET DEFAULT`
4. **FK 컬럼엔 인덱스를 직접 만든다.** PG는 FK 컬럼을 자동 인덱싱하지 않는다 → 부모
   DELETE/UPDATE 시 자식 풀스캔 + 락 확대.
5. **자연키(업무 유일성)엔 UNIQUE.** 인조 PK가 있어도 업무키 중복을 막는다.
6. **도메인 규칙은 CHECK.** 단 CHECK는 **같은 행만** 참조 가능(교차행 X), 조건이 불변이라 가정.
   교차행 규칙은 UNIQUE/EXCLUDE/FK로.

## 3. NULL과 UNIQUE의 함정

- 기본 `UNIQUE`는 **NULL끼리 서로 다름** → NULL 값 다중 행 허용.
- "NULL은 하나만 허용"하려면 PG15+ **`UNIQUE NULLS NOT DISTINCT`**.
- 부분 유일성(부분집합에서만 유일)은 **부분 유니크 인덱스**:
  ```sql
  -- "활성 사용자 중에서만 email 유일"
  CREATE UNIQUE INDEX ON users (email) WHERE deleted_at IS NULL;
  ```

## 4. FK의 NULL/MATCH

```sql
-- 기본: 참조 컬럼 중 하나라도 NULL이면 제약 통과
product_no integer REFERENCES products

-- MATCH FULL: 전부 NULL이거나 전부 채워져야 함(부분 NULL 거부)
product_no integer REFERENCES products MATCH FULL

-- 필수 관계: NOT NULL 동반
product_no integer NOT NULL REFERENCES products
```

## 5. EXCLUDE — 교차행 무결성의 PostgreSQL 무기 (책엔 없는 강력 기능)

같은 자원의 **기간/구간 중첩 금지** 같은 규칙을 DB가 보장한다.

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE TABLE room_booking (
  room_id  bigint NOT NULL,
  period   tstzrange NOT NULL,
  EXCLUDE USING gist (room_id WITH =, period WITH &&)   -- 같은 방의 기간 겹침 금지
);
```

## 6. 생성 컬럼 / 도메인

```sql
-- 파생 컬럼은 저장 생성 컬럼으로 (정합성 자동 보장)
amount numeric NOT NULL,
tax    numeric GENERATED ALWAYS AS (round(amount * 0.1, 2)) STORED

-- 재사용 도메인 타입
CREATE DOMAIN email AS text CHECK (VALUE ~ '^[^@]+@[^@]+$');
```

## 7. 무결성 검증 쿼리 (설계 후 점검)

```sql
-- PK 없는 테이블 찾기
SELECT c.relname FROM pg_class c
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE c.relkind='r' AND n.nspname='public'
  AND NOT EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conrelid=c.oid AND k.contype='p');

-- 인덱스 없는 FK 찾기 (성능/락 위험)
SELECT conrelid::regclass AS table, conname
FROM pg_constraint c
WHERE contype='f'
  AND NOT EXISTS (
    SELECT 1 FROM pg_index i
    WHERE i.indrelid=c.conrelid AND (c.conkey <@ i.indkey::smallint[])
  );
```

> 제약을 운영 중에 **추가**할 때는 락 위험이 있다 → risk-check 스킬의 `NOT VALID` → `VALIDATE`
> 2단계 패턴을 따른다.

## 리뷰 훅

- [ ] 모든 테이블에 PK가 있는가.
- [ ] NOT NULL이 기본인가. 정말 선택적인 컬럼만 NULL을 허용하는가.
- [ ] 관계마다 FK가 있고 `ON DELETE` 동작이 의미에 맞는가(CASCADE/RESTRICT/SET NULL).
- [ ] FK 컬럼에 인덱스를 직접 만들었는가(PG는 자동 생성 안 함 → 부모 변경 시 풀스캔).
- [ ] 자연키(업무 유일성)에 UNIQUE가 있는가(인조 PK만으로는 중복이 쌓임).
- [ ] 도메인 규칙을 CHECK로 걸었는가. 교차행 규칙은 UNIQUE/EXCLUDE/FK로 옮겼는가.
- [ ] UNIQUE의 NULL 처리(`NULLS NOT DISTINCT`/부분 유니크 인덱스)를 의도대로 설정했는가.
