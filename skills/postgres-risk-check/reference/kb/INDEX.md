# PostgreSQL 변경 리스크 KB — 색인 (INDEX)

> PostgreSQL **공식 문서**를 distill한 인용 가능한 KB. 각 파일은 frontmatter에
> `source`(원문 URL)·`last_fetched`·`skills`를 담는다.
> **리뷰 시 사용법**: 변경 유형에 맞는 KB를 먼저 읽고, 그 **`## 리뷰 훅`** 체크리스트로 점검하며,
> 지적할 때 KB의 `source` URL을 근거로 인용한다. (예: "PG `ALTER TABLE` 기준 …")

## 작업 유형 → 읽을 KB

| 작업 유형 | 읽을 KB |
|-----------|---------|
| DDL 락 등급·재작성·무중단 변경 패턴 | [migration-safety](migration-safety.md) |
| 인덱스 생성/삭제 안전성(CONCURRENTLY) | [migration-safety](migration-safety.md) |
| 격리수준·행/테이블 락·데드락·재시도 | [locking-concurrency](locking-concurrency.md) |
| MVCC/bloat/VACUUM/wraparound 운영 | [locking-concurrency](locking-concurrency.md) |
| 대량 백필 청크화 | [migration-safety](migration-safety.md) |

## 각 KB 한 줄 요약

| KB | 다룸 |
|----|------|
| [migration-safety](migration-safety.md) | 변경 유형별 락 등급/재작성 표, 황금 규칙, 무중단 타입변경, 백필 루프, 도구별 주의 |
| [locking-concurrency](locking-concurrency.md) | MVCC 운영 포인트, 격리수준, 행/advisory 락, 데드락, 진단 쿼리, 트랜잭션 설계, VACUUM |

## 원칙 문서와의 관계
- 상위 원칙·판단 기준은 `../principles.md`(헌법). KB는 그 원칙의 **공식 문서 근거·세부 규칙**.
- 충돌 시 **KB(공식 문서)가 principles(책 통찰)보다 우선**한다.

## 갱신
- 각 파일 `last_fetched` 기준. PG 메이저 업그레이드 시 `source` URL을 다시 fetch해 갱신.
- TODO(차기 KB 후보): REINDEX(CONCURRENTLY), 파티션 ATTACH/DETACH 락, server config
  (`lock_timeout`·`statement_timeout`·autovacuum 튜닝), logical replication 변경 영향.
