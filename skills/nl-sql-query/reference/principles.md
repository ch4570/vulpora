# 자연어 → SQL 질의 핵심 원칙 (Principles)

> 자연어 데이터 질문을 정확하고 안전한 읽기 전용 SQL로 옮기기 위한 판단 기준("헌법").
> KB(공식 문서 distill)가 "사실·규칙"이라면 이 문서는 "통찰·판단 기준"이다. 충돌 시 **KB(공식 문서)가 우선**.
>
> **출처(Sources)**
> - PostgreSQL Documentation — https://www.postgresql.org/docs/current/
> - MySQL 8.0 Reference Manual — https://dev.mysql.com/doc/refman/8.0/en/
> - Microsoft SQL Server (Transact-SQL) Documentation — https://learn.microsoft.com/en-us/sql/t-sql/
> - SQL 자리표시자·읽기 전용 안전성·결과 제시 규약은 내부 방법론(이 스킬 KB)과 연계.

---

## 0. 대전제: 도구로 운전하고, 재구현하지 않는다

- DB 연결·실행은 `nl-sql` MCP가 담당한다. 이 스킬은 **MCP를 운전하는 방법**이다.
- 스키마·결과는 항상 도구(`search_objects`/`describe_table`/`run_select`)에서 나온다.

## 1. 스키마는 추측하지 말고 도구로 확인한 뒤 작성한다

- 컬럼명·타입·NULL 여부·PK/FK는 `describe_table`로 **확정**하고 나서 SQL을 쓴다.
- 기억·관례로 컬럼명을 지어내지 않는다. NL 용어→스키마 매핑은 `search_objects`로 먼저 후보를 좁힌다.
- "컬럼 없음" 에러는 추측 수정 대상이 아니라 `describe_table` 재확인 신호다.

## 2. dialect 규칙을 준수한다 — 틀린 dialect 문법은 즉시 실패

- PostgreSQL / MySQL / MS-SQL은 식별자 따옴표, 행 제한(`LIMIT` vs `TOP`/`OFFSET..FETCH`), 자리표시자, 문자열 연결, 날짜함수가 다르다.
- 활성 dialect를 먼저 확정하고 그 문법으로만 작성한다. 다른 dialect 문법을 섞으면 파싱·실행이 실패한다(상세: KB `dialect-differences`).

## 3. 값은 파라미터로 바인딩한다 (문자열 연결 금지)

- 검색어·날짜·ID 등 모든 리터럴 값은 `params[]`로 전달하고 SQL엔 자리표시자만 둔다.
- 문자열 연결로 값을 SQL에 박으면 인젝션·따옴표 오류·타입 불일치 위험이 생긴다.

## 4. 읽기 전용 불변 — 쓰기는 만들되 실행하지 않는다

- `run_select`는 SELECT/WITH만 실행한다. INSERT/UPDATE/DELETE/DDL은 **작성해 보여주되 실행하지 않는다.**
- 쓰기 요청은 영향을 경고하고 "이 스킬·MCP는 실행하지 않음"을 알린 뒤 **사용자 승인**을 요구한다.

## 5. 결과엔 항상 "사용한 SQL"과 한계를 명시한다

- 결과 표와 함께 실행한 SQL(코드블록), 행수/절단(자동 행 캡) 여부, 추정·가정을 명시한다.
- 집계·필터 가정(예: "상태값을 status로 가정")을 숨기지 않는다. PII 컬럼은 과다 노출을 자제한다(KB `result-presentation`).

## 6. 모호하면 가정하지 말고 묻는다

- 기간·범위·정렬·집계 단위가 불명확하면 1–2개 명확화 질문을 한 뒤 작성한다.
- 결과가 0건이면 필터/조인/컬럼을 재점검하고, 필요하면 사용자에게 의도를 확인한다.
