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
   | **PostgreSQL** | **엔진 하드 보장** | `BEGIN TRANSACTION READ ONLY` + 항상 `ROLLBACK`. 쓰기는 PG가 직접 거부 |
   | **MySQL** | **엔진 하드 보장** | `START TRANSACTION READ ONLY` + `ROLLBACK`(5.6.5+). 쓰기는 MySQL이 거부 |
   | **SQL Server** | **소프트(엔진 모드 없음)** | 가드 + **읽기 전용 로그인(필수)** + 트랜잭션 `ROLLBACK`. ⚠️ 트랜잭션 읽기전용 모드가 없으므로 **반드시 db_datareader 권한만 가진 로그인**으로 접속 |

4. **자원 한계** — statement timeout(기본 5s; pg `statement_timeout`, mysql `MAX_EXECUTION_TIME`, mssql `requestTimeout`), 반환 행 하드 캡(기본 100), 셀 절단, **파라미터 바인딩**으로 인젝션 회피.
5. **오류 위생** — DB 드라이버 원문 오류·호스트·사용자·연결 문자열은 MCP 응답이나 stderr로 전달하지 않는다. 외부에는 `NLSQL_DB_QUERY_FAILED` 같은 안정적인 오류 코드만 노출한다.
6. **최소 권한 접속(운영 필수)** — 아래 dialect별 읽기 전용 역할.

> 가드 단독을 신뢰하지 않는다. PG/MySQL은 엔진 보장이 진짜 안전선이고, **MSSQL은 읽기 전용 로그인이 안전선**이다.

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
- 행 캡: pg/mysql 은 `LIMIT` 주입(외곽 LIMIT 없을 때) + 결과 절단. **mssql 은 `LIMIT` 미지원이라 결과 절단만** — 큰 결과는 쿼리에 `TOP (n)`/`OFFSET..FETCH` 를 직접 넣는 게 좋다. 매우 큰 결과는 드라이버가 전 행 버퍼링 후 절단하므로 메모리에 주의(타임아웃이 먼저 끊을 수 있음).
- `explain_select` 는 pg/mysql만. SQL Server는 미지원(SSMS/`SET SHOWPLAN_XML` 사용).
- fake 드라이버 단위 테스트로 가드·allowlist·인트로스펙션·오류 비노출을 검증한다. **실제 3개 엔진 연결 통합 테스트는 사용자 환경의 DB에서 수행**해야 한다.
- NL→SQL 작성·실행·표시 워크플로는 `nl-sql-query` 스킬을 함께 쓴다. 정적 스키마 문서(ERD/명세)는 `schema-cartographer` 에이전트 + `schema-doc-extract` 스킬.
