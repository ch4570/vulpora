---
title: 선언적 파티셔닝
source: https://www.postgresql.org/docs/current/ddl-partitioning.html
pg_version: current (17/18)
last_fetched: 2026-06-22
consumers: [postgres-dba]
---

# KB: 선언적 파티셔닝

## 종류
- **RANGE**(시계열 `created_at`), **LIST**(지역/타입), **HASH**(균등 분산).

## 리뷰 훅
- [ ] 파티션 키가 **WHERE에 자주 쓰는 컬럼**인가(가지치기 pruning 가능?).
- [ ] **UNIQUE/PK는 파티션 키 컬럼을 모두 포함**해야 한다(전역 인덱스 없음). 누락이면 유일성 깨짐.
- [ ] FK는 파티션 계층 전체가 아니라 개별 테이블 기준 — 참조무결성 한계 인지.
- [ ] 오래된 데이터 정리는 **대량 DELETE 대신 `DETACH`/`DROP` 파티션**(dead tuple/bloat 회피).
- [ ] 파티션 수가 수천 개를 넘으면 계획 시간·메모리 부담 → 과분할 금지.
- [ ] `WHERE created > now() - interval '1 day'` 같은 **비-IMMUTABLE 식은 plan-time pruning 불가**(execution-time는 가능).

## 운영(락) 규칙
- 신규 파티션은 `CREATE TABLE ... (LIKE ...)` → CHECK 선부착 → **`ATTACH PARTITION`**(SHARE UPDATE EXCLUSIVE)로 락 최소화.
  (`CREATE TABLE ... PARTITION OF`는 ACCESS EXCLUSIVE.)
- 분리는 `DETACH PARTITION CONCURRENTLY`.
- 파티션 인덱스: 부모에 `CREATE INDEX ON ONLY parent` → 각 파티션 `CREATE INDEX CONCURRENTLY` → `ALTER INDEX ... ATTACH PARTITION`.
- 자동화: pg_partman 등으로 미래 파티션 미리 생성 + retention.

## 근거
- 가지치기 기본 on(`enable_partition_pruning`), plan-time + execution-time 2단계.
- 1GB 미만/조회패턴 불일치면 파티셔닝 이득 없음.
