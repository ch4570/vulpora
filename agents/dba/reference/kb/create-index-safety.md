---
title: 인덱스 생성 안전성 (CONCURRENTLY)
source: https://www.postgresql.org/docs/current/sql-createindex.html
pg_version: current (17/18)
last_fetched: 2026-06-22
consumers: [postgres-dba]
---

# KB: 인덱스 생성 안전성

## 리뷰 훅
- [ ] 운영 중(데이터 있는) 테이블 인덱스는 **`CREATE INDEX CONCURRENTLY`** 인가.
- [ ] CONCURRENTLY는 **트랜잭션 블록 안에서 못 돈다** → 마이그레이션 도구를 비-트랜잭션 모드로.
- [ ] CONCURRENTLY 실패 시 **INVALID 인덱스가 남는다** → `DROP INDEX` 후 재생성(또는 `REINDEX INDEX CONCURRENTLY`).
- [ ] 신규(빈) 테이블에 인덱스를 함께 만드는 건 안전(락 위험 낮음).

## 근거
- 일반 `CREATE INDEX`는 **SHARE 락**으로 쓰기를 막음(읽기는 허용). 큰 테이블에서 위험.
- CONCURRENTLY는 SHARE UPDATE EXCLUSIVE로 읽기·쓰기 허용하나 **두 번 스캔**(느림), 테이블당 1개씩.
- 파티션 테이블엔 부모에 직접 CONCURRENTLY 불가 → 파티션별 생성 후 ATTACH(`partitioning.md`).

## 옵션
```sql
CREATE INDEX CONCURRENTLY ix ON t (col);                  -- 운영 표준
CREATE UNIQUE INDEX CONCURRENTLY uq ON t (col) NULLS NOT DISTINCT;  -- NULL 하나만 허용(PG15+)
CREATE INDEX CONCURRENTLY ix ON t (key) INCLUDE (a, b);   -- 커버링
CREATE INDEX CONCURRENTLY ix ON t (col) WHERE deleted_at IS NULL;   -- 부분
SET maintenance_work_mem = '2GB';                         -- 생성 속도↑
-- 진행: SELECT * FROM pg_stat_progress_create_index;
```
