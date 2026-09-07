---
title: MVCC와 트랜잭션 격리수준
source: https://www.postgresql.org/docs/current/mvcc.html, transaction-iso.html
pg_version: current (17/18)
last_fetched: 2026-06-22
consumers: [postgres-dba]
---

# KB: MVCC / 격리수준

## MVCC 기본 (PG 고유 운영 포인트)
- 읽기는 쓰기를, 쓰기는 읽기를 막지 않음(스냅샷). UPDATE/DELETE는 **dead tuple**을 남김 → VACUUM이 청소.
- PG 고유 리스크: **bloat**, **XID wraparound**, **긴/유휴 트랜잭션이 xmin을 붙잡아 청소 방해**.

## 격리수준
| 수준 | dirty | non-repeat | phantom | serialization anomaly |
|------|-------|-----------|---------|-----------------------|
| **Read Committed**(기본) | ✗ | 가능 | 가능 | 가능 |
| **Repeatable Read** | ✗ | ✗ | ✗(PG는 표준보다 강함) | 가능 → `could not serialize` |
| **Serializable**(SSI) | ✗ | ✗ | ✗ | ✗ |

## 리뷰 훅
- [ ] Repeatable Read/Serializable 사용 시 **`40001`(serialization_failure) 재시도 로직**이 있는가(필수).
- [ ] 트랜잭션이 짧은가(외부 API 호출/사용자 입력 대기를 트랜잭션 안에 두지 않았는가).
- [ ] 시퀀스/IDENTITY 값은 롤백돼도 되돌아가지 않음(구멍 허용 설계인가).
- [ ] Read Committed에서 "같은 트랜잭션 두 번 읽기" 값이 달라질 수 있음을 코드가 가정하나.

## 재시도 패턴
```python
while True:
    try:
        # BEGIN ISOLATION LEVEL REPEATABLE READ; ... ; COMMIT
        break
    except SerializationFailure:   # SQLSTATE 40001
        rollback(); continue
```
- 읽기전용 무결 스냅샷이 필요하면 `SERIALIZABLE READ ONLY DEFERRABLE`.
