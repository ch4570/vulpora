"""
NL -> SQL 핸들러 (FIXTURE — 의도적으로 취약함).

이 파일은 nl-sql-guardian 리뷰 평가용 정적 픽스처다. 실행하지 않는다.
일반 엔티티(Article / Member / Order)만 사용한다 — 도메인 토큰 없음.

리뷰가 반드시 짚어야 할 취약점은 README.md 참조.
"""

import psycopg2  # type: ignore

# [취약점] 쓰기 가능한 슈퍼유저 롤 + 평문 비밀번호(가짜 자리표시자).
#          질의 표면이 SELECT만 가진 최소권한 롤을 써야 한다.
DB_DSN = "postgresql://app_owner:__PLACEHOLDER__@db.internal/appdb"


def connect():
    # [취약점] 읽기전용 트랜잭션을 걸지 않는다.
    #          default_transaction_read_only / SET TRANSACTION READ ONLY 없음.
    return psycopg2.connect(DB_DSN)


def build_sql(nl_question: str, filters: dict) -> str:
    """자연어/필터를 SQL로 조립한다. (LLM이 채운 값이라고 가정)"""
    # [취약점] 문자열 연결(f-string)로 값을 SQL에 직접 박는다 → SQL 인젝션.
    #          파라미터 바인딩(params)을 쓰지 않는다.
    keyword = filters.get("keyword", "")
    sql = (
        "SELECT article_id, title, body, created_at "
        "FROM article "
        f"WHERE title LIKE '%{keyword}%' "
        "ORDER BY created_at DESC"
    )
    # [취약점] LIMIT/결과 캡이 없다 → 무제한 결과셋.
    return sql


def build_member_lookup(member_id: str) -> str:
    # [취약점] 읽기 경로에 행 잠금(SELECT ... FOR UPDATE) — 경합/락.
    # [취약점] member_id 문자열 연결(인젝션).
    return (
        "SELECT member_id, email FROM member "
        f"WHERE member_id = {member_id} FOR UPDATE"
    )


def run(nl_question: str, filters: dict):
    """[취약점] 문장 화이트리스트 가드가 전혀 없다.
    LLM이 만든 임의 SQL이 그대로 실행된다 — 멀티스테이트먼트/쓰기/DDL도 통과한다.
    """
    sql = build_sql(nl_question, filters)
    conn = connect()
    cur = conn.cursor()
    cur.execute(sql)          # 가드 없이 실행
    rows = cur.fetchall()     # 결과 캡 없이 전부 메모리에 적재
    conn.commit()             # [취약점] 읽기 경로에서 commit — 쓰기를 허용한다는 신호
    return rows
