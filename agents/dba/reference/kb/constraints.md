---
title: 제약과 무결성
source: https://www.postgresql.org/docs/current/ddl-constraints.html
pg_version: current (17/18)
last_fetched: 2026-06-22
consumers: [postgres-dba]
---

# KB: 제약과 무결성 (무결성은 DB에 건다)

## 리뷰 훅
- [ ] **모든 테이블에 PK.**
- [ ] **NOT NULL이 기본.** 정말 선택적 컬럼만 NULL.
- [ ] **관계마다 FK** + `ON DELETE`(구성요소 CASCADE / 독립 RESTRICT / 선택 SET NULL).
- [ ] **FK 컬럼에 인덱스를 직접 생성**(PG는 자동 안 함 → 부모 DELETE/UPDATE 시 자식 풀스캔).
- [ ] **자연키(업무 유일성)에 UNIQUE**(인조 PK가 있어도).
- [ ] 수치 불변 규칙은 CHECK(`amount >= 0`, `quantity >= 0`). CHECK는 같은 행만, 불변 가정.
- [ ] 기간 중첩 금지 등 교차행 규칙은 **EXCLUDE**.

## 제약 요약
| 제약 | 다중컬럼 | 자동 인덱스 | NULL |
|------|----------|------------|------|
| NOT NULL | ✗ | ✗ | NULL 거부 |
| CHECK | ✓ | ✗ | NULL이면 통과 |
| UNIQUE | ✓ | ✓ | 기본 NULL끼리 다름(`NULLS NOT DISTINCT`로 변경, PG15+) |
| PRIMARY KEY | ✓ | ✓ | 암묵 NOT NULL |
| FOREIGN KEY | ✓ | **✗(직접)** | 기본 NULL이면 통과(`MATCH FULL`로 강화) |
| EXCLUDE | ✓ | ✓(GiST 등) | 상황별 |

## EXCLUDE (PG 고유 무기)
```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE TABLE booking (
  room_id bigint NOT NULL,
  period  tstzrange NOT NULL,
  EXCLUDE USING gist (room_id WITH =, period WITH &&)   -- 같은 방 기간 겹침 금지
);
```

## 운영 중 추가는 2단계 (락 회피)
```sql
ALTER TABLE t ADD CONSTRAINT c CHECK (...) NOT VALID;   -- 빠름
ALTER TABLE t VALIDATE CONSTRAINT c;                    -- SHARE UPDATE EXCLUSIVE
```
상세: `alter-table-safety.md`.
