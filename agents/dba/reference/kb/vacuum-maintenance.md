---
title: VACUUM / autovacuum / bloat / wraparound
source: https://www.postgresql.org/docs/current/routine-vacuuming.html
pg_version: current (17/18)
last_fetched: 2026-06-22
consumers: [postgres-dba]
---

# KB: VACUUM 유지보수

## 리뷰 훅
- [ ] 대량 UPDATE/DELETE 테이블의 **dead tuple/bloat**를 점검했는가(`n_dead_tup`).
- [ ] **autovacuum을 끄지 않았는가.** 고변경 테이블은 테이블별 임계 조정.
- [ ] 대량 적재/백필 직후 **수동 `ANALYZE`**(통계 즉시 갱신).
- [ ] **긴/유휴 트랜잭션**(`idle in transaction`)이 xmin을 붙잡지 않는가 → `idle_in_transaction_session_timeout`.
- [ ] **XID age** 상승(wraparound 위험) 모니터링 — 파티션/시스템 카탈로그 포함.
- [ ] 파티션 부모 테이블은 autovacuum이 ANALYZE 안 함 → 수동 ANALYZE.

## VACUUM 종류
| 명령 | 락 | 용도 |
|------|----|------|
| `VACUUM` | SHARE UPDATE EXCL | 평상시(자주) |
| `VACUUM FULL` | **ACCESS EXCL + 재작성** | 비상 bloat 회수(운영시간 외) — 또는 `pg_repack`(온라인) |
| `ANALYZE` | 가벼움 | 통계만 |

## 처방
```sql
ALTER TABLE hot SET (autovacuum_vacuum_scale_factor = 0.05,
                     autovacuum_analyze_scale_factor = 0.02);
```
```sql
-- dead tuple 상위
SELECT relname, n_dead_tup, n_live_tup, last_autovacuum
FROM pg_stat_user_tables ORDER BY n_dead_tup DESC;
-- XID age
SELECT datname, age(datfrozenxid) FROM pg_database ORDER BY 2 DESC;
```

## 근거
- VACUUM은 dead tuple 공간 회수 + 통계 + visibility map + **wraparound 동결(freeze)**.
- `autovacuum_freeze_max_age`(기본 2억) 초과 시 강제 aggressive vacuum. 3M 남으면 ERROR(읽기전용).
