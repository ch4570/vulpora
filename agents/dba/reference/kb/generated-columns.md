---
title: 생성 컬럼 (GENERATED)
source: https://www.postgresql.org/docs/current/ddl-generated-columns.html
pg_version: current (17/18)
last_fetched: 2026-06-22
consumers: [postgres-dba]
---

# KB: 생성 컬럼

## STORED vs VIRTUAL
- **STORED**: 쓰기 시 계산·저장(읽기 빠름, 저장공간 사용). 자주 읽는 복잡한 파생값.
- **VIRTUAL**(기본, PG18+): 읽기 시 계산(저장 없음, 항상 최신). 단순 파생.

## 리뷰 훅
- [ ] 파생/중복 컬럼을 애플리케이션이 따로 세팅하고 있나 → 생성컬럼으로 정합성 자동화.
- [ ] 생성식이 **IMMUTABLE** 함수 + **같은 행 컬럼만** 참조하는가(서브쿼리/타행/타 생성컬럼 불가).
- [ ] `now()/random()` 등 VOLATILE을 생성식에 쓰지 않았는가(금지).
- [ ] 생성컬럼은 **직접 INSERT/UPDATE 불가**(DEFAULT 키워드만). PK/파티션 키로 쓸 때 제약 주의.

## 예시
```sql
CREATE TABLE orders (
  amount numeric NOT NULL,
  tax    numeric GENERATED ALWAYS AS (round(amount * 0.1, 2)) STORED
);
```

## 근거
- 허용: IMMUTABLE 함수, 같은 행 다른 컬럼, 내장 함수.
- 금지: VOLATILE, 서브쿼리, 타행/타 생성컬럼 참조, (대형 STORED는 ALTER 시 테이블 재작성 — `alter-table-safety.md`).
