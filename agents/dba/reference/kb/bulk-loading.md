---
title: 대량 적재 (bulk load)
source: https://www.postgresql.org/docs/current/populate.html
pg_version: current (17/18)
last_fetched: 2026-06-22
consumers: [postgres-dba]
---

# KB: 대량 적재

## 리뷰 훅 (순서 체크리스트)
- [ ] 단건 `INSERT` 반복이 아니라 **`COPY`**(또는 다중행 INSERT)를 쓰는가(10~100배).
- [ ] 한 트랜잭션으로 묶었는가(원자성 + autocommit 오버헤드 제거).
- [ ] 기존 테이블 대량 적재면 **인덱스 DROP → 적재 → 재생성**, **FK 제약 일시 제거** 고려했는가.
- [ ] `maintenance_work_mem`, `max_wal_size`를 일시 상향했는가(인덱스 재생성·체크포인트 빈도).
- [ ] 적재 후 **`ANALYZE`**(통계). 변경 컬럼 인덱스/제약 복구.
- [ ] 큰 백필 UPDATE/DELETE는 **청크 분할 커밋**(락·WAL·bloat·롤백 비용 제어).

## 처방
```sql
SET maintenance_work_mem = '1GB';
SET max_wal_size = '4GB';
BEGIN;
COPY t (a,b,c) FROM STDIN WITH (FORMAT csv);
COMMIT;
ANALYZE t;
```
- 완전 신규 테이블이면 `UNLOGGED`/`wal_level=minimal` 고려(크래시·복제 비용 감수 시).
- pg_dump 복원: `pg_restore -j N -1 --disable-triggers` 후 `ANALYZE`.

## 근거
- COPY가 INSERT보다 압도적으로 빠름. 인덱스/FK가 있으면 행마다 검사·갱신 비용 발생.
