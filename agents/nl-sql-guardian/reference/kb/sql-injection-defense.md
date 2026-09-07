---
title: SQL 인젝션 방어 (파라미터화·식별자·LLM 출력)
source: https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html
last_fetched: 2026-06-25
consumers: [nl-sql-guardian]
---

# KB: SQL 인젝션 방어

> 참고 출처: OWASP *Query Parameterization Cheat Sheet*, *Injection Prevention Cheat Sheet*,
> OWASP LLM Top 10 *LLM02 Insecure Output Handling*, PostgreSQL `PREPARE`.

## 규칙 (defense in depth)

1. **1차 방어 = 파라미터화(prepared statement / 바인드 변수).** 모든 사용자 값(검색어·날짜·ID 등)은
   SQL 텍스트가 아니라 `params[]`로 분리해 바인딩한다. 자리표시자는 dialect별(`$1` / `?` / `@p1`).
2. **문자열 연결로 값을 SQL에 박지 않는다.** `"... WHERE x='" + v + "'"`, f-string, `.format()`,
   템플릿 리터럴(`${v}`)로 값을 주입하는 경로는 전부 인젝션 통로다.
3. **식별자(테이블/컬럼명)는 파라미터화할 수 없다** → 동적 식별자가 필요하면 **화이트리스트**(허용된 이름 집합)로
   매핑하거나 dialect 규칙대로 따옴표 처리한다. 사용자 입력을 식별자로 직접 쓰지 않는다.
4. **LLM 출력도 입력처럼 다룬다(LLM02).** 모델이 만든 SQL은 가드를 통과시키고, 값은 파라미터로 분리한다.
   모델에게 "값을 인라인하라"고 시키지 말고 "자리표시자 + params"를 만들게 한다.
5. **마스킹 후 검사.** 가드는 문자열/주석/따옴표 식별자/(pg)달러인용을 dialect 규칙대로 마스킹한 뒤,
   마스킹 텍스트에서만 키워드·세미콜론을 검사한다(데이터 값 속 키워드 오탐 방지).

## 리뷰 훅
- [ ] 모든 리터럴 값이 `params[]` 바인딩인가. 문자열 연결/f-string/`${}`로 값을 박는 경로가 **0개**인가.
- [ ] 동적 식별자(테이블/컬럼)가 사용자 입력에서 직접 오지 않는가(화이트리스트/따옴표 처리).
- [ ] LLM이 만든 SQL이 실행 전 가드를 통과하고, 값이 파라미터로 분리되는가.
- [ ] 가드가 문자열/주석/달러인용을 마스킹한 뒤 키워드를 검사하는가(오탐·우회 방지).
- [ ] 인젝션 의심 입력(`' OR '1'='1`, `; DROP`, 주석 `--`)이 파라미터화로 무력화되는가.
