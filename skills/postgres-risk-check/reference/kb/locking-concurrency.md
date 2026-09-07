---
title: 잠금 / 동시성 / MVCC 운영 (Locking & Concurrency)
source: https://www.postgresql.org/docs/current/explicit-locking.html
last_fetched: 2026-06-24
skills: [postgres-risk-check]
---

# 잠금 / 동시성 / MVCC 운영 (Locking & Concurrency)

> 출처: PostgreSQL `Explicit Locking`·`Transaction Isolation`·`Routine Vacuuming`(공식) + 『친절한 SQL 튜닝』 6.4(통찰 보강).
> Oracle과 가장 다른 영역이라 **PostgreSQL 기준**으로 작성.

## 1. MVCC와 PostgreSQL 고유 운영 포인트

- PG는 **읽기가 쓰기를 막지 않고, 쓰기가 읽기를 막지 않는다**(스냅샷). UPDATE/DELETE는 기존
  튜플을 즉시 제거하지 않고 **죽은 튜플(dead tuple)** 로 남긴다 → **VACUUM**이 청소.
- 따라서 PG에서만 신경 쓰는 것:
  - **Bloat**: 대량 UPDATE/DELETE 후 테이블·인덱스가 부풀어 스캔 비용↑. autovacuum/`VACUUM`.
  - **트랜잭션 ID Wraparound**: 장기 미정리 시 위험. autovacuum freeze가 처리하나 모니터링 필요.
  - **긴 트랜잭션/유휴 트랜잭션(`idle in transaction`)**: dead tuple 회수를 막아 bloat를 키운다.
    가장 흔한 운영 사고. → `idle_in_transaction_session_timeout` 설정.

## 2. 격리 수준 (PG)

| 수준 | 특징 | 쓰임 | 주의 |
|------|------|------|------|
| **Read Committed**(기본) | 문장마다 최신 스냅샷 | 대부분 OLTP | 같은 트랜잭션 내 두 번 읽으면 값이 달라질 수 있음 |
| **Repeatable Read** | 트랜잭션 시작 스냅샷 고정 | 일관 리포트/배치 | 쓰기 충돌 시 `could not serialize access` → 재시도 |
| **Serializable** | SSI(진짜 직렬성) | 금융/재고 등 정확성 critical | `serialization_failure` **재시도 로직 필수** |

```sql
BEGIN ISOLATION LEVEL REPEATABLE READ;  -- 또는 SERIALIZABLE
...
COMMIT;
```

## 3. 잠금

- **행 잠금**: `FOR UPDATE`(배타), `FOR NO KEY UPDATE`, `FOR SHARE`, `FOR KEY SHARE`.
- **큐/작업 분배**: `SELECT ... FOR UPDATE SKIP LOCKED LIMIT n` — 잠긴 행을 건너뛰어 워커 간
  경합 제거(잡 큐의 정석).
- **테이블 잠금**: `LOCK TABLE`은 가급적 피한다(전면 차단). DDL이 자동으로 잡는 락에 유의.
- **Advisory lock**: `pg_advisory_lock(key)` / `pg_try_advisory_lock(key)` — 앱 레벨 분산
  락(중복 크론/마이그레이션 1회성 보장).

## 4. 데드락

- 원인: 두 트랜잭션이 서로가 가진 락을 기다림.
- **예방 1순위: 항상 같은 순서로 잠가라**(예: id 오름차순으로 UPDATE/FOR UPDATE).
- **트랜잭션을 짧게.** 트랜잭션 안에서 외부 API 호출/사용자 입력 대기 금지(가장 효과적인 단일 규칙).
- 데드락은 PG가 자동 감지해 한쪽을 abort(`deadlock_timeout` 후) → **앱에 재시도 로직**.

## 5. 진단 쿼리 (현장에서 바로)

```sql
-- 무엇이 무엇을 막고 있나 (blocking ↔ blocked)
SELECT blocked.pid   AS blocked_pid,  blocked.query  AS blocked_query,
       blocking.pid  AS blocking_pid, blocking.query AS blocking_query
FROM pg_stat_activity blocked
JOIN pg_stat_activity blocking
  ON blocking.pid = ANY(pg_blocking_pids(blocked.pid));

-- 대기 중인 락
SELECT * FROM pg_locks WHERE NOT granted;

-- 오래된 트랜잭션/유휴 in transaction (bloat 주범)
SELECT pid, state, now()-xact_start AS xact_age, now()-state_change AS idle_age, query
FROM pg_stat_activity
WHERE state <> 'idle' OR state = 'idle in transaction'
ORDER BY xact_start NULLS LAST;

-- dead tuple / vacuum 상태
SELECT relname, n_live_tup, n_dead_tup,
       round(n_dead_tup*100.0/NULLIF(n_live_tup+n_dead_tup,0),1) AS dead_pct,
       last_autovacuum
FROM pg_stat_user_tables ORDER BY n_dead_tup DESC;
```

## 6. 트랜잭션 설계 규칙

- **트랜잭션은 짧고 좁게.** 필요한 행만, 필요한 시간만 잠근다.
- **잠금 순서 일관**(데드락 예방).
- **Serializable/Repeatable Read는 재시도 가능하게** 코드를 짠다(직렬화 실패는 정상 경로).
- **유휴 트랜잭션 방치 금지**(`idle_in_transaction_session_timeout`).
- 대량 DML은 **청크 + 분할 커밋**으로 락 보유 시간과 WAL/bloat를 제어.
- 채번은 **시퀀스/IDENTITY**(채번 테이블 UPDATE 직렬화 병목 회피).

## 7. VACUUM / 통계 유지

- autovacuum을 끄지 말 것. 대량 변경 테이블은 테이블별 임계 조정:
  ```sql
  ALTER TABLE big SET (autovacuum_vacuum_scale_factor = 0.02,
                       autovacuum_analyze_scale_factor = 0.01);
  ```
- 대량 적재/백필 직후 **수동 `ANALYZE`**(통계 즉시 갱신 → 좋은 실행계획).
- bloat가 심하면 `VACUUM (VERBOSE)`, 공간 회수까지 필요하면 운영시간 외 `VACUUM FULL`
  (ACCESS EXCLUSIVE 락 주의) 또는 `pg_repack` 확장(온라인).

## 리뷰 훅

- [ ] 트랜잭션이 짧고 좁은가. 트랜잭션 안에서 외부 API 호출/사용자 입력 대기를 하지 않는가.
- [ ] 잠금 순서가 일관(예: id 오름차순)되어 데드락을 예방하는가.
- [ ] Repeatable Read/Serializable 사용 시 직렬화 실패(40001) 재시도 로직이 있는가.
- [ ] 유휴 트랜잭션 방치를 막는가(`idle_in_transaction_session_timeout`).
- [ ] 대량 UPDATE/DELETE 후 bloat·autovacuum·wraparound를 점검했는가.
- [ ] 큐 패턴에서 `FOR UPDATE SKIP LOCKED`, 분산 1회성 제어에 advisory lock을 적절히 썼는가.
- [ ] 채번을 시퀀스/IDENTITY로 하는가(채번 테이블 UPDATE 직렬화 병목 회피).
