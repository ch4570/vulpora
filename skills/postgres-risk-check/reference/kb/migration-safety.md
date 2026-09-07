---
title: 마이그레이션 안전성 (Migration Safety)
source: https://www.postgresql.org/docs/current/sql-altertable.html
last_fetched: 2026-06-24
skills: [postgres-risk-check]
---

# 마이그레이션 안전성 (Migration Safety)

> 출처: PostgreSQL `ALTER TABLE`·`Explicit Locking`·`Building Indexes Concurrently`(공식) + 운영 원칙.
> 핵심: **DDL은 락을 잡는다. 큰 테이블에서 락 등급과 재작성 여부를 모르면 장애가 난다.**

## 1. 변경 유형별 락 / 위험도 (대형 테이블 기준)

| 변경 | 락 등급 | 테이블 재작성 | 위험 | 안전 대안 |
|------|---------|---------------|------|-----------|
| `CREATE INDEX` | SHARE (쓰기 차단) | X | 높음 | `CREATE INDEX CONCURRENTLY` |
| `CREATE INDEX CONCURRENTLY` | 약함(쓰기 허용) | X | 낮음 | 트랜잭션 밖에서 실행 |
| `DROP INDEX` | ACCESS EXCLUSIVE(짧음) | X | 낮음 | `DROP INDEX CONCURRENTLY` |
| `ADD COLUMN`(상수/무 DEFAULT) | ACCESS EXCLUSIVE(짧음, 메타데이터) | X(PG11+) | 낮음 | 그대로 OK |
| `ADD COLUMN ... DEFAULT volatile` | ACCESS EXCLUSIVE | **O** | 높음 | 컬럼 추가 → 백필 분리 |
| `ADD COLUMN ... NOT NULL`(DEFAULT 없음) | 풀스캔/재작성 | 상황별 | 높음 | CHECK NOT VALID → VALIDATE → SET NOT NULL |
| `ALTER COLUMN TYPE` | ACCESS EXCLUSIVE | **O(전체 재작성)** | 매우 높음 | 새 컬럼+백필+스왑, 또는 점검창 |
| `ADD FOREIGN KEY` | 양 테이블 락 + 검증 | X | 중간 | `NOT VALID` → `VALIDATE` |
| `ADD CHECK` | 풀스캔 검증 | X | 중간 | `NOT VALID` → `VALIDATE` |
| `SET NOT NULL`(직접) | 풀스캔 | X | 중간 | 위 CHECK 경유(PG12+ 빠름) |
| `DROP COLUMN` | ACCESS EXCLUSIVE(짧음) | X(논리적) | 낮음 | 공간 회수는 이후 VACUUM |
| `RENAME` | ACCESS EXCLUSIVE(짧음) | X | 낮음 | 앱 호환(양방향 배포) 주의 |
| `TRUNCATE` | ACCESS EXCLUSIVE | - | 높음(되돌리기 불가 데이터 소실) | 백업/확인 |
| 대량 `UPDATE/DELETE` | 행 락 다수 + WAL/bloat | X | 높음 | 청크 분할 |
| 파티션 `DETACH/DROP` | 짧은 락(CONCURRENTLY 옵션) | X | 낮음 | 오래된 데이터 정리 표준 |

> `ACCESS EXCLUSIVE` 락은 **읽기까지** 막는다. 큰 테이블에서 단 몇 초라도, 그 락을 기다리는
> 뒤의 모든 쿼리가 줄줄이 막히는 **락 대기열(lock queue)** 폭주가 진짜 장애의 원인이다.

## 2. 황금 규칙

1. **항상 `SET lock_timeout`** (예 `'3s'`)을 걸고 DDL을 돌린다. 락을 못 잡으면 빨리 실패→재시도가
   장애보다 낫다.
2. **인덱스는 `CONCURRENTLY`**, 트랜잭션 밖에서. (마이그레이션 도구의 "비트랜잭션" 모드 필요)
3. **검증을 동반하는 제약은 2단계**(`NOT VALID` → 한가할 때 `VALIDATE`).
4. **컬럼 추가와 데이터 채우기를 분리**한다. 추가는 즉시, 백필은 청크로.
5. **타입 변경/재작성은 무중단 전략** 또는 점검창. 무중단: 새 컬럼 추가 → 트리거/이중쓰기 →
   백필 → 읽기 전환 → 옛 컬럼 제거.
6. **되돌릴 수 있게**: 각 마이그레이션에 롤백(down)을 작성. `CONCURRENTLY`/`VALIDATE`는
   트랜잭션으로 못 묶이니 단계별 멱등하게.

## 3. 무중단 컬럼 타입 변경(예: int → bigint PK)

```sql
-- 1) 새 컬럼
ALTER TABLE events ADD COLUMN id_new bigint;
-- 2) 신규 쓰기 동기화 (트리거 또는 앱 이중쓰기)
-- 3) 과거 백필 (청크)
UPDATE events SET id_new = id WHERE id_new IS NULL AND id BETWEEN $lo AND $hi;
-- 4) 인덱스/제약을 새 컬럼에 CONCURRENTLY로 구성
-- 5) 짧은 점검창에 컬럼 스왑(rename) + 시퀀스/PK 전환
-- 6) 옛 컬럼 DROP
```

## 4. 대량 백필 루프 (의사코드)

```sql
-- 키 범위 청크. 각 청크는 짧은 트랜잭션으로 커밋되어야 함.
-- lo부터 max까지 batch=20000 씩:
--   BEGIN; UPDATE t SET ... WHERE id >= lo AND id < lo+batch; COMMIT;
--   (필요시 sleep으로 autovacuum/복제 지연에 숨 돌릴 틈)
-- 완료 후: ANALYZE t;  필요하면 VACUUM (bloat 회수).
```

## 5. 마이그레이션 도구별 주의

- **Alembic(Python)**: `op.create_index(..., postgresql_concurrently=True)` + 해당 리비전을
  비트랜잭션(`# transactional = False` 패턴/`op.get_context().autocommit_block()`)으로.
- **Flyway/Liquibase**: `CONCURRENTLY`/`VALIDATE`는 트랜잭션 밖 실행 설정 필요
  (Flyway `executeInTransaction=false`).
- **Django**: `AddIndexConcurrently`(`django.contrib.postgres.operations`) + `atomic = False`.
  `SeparateDatabaseAndState`로 상태/실DDL 분리.
- **Prisma/TypeORM/Rails**: 생성된 마이그레이션이 일반 `CREATE INDEX`/일괄 제약 추가를 내므로
  **수동으로 `CONCURRENTLY`/`NOT VALID`로 교정**. (Rails는 `disable_ddl_transaction!` +
  `algorithm: :concurrently`)

## 리뷰 훅

- [ ] 대형 테이블에 `ACCESS EXCLUSIVE` 장기 락을 유발하는 구문이 없는가.
- [ ] 인덱스 생성이 `CONCURRENTLY`인가(+ 트랜잭션 밖).
- [ ] 제약 추가가 `NOT VALID` → `VALIDATE` 2단계인가.
- [ ] 컬럼 추가와 백필이 분리되고, 백필이 청크인가.
- [ ] `lock_timeout`이 설정되어 있는가.
- [ ] 롤백(down) 경로가 있는가. 데이터 소실(예: DROP/TRUNCATE)에 백업이 있는가.
- [ ] 변경 후 `ANALYZE`(통계), 필요시 `VACUUM` 계획이 있는가.
- [ ] 앱과의 호환(컬럼 rename/삭제 시 양방향 배포 순서)을 고려했는가.
