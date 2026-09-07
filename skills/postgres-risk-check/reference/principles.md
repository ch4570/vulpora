# PostgreSQL 변경 리스크 — 핵심 원칙 (Principles)

> 이 문서는 마이그레이션/DDL/대량 DML의 안전성 판단 기준을 담은 "헌법"이다. KB가 "락 등급·
> 절차"라면 여기는 "어떤 위험을 먼저 막을지"의 판단 기준이다. **충돌 시 KB(공식 문서)가 우선**.
>
> **출처(Sources)**
> - PostgreSQL 공식 문서: `ALTER TABLE`, `Explicit Locking`, `Transaction Isolation`,
>   `Building Indexes Concurrently`, `Routine Vacuuming` (docs/current)
> - 조시형, 『친절한 SQL 튜닝』(디비안) 6장 — DML/락/동시성 통찰
>
> Oracle과 가장 차이가 큰 영역(MVCC, dead tuple, VACUUM)이므로 **PostgreSQL 기준**으로 적용한다.

---

## 1. DDL은 락을 잡는다 — 락 등급과 재작성 여부를 모르면 장애다
- `ACCESS EXCLUSIVE` 락은 **읽기까지** 막는다. 큰 테이블에서 단 몇 초라도, 뒤따르는 모든
  쿼리가 줄줄이 막히는 **락 대기열 폭주**가 진짜 장애의 원인이다.
- 변경 전 반드시 분류: 인덱스 / 컬럼 / 제약 / 타입 / 백필 / DROP → 각각의 락 등급·재작성 여부 확인.

## 2. 항상 타임아웃을 먼저 건다
- `SET lock_timeout`(예 `'3s'`)을 걸고 DDL을 돌린다. **락을 못 잡으면 빨리 실패→재시도**가
  장애보다 낫다.

## 3. 무중단 패턴을 표준으로 쓴다
- 인덱스는 **`CREATE INDEX CONCURRENTLY`**(트랜잭션 밖).
- 검증 동반 제약(FK/CHECK)·`NOT NULL`은 **`NOT VALID` → 한가할 때 `VALIDATE`** 2단계.
- 컬럼 추가와 데이터 채우기를 **분리**한다(추가는 즉시, 백필은 청크).
- 타입 변경/재작성은 새 컬럼+이중쓰기+백필+스왑의 무중단 전략 또는 점검창.

## 4. 큰 트랜잭션을 만들지 않는다
- 한 트랜잭션의 수백만 행 DML은 락·WAL·롤백·bloat를 폭증시킨다. **청크 + 분할 커밋**으로.
- 백필 완료 후 `ANALYZE`, 필요하면 `VACUUM`으로 bloat를 회수한다.

## 5. MVCC 고유 리스크를 운영 항목으로 본다
- UPDATE/DELETE는 dead tuple을 남기고 **VACUUM**이 청소한다 → bloat·트랜잭션 ID wraparound를
  점검. autovacuum을 끄지 않는다.
- **유휴 트랜잭션(`idle in transaction`) 방치 금지**(`idle_in_transaction_session_timeout`).
  dead tuple 회수를 막아 bloat를 키우는 가장 흔한 사고다.

## 6. 동시성은 짧은 트랜잭션과 일관된 잠금 순서로 지킨다
- 트랜잭션은 짧고 좁게. 트랜잭션 안에서 외부 API 호출/사용자 입력 대기 금지.
- **항상 같은 순서로 잠근다**(데드락 예방). 데드락/직렬화 실패(40001)는 정상 경로 →
  **앱에 재시도 로직**.

## 7. 되돌릴 수 있게 만든다
- 각 마이그레이션에 롤백(down) 경로. `CONCURRENTLY`/`VALIDATE`는 트랜잭션으로 못 묶이니
  단계별 멱등하게. DROP/TRUNCATE 등 데이터 소실 변경엔 백업·확인을 선행한다.
