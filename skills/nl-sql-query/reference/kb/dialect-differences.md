---
title: dialect 차이 (PostgreSQL / MySQL / MS-SQL)
source: https://www.postgresql.org/docs/current/ · https://dev.mysql.com/doc/refman/8.0/en/ · https://learn.microsoft.com/en-us/sql/t-sql/
last_fetched: 2026-06-24
skills: [nl-sql-query]
---

# KB: dialect 차이 — PostgreSQL vs MySQL vs MS-SQL

> 이 스킬의 **핵심 산출물**. 같은 질문이라도 dialect에 따라 문법이 다르다. 활성 dialect를 확정하고
> 아래 규칙대로만 작성한다. 단정의 근거는 각 DB 공식 문서(`source`).

## 핵심 비교표

| 항목 | PostgreSQL | MySQL (8.0) | MS-SQL (T-SQL) |
|------|-----------|-------------|----------------|
| 식별자 따옴표 | `"col"` (큰따옴표) | `` `col` `` (백틱) | `[col]` (대괄호) |
| 행 제한(상위 N) | `LIMIT n` | `LIMIT n` | `SELECT TOP (n) ...` |
| 페이지네이션 | `LIMIT n OFFSET m` | `LIMIT m, n` 또는 `LIMIT n OFFSET m` | `ORDER BY ... OFFSET m ROWS FETCH NEXT n ROWS ONLY` |
| 표준 OFFSET/FETCH | `OFFSET m ROWS FETCH NEXT n ROWS ONLY` (지원) | 미지원(LIMIT 사용) | `OFFSET m ROWS FETCH NEXT n ROWS ONLY` (지원) |
| 자리표시자 | `$1, $2, ...` | `?` (위치 기반) | `@p1, @p2, ...` |
| 문자열 연결 | `a \|\| b` | `CONCAT(a, b)` (`\|\|`는 기본적으로 OR) | `a + b` 또는 `CONCAT(a, b)` |
| 현재 시각 | `now()`, `CURRENT_TIMESTAMP` | `NOW()`, `CURRENT_TIMESTAMP` | `SYSDATETIME()`, `GETDATE()`, `CURRENT_TIMESTAMP` |
| 날짜 자르기(월 단위 등) | `date_trunc('month', ts)` | `DATE_FORMAT(ts, '%Y-%m-01')` | `DATEFROMPARTS(YEAR(ts), MONTH(ts), 1)` |
| 날짜 부분 추출 | `EXTRACT(YEAR FROM ts)` | `YEAR(ts)` / `EXTRACT(YEAR FROM ts)` | `DATEPART(YEAR, ts)` / `YEAR(ts)` |
| 불리언 | 네이티브 `boolean` (`true`/`false`) | `TINYINT(1)`로 저장, `1`/`0` | 네이티브 없음, `BIT` (`1`/`0`) |
| 식별자 폴딩(따옴표 없을 때) | **소문자**로 폴딩 | 플랫폼·`lower_case_table_names`에 의존 | 대소문자 유지(콜레이션이 비교 민감도 결정, 기본 대소문자 무시) |
| 문자열 비교 대소문자 | 기본 대소문자 구분 | 기본 콜레이션은 대소문자 무시(`_ci`) | 기본 콜레이션은 대소문자 무시 |
| `information_schema` | 지원(+ `pg_catalog`) | 지원 | 지원(+ catalog views `sys.*`) |
| NULL 안전 비교 | `IS NOT DISTINCT FROM` | `<=>` (NULL-safe equal) | `IS NOT DISTINCT FROM`(신버전) 또는 명시적 `IS NULL` 처리 |

## 행 제한 / 페이지네이션 상세
- **PostgreSQL / MySQL**: `LIMIT`. PostgreSQL은 표준 `OFFSET..FETCH`도 지원. MySQL의 `LIMIT m, n`은 `offset=m, count=n`이다(순서 주의).
- **MS-SQL**: 상위 N은 `SELECT TOP (n) ...`. **페이지네이션은 `TOP`이 아니라 `OFFSET m ROWS FETCH NEXT n ROWS ONLY`** 이며 `ORDER BY`가 **필수**다. `TOP`과 `OFFSET..FETCH`는 같이 못 쓴다.

```sql
-- 상위 10건
-- PostgreSQL / MySQL
SELECT * FROM "order" ORDER BY created_at DESC LIMIT 10;
-- MS-SQL
SELECT TOP (10) * FROM [order] ORDER BY created_at DESC;

-- 2페이지(11~20행, 페이지당 10)
-- PostgreSQL
SELECT * FROM "order" ORDER BY order_id LIMIT 10 OFFSET 10;
-- MySQL
SELECT * FROM `order` ORDER BY order_id LIMIT 10, 10;
-- MS-SQL
SELECT * FROM [order] ORDER BY order_id OFFSET 10 ROWS FETCH NEXT 10 ROWS ONLY;
```

## 자리표시자 (파라미터 바인딩)
값은 항상 바인딩한다. 활성 dialect 문법을 따른다.

```sql
-- PostgreSQL   params: ['%@example.com']
SELECT member_id, email FROM member WHERE email LIKE $1;
-- MySQL        params: ['%@example.com']
SELECT member_id, email FROM member WHERE email LIKE ?;
-- MS-SQL       params: ['%@example.com']
SELECT member_id, email FROM [member] WHERE email LIKE @p1;
```

## 문자열 연결
```sql
-- PostgreSQL
SELECT first_name || ' ' || last_name AS full_name FROM member;
-- MySQL  (||는 기본적으로 논리 OR 이므로 CONCAT 사용)
SELECT CONCAT(first_name, ' ', last_name) AS full_name FROM member;
-- MS-SQL  (+ 또는 CONCAT; CONCAT은 NULL을 ''로 처리)
SELECT CONCAT(first_name, ' ', last_name) AS full_name FROM [member];
```

## 날짜 함수 (월별 집계 예시 — 일반 엔티티)
```sql
-- PostgreSQL
SELECT date_trunc('month', created_at) AS m, COUNT(*) AS cnt
FROM "order" GROUP BY m ORDER BY m;
-- MySQL
SELECT DATE_FORMAT(created_at, '%Y-%m-01') AS m, COUNT(*) AS cnt
FROM `order` GROUP BY m ORDER BY m;
-- MS-SQL
SELECT DATEFROMPARTS(YEAR(created_at), MONTH(created_at), 1) AS m, COUNT(*) AS cnt
FROM [order] GROUP BY DATEFROMPARTS(YEAR(created_at), MONTH(created_at), 1)
ORDER BY m;
```

## 불리언 처리
- **PostgreSQL**: `WHERE is_active = true` (또는 `WHERE is_active`).
- **MySQL**: `TINYINT(1)`에 매핑 → `WHERE is_active = 1`. `TRUE`/`FALSE` 리터럴은 `1`/`0`의 별칭.
- **MS-SQL**: `BIT` → `WHERE is_active = 1`. boolean 타입이 없으므로 `= 1`/`= 0`로 비교한다.

## 리뷰 훅
- [ ] 활성 dialect를 확정하고 그 dialect 문법만 썼는가(따옴표 `"x"`/`` `x` ``/`[x]`).
- [ ] 행 제한을 dialect에 맞게 썼는가(`LIMIT` vs `TOP (n)` vs `OFFSET..FETCH`).
- [ ] MS-SQL 페이지네이션에 `ORDER BY` + `OFFSET..FETCH`를 썼는가(`TOP`과 혼용 금지).
- [ ] 자리표시자를 dialect 문법으로 썼는가(`$1` / `?` / `@p1`).
- [ ] 문자열 연결을 dialect에 맞게 썼는가(MySQL은 `||`가 OR이므로 `CONCAT`).
- [ ] 날짜·불리언 함수를 dialect 함수로 썼는가(`date_trunc`/`DATE_FORMAT`/`DATEPART` 등).
- [ ] 대소문자·식별자 폴딩 차이를 고려했는가(문자열 비교 콜레이션·따옴표 없는 식별자 폴딩).
