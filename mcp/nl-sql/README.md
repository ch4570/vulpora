# nl-sql MCP — 멀티-dialect 자연어→SQL (읽기 전용)

자연어 데이터 질문을 **PostgreSQL · MySQL · Microsoft SQL Server** 읽기 전용 조회로 안전하게 처리하는 MCP 서버. 하나의 서버가 **설정의 `dialect` 1개**를 골라 해당 DB에 붙는다(여러 DB를 쓰면 인스턴스를 여러 개 등록).

> **설계 원칙**: 자연어 → SQL 변환은 *호출 LLM(Claude)* 이 한다. MCP는 LLM에게 ① 스키마 맥락과
> ② dialect별 안전 실행기를 **도구로 제공**한다. MCP가 직접 LLM을 호출하지 않는다(올바른 MCP 경계).

## 무엇을 하나
"지난주 가입한 회원 수 알려줘" 같은 자연어 →
1. `search_objects`/`list_tables`/`describe_table` 로 스키마 파악,
2. **dialect에 맞는** `SELECT` 작성(따옴표·LIMIT/TOP·자리표시자),
3. `run_select` 로 가드된 읽기 전용 실행 → 결과 표.

## 노출 도구
| 도구 | 설명 |
|---|---|
| `list_schemas` | 스키마 + 테이블 수 |
| `list_tables` | 스키마의 테이블/뷰 |
| `describe_table` | 컬럼(타입/NULL/기본값)·PK·FK |
| `search_objects` | 키워드로 테이블/컬럼 검색(pg=ILIKE, mysql/mssql=LIKE) |
| `run_select` | 단일 SELECT/WITH 읽기 전용 실행(허용된 `schema.table` 필수, 자동 행 캡/타임아웃). 자리표시자는 dialect별(`$1`/`?`/`@p1`) |
| `explain_select` | 실행계획만(pg/mysql). **SQL Server 미지원** |

## 안전 모델 (다층 방어)
1. **정적 가드 (`guard.ts`, dialect 인지)** — 문자열/주석/식별자 따옴표(`"x"`·`` `x` ``(mysql)·`[x]`(mssql))·달러인용을 dialect 규칙대로 마스킹한 뒤 검사: 단일 문장만, 첫 토큰 `SELECT`/`WITH`, DML/DDL 키워드 + **dialect별 위험함수**(pg `pg_read_file`/`nextval`/`dblink`, mysql `load_file`/`sleep`/`benchmark`, mssql `xp_cmdshell`/`openrowset`/`waitfor` …) + **행 잠금 절**(`FOR UPDATE`/`FOR SHARE`/`FOR KEY SHARE`) 차단. 실행형 주석·중첩/미종결 구문처럼 엔진별 해석이 엇갈리는 입력도 거부한다.
2. **스키마 allowlist (`schema-policy.ts`)** — `allowedSchemas`는 필수이며 빈 목록은 서버 시작을 거부한다. 인트로스펙션의 모든 경로와 `run_select`/`explain_select`에 동일하게 적용한다. 물리 테이블은 반드시 `schema.table`로 한정해야 하며, 미한정 이름(search path/default schema), 교차 DB 이름, 테이블 반환 함수, 쉼표 조인은 보수적으로 거부한다. CTE와 테이블 없는 SELECT는 지원한다.
3. **드라이버 읽기 전용 실행** — DB별로 다르다(정직 고지):

   | dialect | 읽기 전용 보장 | 방식 |
   |---|---|---|
   | **PostgreSQL** | **엔진 하드 보장** | `BEGIN TRANSACTION READ ONLY` + `ROLLBACK` 시도, 실패 시 연결 폐기. 쓰기는 PG가 직접 거부 |
   | **MySQL** | **엔진 하드 보장** | `START TRANSACTION READ ONLY` + `ROLLBACK` 시도, 실패 시 연결 폐기(5.6.5+). 쓰기는 MySQL이 거부 |
   | **SQL Server** | **소프트(엔진 모드 없음)** | 가드 + **읽기 전용 로그인(필수)** + 트랜잭션 `ROLLBACK`. ⚠️ 트랜잭션 읽기전용 모드가 없으므로 **반드시 db_datareader 권한만 가진 로그인**으로 접속 |

4. **자원 한계** — statement timeout(기본 5s; pg `statement_timeout`, mysql `MAX_EXECUTION_TIME`, mssql `requestTimeout`), 반환 행 하드 캡(기본 100), 셀 절단, **파라미터 바인딩**으로 인젝션 회피.
   MySQL의 시간 제한 설정이 실패하면 조회와 시작 시 연결 확인도 거부합니다. 이를 지원하지
   않는 MySQL 호환 서버에서 제한 없이 계속 실행하는 fallback은 제공하지 않습니다.
   SQL Server 가드는 트랜잭션·세션·관리 제어문을 차단하지만 완전한 T-SQL 문법 분석기는
   아니므로 읽기 전용 DB 권한은 계속 필요합니다.
5. **오류 위생** — DB 드라이버 원문 오류·호스트·사용자·연결 문자열은 MCP 응답이나 stderr로 전달하지 않는다. 외부에는 `NLSQL_DB_QUERY_FAILED` 같은 안정적인 오류 코드만 노출한다.
6. **최소 권한 접속(운영 필수)** — 아래 dialect별 읽기 전용 역할.

> 가드 단독을 신뢰하지 않는다. PG/MySQL은 엔진 보장이 진짜 안전선이고, **MSSQL은 읽기 전용 로그인이 안전선**이다.

CTE 이름은 선언 순서와 쿼리 범위에 따라 해석한다. PostgreSQL/MySQL의 비재귀 CTE 본문은
이전에 선언한 형제 CTE와 바깥 범위의 CTE만 참조할 수 있다. 자기 이름이나 미래 CTE 이름을
붙여도 미한정 물리 테이블 검사를 면제하지 않는다. 예를 들어
`WITH pg_settings AS (SELECT * FROM pg_settings) SELECT * FROM pg_settings`는 거부한다.
중첩 `WITH`의 이름은 해당 쿼리 밖으로 노출되지 않는다.

| dialect | 재귀 CTE 본문에서 보이는 이름 | 중첩 `WITH` |
|---|---|---|
| PostgreSQL `WITH RECURSIVE` | 자신과 같은 `WITH`의 모든 형제(뒤에 선언한 CTE 포함), 바깥 범위 | 지원 |
| MySQL `WITH RECURSIVE` | 자신과 이전 형제, 바깥 범위 | 지원 |
| SQL Server `WITH` | 자신과 이전 형제(별도 `RECURSIVE` 키워드 없음) | 거부 |

범위 규칙의 근거는 [PostgreSQL WITH 문서](https://www.postgresql.org/docs/current/sql-select.html#SQL-WITH)와
[공식 parser의 비재귀 처리](https://doxygen.postgresql.org/parse__cte_8c_source.html#l00215),
[MySQL WITH 문서](https://dev.mysql.com/doc/refman/8.4/en/with.html),
[SQL Server CTE 문서](https://learn.microsoft.com/en-us/sql/t-sql/queries/with-common-table-expression-transact-sql?view=sql-server-ver17)다.
이 검사는 CTE 이름의 접근 범위를 검증하며, 전체 SQL 문법이나 재귀 쿼리의 적합성까지 증명하지는 않는다.
중복 이름·해석할 수 없는 CTE 헤더는 실행 전에 거부하고, 나머지 문법·권한 검사는 DB 엔진에도 맡긴다.

PostgreSQL/MySQL의 따옴표·스키마 한정이 없는 `EXTRACT`, `SUBSTRING`, `TRIM` 호출에서는
해당 인자 괄호 최상위의 `FROM`을 표현식 구분자로 처리한다. 예를 들어
`SELECT EXTRACT(YEAR FROM created_at) FROM public.orders`의 `created_at`은 물리 테이블이 아니다.
함수 내부의 중첩 SELECT/TABLE·CTE 범위와 스키마 한정 함수·금지 함수 검사는 그대로 유지한다.
임의의 함수나 다른 dialect에 이 예외를 확대하지 않는다. 문법 근거는
[PostgreSQL EXTRACT](https://www.postgresql.org/docs/current/functions-datetime.html#FUNCTIONS-DATETIME-EXTRACT),
[PostgreSQL 문자열 함수](https://www.postgresql.org/docs/current/functions-string.html),
[MySQL EXTRACT](https://dev.mysql.com/doc/refman/8.4/en/date-and-time-functions.html#function_extract),
[MySQL 문자열 함수](https://dev.mysql.com/doc/refman/8.4/en/string-functions.html#function_substring)다.

문자열·주석 경계는 두 정적 검사기에서 같은 dialect 규칙을 사용한다. PostgreSQL/SQL Server의
`--` 주석은 CR·LF·CRLF에서 끝나지만, MySQL의 `--`/`#` 주석은 LF까지 이어진다.
PostgreSQL의 `$한글$...$한글$` 같은 비ASCII 달러 태그도 문자열로 처리하여 내부의 `FROM`/`LIMIT`이
스키마 검사나 행 제한 판단에 영향을 주지 않게 한다. `$1` 파라미터와 식별자에 붙은 `$tag$`는
달러 인용 시작이 아니며, 열린 달러 인용의 미종료·태그 대소문자 불일치는 실행 전에 거부한다.
근거는 [PostgreSQL lexer](https://github.com/postgres/postgres/blob/master/src/backend/parser/scan.l),
[SQL Server 주석 문서](https://learn.microsoft.com/en-us/sql/t-sql/language-elements/comment-transact-sql?view=sql-server-ver17),
[MySQL 8.4 lexer의 MY_LEX_COMMENT](https://github.com/mysql/mysql-server/blob/8.4/sql/sql_lex.cc)다.

MySQL의 `--` 시작은 다음 ASCII 공백·제어 바이트(`0x01..0x20`, `0x7f`) 또는 입력 끝으로 판정한다.
NBSP 같은 Unicode 공백을 주석 시작으로 처리하지 않는다. 기본 mysql2 연결은
[UTF-8/utf8mb4](https://github.com/sidorares/node-mysql2/blob/v3.24.3/lib/connection_config.js)를 사용하며,
[MySQL 문자 분류](https://github.com/mysql/mysql-server/blob/mysql-8.4.0/strings/ctype-uca.cc#L5728-L5745)는
그 첫 바이트를 공백이 아닌 식별자 문자로 본다. SQL 텍스트의 embedded NUL은 MySQL에서 보수적으로
거부한다(주석·리터럴 내부도 포함). 데이터의 NUL은 SQL에 직접 넣지 않고 `params`로 바인딩할 수 있다.

스키마·테이블·CTE 이름은 기존의 128자 이하 ASCII 식별자 범위만 지원한다. 비ASCII 접미사까지
하나의 이름으로 읽은 뒤 검증하므로 `seedé.orders`를 CTE `seed`로 면제하지 않는다. SQL Server도
[Unicode 문자 식별자](https://learn.microsoft.com/en-us/sql/relational-databases/databases/database-identifiers)를
허용하므로 이 이름 경계 검사는 세 dialect에 적용한다. PostgreSQL/MySQL의 인용·주석 밖 비ASCII
공백은 삭제하지 않고 거부하여 `public`과 `public`+NBSP 스키마를 혼동하지 않는다.
입력 앞뒤·종료 세미콜론을 정리할 때도 ASCII 공백만 제거하여 관계 이름의 NBSP를 보존한다. 따라서 이전에
우연히 통과하던 Unicode 관계 이름·인용 별칭은 지원을 보장하지 않는다. 일반 Unicode 컬럼 표현식,
문자열과 PostgreSQL 달러 인용의 데이터는 유지한다. SQL Server의 공백 분류는 이번 수정에서
기존 동작을 유지하며, 이 보수적 검사가 엔진의 모든 Unicode·문법 규칙을 구현한다는 뜻은 아니다.

### 트랜잭션 정리와 연결 재사용

PostgreSQL/MySQL은 연결을 획득한 뒤 설정·조회가 실패해도 `ROLLBACK`을 시도한다.
성공한 rollback 뒤에만 정상 `release()`하며, 실패하면 PostgreSQL은
[`release(true)`](https://node-postgres.com/apis/pool#releasing-clients), MySQL은
[`destroy()`](https://github.com/sidorares/node-mysql2/blob/master/lib/pool_connection.js)로
해당 연결의 풀 재사용을 차단한다. 폐기 뒤에 정상 반환을 추가로 시도하지 않는다.
조회가 성공하고 폐기 API가 정상 반환하면 조회 결과를 유지하지만, 이것이 서버의 rollback 완료를
증명하지는 않는다. 설정·조회에서 발생한 최초 오류는 정리 오류가 덮지 않으며,
최초 오류 없이 반환·폐기 자체가 실패하면 조회도 실패한다. 연결 획득 실패에는 정리를 실행하지 않는다.

SQL Server는 별도 한계가 있다. 감사한 node-mssql 12.7.0의
[Transaction 구현](https://github.com/tediousjs/node-mssql/blob/master/lib/tedious/transaction.js)은
rollback 콜백이 오류를 반환해도 먼저 연결을 풀에 돌려주며, 현재 드라이버는 이 rollback 오류를 무시한다.
기본 `SELECT 1` 건강 검사는 트랜잭션 정리를 보증하지 않는다. fake 전송과 실제 풀을 조합한 감사에서
미종료 트랜잭션 상태의 연결 재사용이 재현됐으며, PostgreSQL/MySQL의 폐기 보장을 SQL Server에
적용한 것으로 보아서는 안 된다. 공개 Transaction API에 동일한 연결별 폐기 기능이 없어 별도 개선이 필요하다.

### 읽기 전용 역할 (dialect별)
```sql
-- PostgreSQL
CREATE ROLE readonly_user LOGIN PASSWORD 'CHANGE_ME';
GRANT CONNECT ON DATABASE app TO readonly_user;
GRANT USAGE ON SCHEMA public TO readonly_user;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO readonly_user;
```
```sql
-- MySQL
CREATE USER 'readonly_user'@'%' IDENTIFIED BY 'CHANGE_ME';
GRANT SELECT ON app.* TO 'readonly_user'@'%';
```
```sql
-- SQL Server (읽기 전용 로그인 — MSSQL 안전의 핵심)
CREATE LOGIN readonly_user WITH PASSWORD = 'CHANGE_ME';
USE app;
CREATE USER readonly_user FOR LOGIN readonly_user;
ALTER ROLE db_datareader ADD MEMBER readonly_user;   -- SELECT만. db_datawriter/ddladmin 주지 말 것
```

## 설치 / 빌드
vulpora 설치기로 받았다면 소스만 복사된다(`node_modules`/`dist` 미포함). 대상에서 빌드:
```bash
cd mcp/nl-sql
npm install          # pg · mysql2 · mssql · dotenv · zod · MCP SDK
npm run build        # tsc → dist/index.js
npm test             # build + fake DB 기반 단위 테스트
```

## 접속 정보(DB 연결)는 어떻게 주나
**우선순위: 환경변수(.mcp.json env / 셸 export / .env) > JSON 설정 파일 > 기본값.** 읽기 좋은 **JSON 한 파일**에 다 적어도 되고(권장), 비밀만 환경변수로 덮어써도 된다.

### 방법 A (권장 · 표준 JSON) — `nl-sql.config.json`
패키지 디렉터리에 둔다(cwd 무관 자동 로드). 비밀 포함이라 `.gitignore` 됨.
```bash
cp nl-sql.config.example.json nl-sql.config.json
```
```jsonc
// PostgreSQL
{ "dialect": "postgres", "connectionString": "postgresql://readonly_user:비밀@localhost:5432/app",
  "ssl": "require", "allowedSchemas": ["public"], "limits": { "maxRows": 100 } }
```
```jsonc
// MySQL  (스키마=데이터베이스. allowedSchemas 에 DB명)
{ "dialect": "mysql", "host": "localhost", "port": 3306, "database": "app",
  "user": "readonly_user", "password": "비밀", "allowedSchemas": ["app"] }
```
```jsonc
// SQL Server  (개별 필드 권장. 스키마=dbo 등)
{ "dialect": "mssql", "host": "localhost", "port": 1433, "database": "app",
  "user": "readonly_user", "password": "비밀", "ssl": "require", "allowedSchemas": ["dbo"] }
```
- 다른 경로면 `NLSQL_CONFIG=/abs/path.json`. JSON 이 깨지면 부팅 시 명확한 사유로 멈춘다.

### 방법 B — `.env` 파일 (대안)
```ini
NLSQL_DIALECT=mysql
PGHOST=localhost
PGPORT=3306
PGDATABASE=app
PGUSER=readonly_user
PGPASSWORD=비밀
NLSQL_ALLOWED_SCHEMAS=app
```
(환경변수 이름은 호환을 위해 `PG*` 접두사를 모든 dialect에 공통 사용한다.)

### 방법 C — `.mcp.json` 의 `env` (Claude Code 등록)
대상 레포 루트 `.mcp.json`. 비밀은 방법 A에 두고 여기선 안 적어도 된다. 비밀을 주입하려면 `${VAR}` 확장 사용(평문 커밋 금지).
```json
{
  "mcpServers": {
    "nl-sql": {
      "command": "node",
      "args": ["./mcp/nl-sql/dist/index.js"],
      "env": { "NLSQL_DIALECT": "mssql", "PG_CONNECTION_STRING": "${MY_DB_URL}" }
    }
  }
}
```
> 여러 DB를 동시에 쓰려면 서버를 여러 개 등록한다(예: `nl-sql-pg`, `nl-sql-mysql`, `nl-sql-mssql` — 각자 다른 `NLSQL_CONFIG`/`NLSQL_DIALECT`).

### 설정 키
| JSON | 환경변수 | 기본 | 설명 |
|---|---|---|---|
| `dialect` | `NLSQL_DIALECT` | `postgres` | `postgres`\|`mysql`\|`mssql` |
| `connectionString` | `PG_CONNECTION_STRING` | — | pg/mysql 연결 문자열 |
| `host`/`port`/`database`/`user`/`password` | `PGHOST`/`PGPORT`/`PGDATABASE`/`PGUSER`/`PGPASSWORD` | dialect 기본 포트 | 개별 필드 |
| `ssl` | `PGSSLMODE` | `prefer` | `require`=암호화, `verify-ca`/`verify-full`=**서버 인증서 검증 강제**(MITM 방지) |
| `allowedSchemas` | `NLSQL_ALLOWED_SCHEMAS`(CSV) | **필수** | 조회 허용 스키마. 빈 목록은 시작 거부. mysql=DB명, mssql=dbo 등 |
| `limits.maxRows` | `NLSQL_MAX_ROWS` | `100` | 반환 행 하드 캡 |
| `limits.statementTimeoutMs` | `NLSQL_STATEMENT_TIMEOUT_MS` | `5000` | 쿼리 타임아웃(ms) |
| `limits.maxCellChars` | `NLSQL_MAX_CELL_CHARS` | `2000` | 셀 출력 최대 문자 |

### 비밀 위생 (필수)
- **읽기 전용 역할로만 접속**(특히 MSSQL은 이게 유일한 엔진 안전선).
- 비밀 든 `nl-sql.config.json`·`.env`·`.mcp.json` **커밋 금지**(앞 둘은 이미 `.gitignore`). 공유는 `*.example` 로만.
- 비밀은 로그·툴 응답에 노출되지 않는다.

## 한계 (정직 고지)
- **MSSQL 읽기 전용은 소프트**다(엔진 트랜잭션 읽기전용 모드 부재). 가드+ROLLBACK은 보조이고, **db_datareader 전용 로그인**이 실질 보장이다. 반드시 그렇게 접속하라.
- allowlist를 정적으로 증명할 수 있도록 실행 SQL의 물리 테이블은 항상 `schema.table`로 써야 한다. 쉼표 조인은 명시적 `JOIN`으로 바꾸고, 테이블 반환 함수가 필요하면 별도의 좁은 도구로 노출하는 방식을 권장한다.
- 행 캡: pg/mysql 은 외곽 제한이 없을 때 `LIMIT` 주입 + 결과 절단. CTE·서브쿼리 안의 제한은 외곽 제한으로 취급하지 않으며, PostgreSQL의 외곽 `FETCH FIRST/NEXT`도 인식한다. 사용자가 명시한 외곽 제한(큰 값이나 `LIMIT ALL` 포함)은 다시 쓰지 않는다. **mssql 은 `LIMIT` 미지원이라 결과 절단만** — 큰 결과는 쿼리에 `TOP (n)`/`OFFSET..FETCH` 를 직접 넣는 게 좋다. 명시한 제한이 크거나 없는 경우 드라이버가 큰 결과를 버퍼링한 뒤 절단할 수 있으므로 메모리에 주의(타임아웃이 먼저 끊을 수 있음).
- `explain_select` 는 pg/mysql만. SQL Server는 미지원(SSMS/`SET SHOWPLAN_XML` 사용).
- fake 드라이버 단위 테스트로 가드·allowlist·인트로스펙션·오류 비노출을 검증한다. **실제 3개 엔진 연결 통합 테스트는 사용자 환경의 DB에서 수행**해야 한다.
- NL→SQL 작성·실행·표시 워크플로는 `nl-sql-query` 스킬을 함께 쓴다. 정적 스키마 문서(ERD/명세)는 `schema-cartographer` 에이전트 + `schema-doc-extract` 스킬.
