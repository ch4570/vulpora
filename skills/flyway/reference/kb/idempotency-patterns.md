---
title: 멱등성 / 트랜잭션 경계
source: https://documentation.red-gate.com/fd/migrations-184127470.html
last_fetched: 2026-06-24
skills: [flyway]
---

# KB: 멱등성 / 트랜잭션 경계

> 근거: Flyway Migrations 문서 + PostgreSQL DDL 트랜잭션 특성(공식 문서).

## 멱등 패턴
- `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `DROP ... IF EXISTS`.
- `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`(PG 9.6+).
- 시드/데이터는 `INSERT ... ON CONFLICT DO NOTHING/UPDATE`로 재실행 안전하게.
- 목적: 부분 실패 후 재실행, 환경 간 상태 차이에 강하게.

## 트랜잭션 경계 (중요)
- Flyway는 기본적으로 각 마이그레이션을 **하나의 트랜잭션**으로 감싼다(가능한 DB에서).
- PostgreSQL은 대부분의 DDL이 트랜잭션 안에서 동작하지만, **`CREATE INDEX CONCURRENTLY`는
  트랜잭션 블록 안에서 실행 불가**다. 따라서 CONCURRENTLY를 쓰는 마이그레이션은
  Flyway 트랜잭션을 비활성화해야 한다(`executeInTransaction=false` 등 설정/구성으로).
- 한 마이그레이션에 CONCURRENTLY와 트랜잭션 필요 DDL을 섞지 말 것 → 파일을 분리.

## 멀티 스테이트먼트
- 한 파일에 여러 SQL을 두면 순서대로 실행. 한 스테이트먼트 실패 시(트랜잭션이면) 전체 롤백.

## 리뷰 훅
- [ ] 객체 생성/삭제에 `IF [NOT] EXISTS`를 써 재실행 안전한가.
- [ ] 데이터 삽입이 `ON CONFLICT` 등으로 멱등한가.
- [ ] `CREATE INDEX CONCURRENTLY`를 쓰면 해당 마이그레이션의 트랜잭션을 끈 별도 파일인가.
- [ ] CONCURRENTLY와 트랜잭션 의존 DDL을 한 파일에 섞지 않았는가.
- [ ] `CASCADE` drop을 쓰지 않았는가.
