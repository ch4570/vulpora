# PostgreSQL Code Authoring Knowledge Base — INDEX

## 작업 유형 → 읽을 KB

| 작업 신호 | KB | 다룸 |
|---|---|---|
| SELECT, JOIN, filter, sort, pagination, index | [query-construction](query-construction.md) | parameter binding, result shape, plan-based index verification |
| CREATE/ALTER/DROP, constraint, index, backfill, migration | [migration-construction](migration-construction.md) | integrity, staged change, lock/rollback verification |

## KB 한 줄 요약

| KB | 한 줄 요약 |
|---|---|
| [query-construction](query-construction.md) | query shape와 index 후보를 실제 access pattern 및 EXPLAIN으로 검증한다 |
| [migration-construction](migration-construction.md) | integrity를 명시하고 위험한 변경은 단계·rollback·검증을 함께 작성한다 |

## 원칙 문서와의 관계

상위 판단 기준은 [principles](../principles.md)다. 대상 PostgreSQL version과 repository migration convention이 이 KB보다 우선한다.

## 갱신

PostgreSQL major version 또는 migration safety incident가 바뀌면 공식 문서를 다시 확인한다.
