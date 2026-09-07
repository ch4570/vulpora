---
title: 명시적 잠금 / 데드락
source: https://www.postgresql.org/docs/current/explicit-locking.html
pg_version: current (17/18)
last_fetched: 2026-06-22
consumers: [postgres-dba]
---

# KB: 잠금 / 데드락

## 테이블 락 등급 (statement → lock)
| statement | 테이블 락 |
|-----------|-----------|
| `SELECT` | ACCESS SHARE |
| `SELECT ... FOR UPDATE/SHARE` | ROW SHARE |
| `INSERT/UPDATE/DELETE/MERGE` | ROW EXCLUSIVE |
| `VACUUM`(no FULL), `ANALYZE`, `CREATE INDEX CONCURRENTLY` | SHARE UPDATE EXCLUSIVE |
| `CREATE INDEX`(비-concurrent) | SHARE |
| `ADD FOREIGN KEY` | SHARE ROW EXCLUSIVE |
| `DROP/TRUNCATE/VACUUM FULL/CLUSTER/대부분 ALTER` | **ACCESS EXCLUSIVE** |

> **ACCESS EXCLUSIVE만이 평범한 `SELECT`까지 막는다.** 큰 테이블에서 이 락을 잠깐 잡아도
> 뒤따르는 모든 쿼리가 락 대기열에 줄서면서 장애로 번진다.

## 행 락
- `FOR UPDATE`(배타) / `FOR NO KEY UPDATE` / `FOR SHARE` / `FOR KEY SHARE`.
- **큐 패턴**: `SELECT ... FOR UPDATE SKIP LOCKED LIMIT n`(워커 경합 제거).

## 리뷰 훅 (데드락 예방)
- [ ] 여러 행/테이블을 **항상 같은 순서로 잠그는가**(예: id 오름차순).
- [ ] 트랜잭션이 짧은가. 운영 DDL 전에 **`SET lock_timeout`**을 거는가.
- [ ] `pg_advisory_lock`을 LIMIT와 함께 쓸 때 서브쿼리로 LIMIT 먼저 적용했는가.
- [ ] 데드락은 PG가 한쪽 abort → **앱 재시도** 있는가.

## 진단
```sql
SELECT blocked.pid, blocking.pid, blocked.query, blocking.query
FROM pg_stat_activity blocked
JOIN pg_stat_activity blocking ON blocking.pid = ANY(pg_blocking_pids(blocked.pid));
SELECT * FROM pg_locks WHERE NOT granted;
```
