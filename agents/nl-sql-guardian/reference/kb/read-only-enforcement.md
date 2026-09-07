---
title: 읽기 전용 강제 (문장 가드·트랜잭션·다층 방어)
source: https://www.postgresql.org/docs/current/sql-set-transaction.html
last_fetched: 2026-06-25
consumers: [nl-sql-guardian, postgres-dba]
---

# KB: 읽기 전용 강제

> 참고 출처: PostgreSQL `SET TRANSACTION`(READ ONLY), `default_transaction_read_only`(runtime config),
> OWASP *SQL Injection Prevention*(allow-list 설계).

## 세 층 방어 (모두 필요 — 하나라도 비면 결함)

1. **문장 가드(애플리케이션, 빠른 거부)**
   - **화이트리스트**: 시작 토큰이 `SELECT` / `WITH`(읽기 CTE) / (필요시 `TABLE`/`VALUES`)인 것만 통과. 그 외 전부 거부.
   - **멀티스테이트먼트 거부**: 마스킹 후 `;`로 분리해 문장이 둘 이상이면 거부(단일 SELECT 보장).
   - **금지 키워드 거부**: `INSERT/UPDATE/DELETE/MERGE/UPSERT/TRUNCATE/DROP/CREATE/ALTER/GRANT/REVOKE/COPY/INTO`.
     데이터 변경 CTE(`WITH ... AS (INSERT ...)`)·`SELECT INTO`도 이 키워드로 막힌다.
   - **행잠금 거부**: `FOR UPDATE/SHARE/NO KEY UPDATE/KEY SHARE` 명시 차단(별도 KB 참조).
2. **드라이버/세션 트랜잭션(엔진 보장)**
   - `SET TRANSACTION READ ONLY` 또는 `default_transaction_read_only=on`으로 세션 차원 쓰기 차단.
   - 가드를 우회한 문장도 엔진이 거부 → 하드 보장 층.
3. **최소권한 롤(엔진 보장)** — `least-privilege-db-role.md` 참조.

## 안티패턴
- 가드 정규식 **하나만** 두고 롤/트랜잭션이 없는 경우 → 단일 실패점(가드 우회 시 무방비). HIGH.
- 블랙리스트("DROP 문자열 제거")로 막으려는 시도 → 주석·인코딩·공백으로 우회됨. 화이트리스트로.
- "쓰기는 작성만 하고 실행 안 함"이라면서 같은 코드 경로가 실제로 `execute()`까지 가는 경우.

## 리뷰 훅
- [ ] 가드가 SELECT/WITH **화이트리스트**인가(블랙리스트 아님). 시작 토큰을 검사하는가.
- [ ] 멀티스테이트먼트(`;`)를 거부하는가. 마스킹 후 검사인가.
- [ ] 쓰기/DDL 키워드(INSERT…REVOKE, `INTO`)를 거부하는가.
- [ ] 읽기전용 **트랜잭션**(SET TRANSACTION READ ONLY / default_transaction_read_only)이 걸리는가.
- [ ] 가드·트랜잭션·롤 **세 층**이 모두 존재하는가(하나라도 부재 시 결함으로 지적).
