---
title: 안전한 마이그레이션 패턴 (온라인 DDL 연계)
source: https://documentation.red-gate.com/fd/migrations-184127470.html
last_fetched: 2026-06-24
skills: [flyway]
---

# KB: 안전한 마이그레이션 패턴

> 근거: Flyway Migrations 문서 + PostgreSQL "ALTER TABLE" 락/재작성 특성(공식 문서).
> 락·재작성이 큰 변경은 개념적으로 `postgres-risk-check`(온라인 DDL 안전성)와 연계해 검토한다.

## NOT NULL 추가 — 안전 3단계
1. `ALTER TABLE t ADD COLUMN c <type>` (nullable, 또는 기존 컬럼).
2. 배치로 백필(`UPDATE ... WHERE c IS NULL LIMIT/청크` 반복) — 한 트랜잭션 거대 UPDATE 금지.
3. `ALTER TABLE t ALTER COLUMN c SET NOT NULL` (또는 `ADD CONSTRAINT ... NOT VALID` → `VALIDATE`).

## 인덱스 — 락 회피
- 운영 테이블 인덱스는 `CREATE INDEX CONCURRENTLY`(쓰기 막지 않음). 단 트랜잭션 밖이어야 함(KB: idempotency).
- 부분 인덱스(`WHERE deleted = false`)로 대상 축소.

## 제약 추가 — 2단계
- 큰 `CHECK`/FK는 `ADD CONSTRAINT ... NOT VALID` 후 별도 `VALIDATE CONSTRAINT`로 풀스캔 락 분리.

## 위험 변경
- 타입 변경(`ALTER TYPE`)은 테이블 재작성 + 장시간 락 → 신규 컬럼 추가 + 백필 + 교체 전략 고려.
- `lock_timeout`/`statement_timeout`을 걸어 장시간 락 폭주를 방지.
- 큰 변경 전 `postgres-risk-check`로 락 등급·재작성 여부 사전 검토.

## 리뷰 훅
- [ ] `NOT NULL`을 nullable→백필→set not null 3단계로 나눴는가.
- [ ] 백필을 배치(청크)로 쪼개 거대 단일 트랜잭션을 피했는가.
- [ ] 운영 인덱스에 `CONCURRENTLY`를 썼고 트랜잭션 밖인가.
- [ ] 큰 `CHECK`/FK를 `NOT VALID`→`VALIDATE` 2단계로 했는가.
- [ ] 락·재작성 위험이 큰 변경을 `postgres-risk-check`로 사전 검토했는가.
- [ ] `lock_timeout`/`statement_timeout` 등 안전장치를 고려했는가.
