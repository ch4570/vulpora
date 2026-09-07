---
title: 결과 바운딩 · 행 잠금 차단
source: https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS
last_fetched: 2026-06-25
consumers: [nl-sql-guardian, postgres-dba]
---

# KB: 결과 바운딩 · 행 잠금 차단

> 참고 출처: PostgreSQL *Explicit Locking — Row-Level Locks*, *SELECT*(LIMIT/FETCH),
> OWASP(무제한 결과셋 = 자원 고갈/DoS).

## 결과 바운딩 (무제한 결과셋 금지)

1. **행 제한 강제**: 모든 질의에 `LIMIT n`(pg/mysql) / `TOP (n)` / `OFFSET..FETCH NEXT n ROWS ONLY`(mssql).
   무제한 결과셋은 메모리 폭증·지연·DoS 위험.
2. **결과 캡(하드 절단)은 별개 층**: 사용자가 `LIMIT`을 안 붙이거나 큰 값을 넣어도, 서버가 행 수를 절단한다.
   `LIMIT`을 못 붙이는 dialect(mssql TOP/OFFSET 조합)도 캡으로 하드 보장.
3. 가드가 외곽 `LIMIT` 부재를 감지하면 자동 보강하되(append 가능 dialect), **항상 결과 캡이 최종 보장**이어야 한다.

## 행 잠금 차단 (읽기 경로)

| 절 | 잡는 락 | 읽기 경로에서 |
|----|---------|---------------|
| `SELECT ... FOR UPDATE` | 행 배타 잠금 | **차단** — 경합/락 대기/데드락 |
| `FOR NO KEY UPDATE` | 약한 배타 | **차단** |
| `FOR SHARE` / `FOR KEY SHARE` | 공유 잠금 | **차단** |

- 행잠금은 쓰기 의도 트랜잭션의 도구다. NL→SQL **읽기 표면**에 들어오면 그 자체가 결함(읽기전용 의미와 모순,
  다른 트랜잭션을 막아 장애로 번질 수 있음).
- 가드는 `for\s+(update|no\s+key\s+update|share|key\s+share)`를 마스킹 텍스트에서 명시 차단한다.
- 락/동시성 깊은 판단은 `postgres-dba`에 근거와 함께 인계해 보강한다.

## 리뷰 훅
- [ ] 모든 질의에 행 제한(LIMIT/TOP/FETCH)이 들어가는가.
- [ ] 행 제한과 **별개로** 결과 캡(서버 절단)이 하드 보장하는가(LIMIT 미지원 dialect 포함).
- [ ] `SELECT ... FOR UPDATE/SHARE/KEY SHARE`가 가드에서 명시 차단되는가.
- [ ] 무제한 결과셋(LIMIT 없음 + 캡 없음) 경로가 **0개**인가.
- [ ] 결과/오류에 스키마·시크릿·내부 경로를 노출하지 않는가.
