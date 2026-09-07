---
title: 최소권한 DB 롤
source: https://www.postgresql.org/docs/current/ddl-priv.html
last_fetched: 2026-06-25
consumers: [nl-sql-guardian]
---

# KB: 최소권한 DB 롤

> 참고 출처: PostgreSQL *Privileges*(GRANT/REVOKE), *Database Roles*,
> OWASP(최소권한 원칙), `SECURITY DEFINER` 함수의 `search_path` 고정.

## 규칙

1. **애플리케이션 롤에 `SELECT`만 부여.** NL→SQL 표면이 쓰는 DB 롤은 INSERT/UPDATE/DELETE/DDL 권한이 없어야 한다.
   엔진이 쓰기를 거부하므로 가드를 우회한 문장도 막힌다(읽기 전용의 하드 보장 층).
2. **REVOKE로 기본권한 회수.** PUBLIC/기본 스키마 권한을 회수하고, 필요한 객체에만 SELECT를 명시 GRANT.
   ```sql
   -- 예시(일반 엔티티)
   REVOKE ALL ON ALL TABLES IN SCHEMA app FROM app_reader;
   GRANT USAGE ON SCHEMA app TO app_reader;
   GRANT SELECT ON app."order", app.member, app.article TO app_reader;
   ```
3. **소유자/슈퍼유저로 접속 금지.** 마이그레이션·관리 롤과 질의 롤을 분리한다.
4. **`search_path` 고정.** `SECURITY DEFINER` 함수·세션은 `search_path`를 고정해 스키마 탈취를 막는다.
5. **시크릿 관리.** 접속정보(비밀번호/토큰)는 환경변수/시크릿 매니저로 주입. 소스·로그·출력에 하드코딩 금지.
   리뷰에서 발견 시 redaction + "시크릿 노출"로 지적한다. 자리표시자는 명백한 가짜(`__PLACEHOLDER__`)여야 한다.

## 안티패턴
- 질의 표면이 쓰기 권한(또는 슈퍼유저) 롤로 접속 → 가드/트랜잭션이 깨지면 즉시 쓰기 가능. **CRITICAL/HIGH**.
- 접속 문자열에 평문 비밀번호 하드코딩. **CRITICAL(시크릿 노출)**.

## 리뷰 훅
- [ ] 질의 롤이 `SELECT`만 갖는가(쓰기/DDL 권한 미부여). GRANT/REVOKE를 코드/마이그레이션에서 확인했는가.
- [ ] 소유자/슈퍼유저 롤로 질의하지 않는가(질의 롤과 관리 롤 분리).
- [ ] `search_path`가 고정되어 스키마 탈취가 불가능한가.
- [ ] 접속정보가 환경변수/시크릿 매니저로 주입되는가(소스·로그·출력에 평문 없음).
