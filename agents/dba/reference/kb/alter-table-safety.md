---
title: ALTER TABLE 안전성 (락 등급·재작성)
source: https://www.postgresql.org/docs/current/sql-altertable.html
pg_version: current (17/18)
last_fetched: 2026-06-22
consumers: [postgres-dba]
---

# KB: ALTER TABLE 안전성

## 변경별 위험도 (대형 테이블 기준)
| 변경 | 락 | 재작성 | 위험 |
|------|----|--------|------|
| `ADD COLUMN`(상수/무 DEFAULT) | ACCESS EXCL(짧음, 메타) | ✗(PG11+) | 낮음 |
| `ADD COLUMN`(volatile DEFAULT/생성컬럼/IDENTITY) | ACCESS EXCL | **재작성** | 높음 |
| `ALTER COLUMN TYPE` | ACCESS EXCL | **재작성**(예외: text↔varchar, int4→int8 등 binary-coercible) | 매우 높음 |
| `DROP COLUMN` / `RENAME` / `SET/DROP DEFAULT` | ACCESS EXCL(짧음, 메타) | ✗ | 낮음 |
| `SET NOT NULL`(직접) | ACCESS EXCL + 풀스캔 | ✗ | 중간 |
| `ADD CONSTRAINT`(검증 동반) | ACCESS EXCL + 풀스캔 | ✗ | 중간 |
| `ADD CONSTRAINT ... NOT VALID` | ACCESS EXCL(짧음, 스캔 X) | ✗ | 낮음 |
| `VALIDATE CONSTRAINT` | **SHARE UPDATE EXCL**(쓰기 허용) | ✗ | 낮음 |
| `ADD FOREIGN KEY` | SHARE ROW EXCL(양 테이블) | ✗ | 중간 |
| `ATTACH PARTITION` | SHARE UPDATE EXCL | ✗ | 낮음 |

## 리뷰 훅
```sql
SET lock_timeout = '3s';                       -- 항상 먼저
-- NOT NULL: CHECK 경유로 풀스캔 락 회피(PG12+)
ALTER TABLE t ADD CONSTRAINT c CHECK (col IS NOT NULL) NOT VALID;
ALTER TABLE t VALIDATE CONSTRAINT c;           -- 쓰기 허용 락
ALTER TABLE t ALTER COLUMN col SET NOT NULL;   -- 위 CHECK 근거로 빠름
-- FK: NOT VALID → VALIDATE
-- 컬럼 추가와 백필 분리(추가는 즉시, 백필은 청크)
```
- [ ] 대형 테이블에 재작성/ACCESS EXCLUSIVE 장기 락 유발 구문이 없는가.
- [ ] 컬럼 추가의 DEFAULT가 상수인가(volatile면 재작성).
- [ ] 호환 변경은 한 `ALTER TABLE`에 묶어 1패스로.
