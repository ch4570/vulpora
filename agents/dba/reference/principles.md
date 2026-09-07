# PostgreSQL DBA 핵심 원칙 (Principles)

> 이 문서는 4권의 명저에서 추출한 DBMS 공통 원리를, **PostgreSQL 공식 문서**로 검증·보정한
> 실무 원칙 모음이다. 에이전트와 스킬이 판단의 근거로 삼는 "헌법" 역할을 한다.
>
> **출처(Sources)**
> - 조시형, 『친절한 SQL 튜닝』(디비안) — SQL 처리/IO, 인덱스, 조인, 소트, DML, 옵티마이저
> - 유동오, 『핵심 데이터 모델링』(디비안) — ER 이론, 정규화, 개념/논리/물리 모델링, 무결성, 이력
> - 『불친절한 SQL / PL SQL 프로그래밍』(디비안) — SQL 함수/집합/분석함수/계층/트랜잭션
> - PostgreSQL 공식 문서: Performance Tips, Indexes, MVCC, DDL Constraints (docs/current)
>
> 책은 대부분 Oracle 기준이므로, **Oracle 고유 개념은 PostgreSQL 등가물로 치환**해서 적용한다
> (아래 "Oracle→PostgreSQL 치환표" 참조).

---

## 0. 대전제: "쉬운 80점" 모델/쿼리가 "어려운 100점"을 이긴다

> 『핵심 데이터 모델링』 지은이의 말: *"100% 최적화된 어려운 SQL보다 80% 최적화되었지만
> 쉬운 SQL이 시스템에 반영될 확률이 높다."*

- 이상적 설계보다 **현실에 적용 가능한 설계**를 우선한다.
- 단, "쉬움"이 무결성·정합성을 포기하는 핑계가 되어선 안 된다. 무결성은 타협 불가 영역이다.

---

## 1. SQL 처리 원리 (옵티마이저는 통계가 전부다)

『친절한 SQL 튜닝』 1·7장 + PG `Performance Tips`.

1. **SQL은 선언적이다.** "무엇을" 선언하면 "어떻게"는 옵티마이저가 만든다. 따라서 튜닝의
   본질은 **옵티마이저가 좋은 실행계획을 고르도록 정보를 주는 것**이다.
2. **옵티마이저는 비용(Cost) 기반**이다. 비용은 예상 I/O 또는 예상 소요시간이며 **실측치가
   아니다**. 그래서 통계가 틀리면 계획도 틀린다.
3. **통계가 곧 성능이다 (PG 공식 강조).**
   - 대량 INSERT/UPDATE/DELETE 후에는 `ANALYZE`를 수행하라.
   - `autovacuum`(autoanalyze 포함)이 켜져 있어야 한다.
   - **추정 행 수(estimated) vs 실제 행 수(actual)** 가 크게 어긋나면 통계가 낡았거나
     컬럼 상관관계 문제다 → `ANALYZE`, 또는 `CREATE STATISTICS`(확장 통계, 상관 컬럼).
4. **실행계획을 먼저 읽어라.** `EXPLAIN`(계획만) → `EXPLAIN (ANALYZE, BUFFERS)`(실제 실행).
   `EXPLAIN ANALYZE`는 쿼리를 실제로 실행하므로 운영 쓰기 쿼리엔 트랜잭션으로 감싸 롤백한다.
5. **바인드 변수(파라미터화)를 써라.** 리터럴을 바꿔가며 던지면 매번 하드 파싱이 일어나고
   plan cache를 못 쓴다. PostgreSQL에서는 prepared statement / 드라이버 파라미터 바인딩으로
   계획 재사용 + **SQL 인젝션 방지**를 동시에 달성한다.

---

## 2. 인덱스 원리

『친절한 SQL 튜닝』 2·3장 + PG `Indexes`.

### 2.1 인덱스가 빠른 이유와 비용
- 인덱스 = 정렬된 자료구조(B-tree). **수직 탐색(루트→리프)** 으로 시작점을 찾고
  **수평 탐색(리프 스캔)** 으로 범위를 읽는다.
- 인덱스의 효용은 **테이블 랜덤 액세스를 줄이는 것**에서 나온다. 인덱스로 ROWID(ctid)를 얻어
  테이블 블록을 한 건씩 찾아가는 비용(랜덤 I/O)이 진짜 비용이다.
- **인덱스 손익분기점**: 읽을 데이터가 테이블의 일정 비율을 넘으면 인덱스보다 Full Scan이
  싸다. "인덱스가 항상 빠르다"는 미신이다.

### 2.2 인덱스를 Range Scan 할 수 있는 조건 (가장 중요)
- **선행 컬럼이 가공되면 인덱스를 못 탄다.** `WHERE LOWER(email)=...`, `WHERE col+0=...`,
  `WHERE to_char(dt,'YYYYMMDD')=...` → 인덱스 무력화.
  - 해법: 컬럼을 가공하지 말고 **상수 쪽을 가공**하거나, **표현식 인덱스**
    (`CREATE INDEX ON t (lower(email))`)를 만든다.
- **암묵적 형변환 주의.** PostgreSQL은 Oracle보다 타입에 엄격하지만, 컬럼 타입과 다른 타입의
  파라미터를 비교하면 캐스팅이 컬럼 쪽에 붙어 인덱스를 못 탈 수 있다. 타입을 일치시켜라.
- **선두 컬럼에 등치(=) 조건이 없으면** 결합 인덱스 효율이 급감한다.

### 2.3 결합(다중컬럼) 인덱스 컬럼 순서 (PG 공식 규칙)
1. **등치(=) 조건 컬럼을 앞에** (검색 범위를 가장 많이 좁힘)
2. **범위(<, >, BETWEEN) 조건 컬럼을 그 다음**
3. **ORDER BY / GROUP BY 컬럼을 마지막** (정렬 연산 생략용)

예: `WHERE status = ? AND age > ? ORDER BY name` → `(status, age, name)`

### 2.4 PostgreSQL 인덱스 종류 선택 (책엔 없는 PG 고유 영역)
| 종류 | 용도 |
|------|------|
| **B-tree** | 기본값. 등치/범위/정렬. 모르면 B-tree. |
| **Hash** | 등치(=) 전용. 이점이 작아 거의 B-tree로 충분. |
| **GIN** | 배열 포함(`@>`), `jsonb`, 전문검색(`tsvector`). 읽기 빠름/쓰기 느림. |
| **GiST** | 기하/범위 타입(range), 근접 검색, 전문검색. |
| **SP-GiST** | 비균형 트리(쿼드트리), IP/네트워크. |
| **BRIN** | 초대형 + 물리적으로 정렬된 컬럼(시계열 timestamp). 저장공간 극소. |

### 2.5 고급 인덱스 기법
- **부분 인덱스(Partial)**: `CREATE INDEX ... WHERE status='active'`. 자주 거르는 부분집합만
  인덱싱 → 작고 빠르다. "삭제 안 된 행만", "활성만" 패턴에 강력.
- **표현식 인덱스(Expression)**: 가공된 컬럼을 자주 검색할 때.
- **커버링 인덱스(`INCLUDE`) / Index-Only Scan**: SELECT 컬럼을 인덱스에 포함시켜 테이블
  접근 자체를 없앤다. (단, PG는 visibility map 상태에 따라 heap fetch가 생길 수 있음 → VACUUM 중요)
- **중복 인덱스 제거**: `(a)` 는 `(a,b)` 에 포함되므로 보통 불필요. 인덱스가 많을수록 DML이 느려진다.

### 2.6 인덱스를 만들지 말아야 할 때
- 아주 작은 테이블, 카디널리티가 매우 낮은 컬럼, WHERE/JOIN/ORDER BY에 안 쓰는 컬럼,
  쓰기 부하가 조회 이득보다 큰 테이블.

---

## 3. 조인 원리

『친절한 SQL 튜닝』 4장. 조인 방식은 DBMS 공통이며 PostgreSQL이 셋 다 지원한다.

| 조인 | 메커니즘 | 유리한 상황 |
|------|----------|-------------|
| **Nested Loop** | 선행 테이블 각 행마다 후행을 인덱스로 탐색 | 소량 + 후행에 좋은 인덱스(OLTP) |
| **Sort Merge** | 양쪽 정렬 후 머지 | 대량, 정렬 이점이 있을 때 |
| **Hash Join** | 작은 쪽으로 해시 테이블 build, 큰 쪽 probe | 대량 + 등치 조인, 인덱스 없어도 빠름(OLAP/배치) |

- **NL 조인 튜닝 포인트**: 후행 테이블의 조인 컬럼에 인덱스가 있는가, 선행을 작게 만드는가.
- **조인 순서**: 결과를 가장 많이 줄이는(작은) 집합을 선행으로.
- PostgreSQL은 `join_collapse_limit` / `from_collapse_limit` 안에서 조인 순서를 직접 탐색한다.
  Oracle식 `ORDERED`/`LEADING` 힌트는 없다 → 통계를 정확히 유지하는 것이 1순위 대응.
- **상관 서브쿼리**는 옵티마이저가 조인/세미조인으로 변환(unnest)한다. `EXISTS`/`IN`/`= ANY`는
  대개 semi-join으로 풀린다. 결과 중복이 없다면 `EXISTS`가 안전.

---

## 4. 소트(Sort) / 부분범위 처리

『친절한 SQL 튜닝』 3·5장.

- **정렬은 비싸다.** 메모리(`work_mem`)를 넘기면 디스크 소트로 떨어진다(`EXPLAIN ANALYZE`의
  `Sort Method: external merge Disk`가 신호).
- **인덱스로 정렬을 생략**할 수 있다: ORDER BY 컬럼이 인덱스 순서와 일치하면 Sort 노드가 사라진다.
- **Top-N**: `ORDER BY ... LIMIT n` 은 인덱스가 받쳐주면 전체 정렬 없이 앞 n건만 뽑는다
  (PG의 `Limit` + index scan, 또는 top-N heapsort). 페이지네이션의 핵심.
- **`UNION` vs `UNION ALL`**: `UNION`은 중복 제거를 위해 정렬/해시를 한다. 중복이 없음을
  알면 반드시 `UNION ALL`.
- **불필요한 `DISTINCT`/`ORDER BY` 제거**가 가장 싼 튜닝이다.

---

## 5. DML / 트랜잭션 / 동시성 (PostgreSQL MVCC)

『친절한 SQL 튜닝』 6장 + PG `MVCC`. **여기는 Oracle과 PostgreSQL의 차이가 큰 영역이라 PG 기준으로 재작성.**

### 5.1 MVCC 기본
- PostgreSQL은 **읽기가 쓰기를 막지 않고, 쓰기가 읽기를 막지 않는다**(MVCC). UPDATE/DELETE는
  기존 튜플을 즉시 지우지 않고 죽은 튜플(dead tuple)로 남긴다 → **VACUUM**이 청소한다.
- 그래서 PostgreSQL 고유 리스크: **테이블/인덱스 bloat**, **트랜잭션 ID wraparound**.
  대량 UPDATE/DELETE 후 bloat·autovacuum을 반드시 점검.

### 5.2 격리 수준
| 수준 | Dirty read | Non-repeatable | Phantom | 비고 |
|------|-----------|----------------|---------|------|
| **Read Committed**(기본) | X | O | O | 대부분의 OLTP |
| **Repeatable Read** | X | X | X(스냅샷) | PG는 표준보다 강함. 직렬화 이상은 가능 → `could not serialize` 발생 가능 |
| **Serializable** | X | X | X | SSI. `serialization_failure` 시 **재시도 로직 필수** |

### 5.3 잠금 / 데드락 규칙
- 행 잠금: `SELECT ... FOR UPDATE`(배타), `FOR SHARE`(공유), `FOR NO KEY UPDATE`, `FOR KEY SHARE`.
- **데드락 예방 1순위: 항상 같은 순서로 잠가라.** (예: id 오름차순)
- **트랜잭션은 짧게.** 동시성 경합을 줄이는 가장 효과적인 단일 규칙. 트랜잭션 안에서 외부 API
  호출/사용자 입력 대기 금지.
- 분산 작업 조율(중복 크론 방지 등)은 **advisory lock**(`pg_advisory_lock`).
- 경합 진단: `pg_locks`(`WHERE NOT granted`), `pg_stat_activity`(`wait_event`, `state`).
- **`FOR UPDATE SKIP LOCKED`**: 큐(작업 분배) 패턴에서 잠긴 행을 건너뛰어 워커 경합 제거.

### 5.4 채번(시퀀스)
- Oracle 시퀀스/`채번 테이블` 대신 **`IDENTITY` 컬럼(`GENERATED ... AS IDENTITY`)** 또는
  `bigserial`/`sequence`를 쓴다. 채번 테이블 UPDATE 방식은 직렬화 병목 → 지양.
- UUID가 필요하면 충돌·정렬·인덱스 지역성을 고려(랜덤 UUID는 B-tree 지역성이 나쁨; v7/시간순 권장).

---

## 6. 데이터 모델링 원칙

『핵심 데이터 모델링』 1~5장.

### 6.1 ER 모델의 질적 특성 (모델 리뷰 체크리스트)
1. **완전성(Completeness)** — 모든 요구사항이 모델에 표현되었는가.
2. **정확성(Correctness)** — ER 개념을 올바르게 사용했는가(엔티티/관계/속성 혼동 없는가).
3. **비중복성(Non-redundancy)** — 같은 사실이 한 번만 표현되는가. 파생/중복 데이터는 **반드시 문서화**.
4. **명확성/단순성** — 추가 설명 없이 의미가 통하는가. (`주소1/주소2` < `기본주소/상세주소`)
5. **유연성(Flexibility)** — 업무 확장을 흡수하는가(일반화/통합).
6. **가독성** — 위→아래, 좌→우, 부모를 자식 위에, 관계선 교차 최소화.

### 6.2 정규화는 기본, 반정규화는 예외(근거를 남겨라)
- 기본은 **정규화**(이상현상 제거). 반정규화(중복/파생 컬럼, 통합 테이블)는 **성능 근거가
  명확할 때만**, 그리고 **정합성 유지 책임(트리거/애플리케이션 규칙)을 함께 설계**한다.
- 1차 정규화로 분리된 엔티티(종속 엔티티), 다대다 해소용 교차 엔티티를 정확히 식별.

### 6.3 식별자(Identifier) — 인조 식별자는 언제?
- 본질 식별자(자연키)가 안정적이고 단순하면 그대로. 단, **복합 자연키가 너무 길거나, 값이
  변하거나, 외부 노출이 곤란**하면 **인조(surrogate) 식별자**(IDENTITY/BIGINT)를 도입한다.
- 인조키를 쓰더라도 **자연키엔 UNIQUE 제약**을 걸어 업무 유일성을 보장한다(인조키만 믿으면
  중복 데이터가 쌓인다 — 책의 단골 지적).

### 6.4 슈퍼타입/서브타입, 일반화/통합
- 동일 업무 처리 대상/동일 관점 분석이면 **일반화(통합)** 로 유연성↑(배타관계 해소 → UNION/Outer
  Join 감소, 개발생산성·성능↑).
- 단 통합의 대가: 속성 의미 모호, **NOT NULL/FK 제약을 못 거는 무결성 약화**. 통합 시
  업무 규칙을 애플리케이션/CHECK로 보강해야 한다(트레이드오프를 의식적으로 선택).

### 6.5 이력(History) 관리
- 점 이력(특정 시점) vs 선분 이력(기간: `유효시작/유효종료`). 조회 패턴에 맞게 선택.
- 선분 이력은 **기간 중첩 금지**가 핵심 무결성 → PostgreSQL은 **`EXCLUDE USING gist (key WITH =, period WITH &&)`**
  배타 제약 + `daterange/tstzrange`로 DB 차원에서 보장 가능(책의 Oracle 모델보다 강력한 PG 무기).

### 6.6 공통코드 / 개인정보
- 공통코드: 코드그룹+코드 구조. 과도한 단일 통합("만능 코드 테이블") vs 분리의 트레이드오프를 의식.
- 개인정보(주민번호 등)는 **암호화/마스킹 컬럼 분리** 설계, 검색이 필요하면 해시/부분 인덱스 전략.

---

## 7. 물리 설계 (PostgreSQL 타입/제약)

『핵심 데이터 모델링』 4장 + PG `DDL Constraints`.

### 7.1 제약은 DB에 건다 (애플리케이션만 믿지 마라)
- **PK는 모든 테이블에.** (이론·실무 공통)
- **NOT NULL을 기본값으로.** 정말 선택적일 때만 NULL 허용. NULL은 비교/집계/인덱스에서
  특수 동작하므로 무분별한 NULL은 버그의 근원.
- **FK로 참조무결성을 건다.** `ON DELETE`는 의미에 맞게:
  - 구성요소(주문↔주문상품) → `CASCADE`
  - 독립 객체 → `RESTRICT`/`NO ACTION`
  - 선택적 관계 → `SET NULL`
- **FK 컬럼엔 인덱스를 직접 만들어라.** PG는 FK 컬럼을 자동 인덱싱하지 않는다 →
  부모 DELETE/UPDATE 시 자식 풀스캔 발생.
- **UNIQUE의 NULL**: 기본은 NULL끼리 서로 다름(중복 허용). 단일 NULL만 허용하려면
  PG15+ `NULLS NOT DISTINCT`.
- **CHECK**로 도메인 규칙(`price > 0`). 단 CHECK는 같은 행만 참조 가능(교차행 X) + 불변 가정.

### 7.2 타입 선택 (PG 권장)
- 금액/정밀 계산: `numeric`(부동소수점 금지). 식별자: `bigint`/`identity`.
- 시각: **`timestamptz`** (timezone 포함) 기본. 날짜만이면 `date`.
- 문자열: `text`/`varchar(n)` (PG는 성능차 거의 없음; 길이 제한은 업무 규칙일 때만).
- 가변/반정형: `jsonb`(+ GIN). 단 정규화 회피용 남용 금지.
- 열거: `enum` 또는 코드 테이블 + FK (확장성은 코드테이블이 유리).
- 파생 컬럼: `GENERATED ALWAYS AS (...) STORED`.

### 7.3 파티셔닝 / 대용량
- 시계열·로그·대량 이력은 **선언적 파티셔닝**(RANGE/LIST/HASH). 파티션 키는 가지치기(pruning)가
  되도록 WHERE에 자주 쓰는 컬럼.
- 오래된 파티션은 `DETACH`/`DROP`으로 **대량 DELETE 없이** 정리(데드튜플·bloat 회피).

---

## 8. 안전한 변경 (마이그레이션 리스크)

PG `MVCC` + 운영 경험 원칙. 상세는 번들 KB의 락·동시성 항목 참조.

- DDL은 **락**을 잡는다. `ALTER TABLE`의 종류에 따라 `ACCESS EXCLUSIVE` 락 → 운영 중단 위험.
- **안전한 패턴**:
  - 인덱스 생성은 **`CREATE INDEX CONCURRENTLY`**(테이블 쓰기 막지 않음).
  - `NOT NULL`/대형 `CHECK` 추가는 `ADD CONSTRAINT ... NOT VALID` 후 `VALIDATE CONSTRAINT`로 2단계.
  - FK 추가도 `NOT VALID` → `VALIDATE`.
  - 컬럼 추가는 즉시 가능하나, **volatile DEFAULT** 동반 시 테이블 재작성 주의(PG11+는 상수
    DEFAULT면 빠름).
  - 타입 변경(`ALTER TYPE`)은 테이블 재작성 + 장시간 락 → 신중히, 배치/무중단 전략으로.
- **항상 `lock_timeout`/`statement_timeout`을 걸고** 마이그레이션을 돌려 장시간 락 폭주를 막는다.
- 대량 백필은 **배치(청크) + 트랜잭션 분할**로. 한 트랜잭션의 초대형 DML은 락·WAL·롤백 비용 폭증.

---

## 9. 보안 (DBA 관점)

- **파라미터 바인딩으로 SQL 인젝션 차단**(문자열 연결 금지) — 성능(plan 재사용)과 보안을 동시 충족.
- 최소권한 원칙: 애플리케이션 롤에 필요한 권한만. `SECURITY DEFINER` 함수의 `search_path` 고정.
- 행 수준 보안(RLS)이 필요하면 `ENABLE ROW LEVEL SECURITY` + 정책.
- 민감정보 로깅 금지, 에러 메시지에 내부정보 노출 금지.

---

## Oracle → PostgreSQL 치환표

책(Oracle)을 읽을 때 PostgreSQL로 바꿔 적용하기 위한 대응표.

| Oracle (책) | PostgreSQL |
|-------------|------------|
| ROWID | `ctid` (물리 위치, 영구 식별자 아님) |
| 시퀀스/채번 테이블 | `GENERATED ... AS IDENTITY`, `bigserial`, `sequence` |
| `DECODE` | `CASE WHEN` |
| `NVL` / `NVL2` | `COALESCE` / `CASE` |
| `(+)` 외부조인 | 표준 `LEFT/RIGHT OUTER JOIN` |
| `CONNECT BY` 계층쿼리 | `WITH RECURSIVE` (재귀 CTE) |
| 분석함수(동일) | 윈도우 함수 `OVER(...)` (대부분 동일) |
| `MERGE` | `INSERT ... ON CONFLICT DO UPDATE` (upsert), PG15+는 `MERGE`도 지원 |
| 힌트 `/*+ INDEX */`, `LEADING` | **없음**. 통계/인덱스/쿼리구조로 유도 (`pg_hint_plan` 확장은 선택) |
| `ROWNUM <= n` | `LIMIT n` (+ `ORDER BY`) |
| 옵티마이저 통계 `DBMS_STATS` | `ANALYZE`, `CREATE STATISTICS`, autovacuum |
| AutoTrace / `V$SQL` | `EXPLAIN (ANALYZE, BUFFERS)`, `pg_stat_statements` |
| SGA/PGA, work area | `shared_buffers`, `work_mem`, `maintenance_work_mem` |
| 비트맵 인덱스 | (영구 비트맵 인덱스 없음) Bitmap **scan**은 실행시 자동; 부분/표현식 인덱스로 대응 |
| Direct Path Insert | `COPY`, `INSERT ... SELECT`(+ `wal_level` 고려) |
| Lock 전환/TX | MVCC + dead tuple + **VACUUM**(PG 고유 운영 포인트) |

> **주의**: PostgreSQL에는 옵티마이저 힌트가 기본 없다. 책의 "힌트로 강제" 접근 대신
> **통계 최신화 + 적절한 인덱스 + 쿼리 재작성**이 정공법이다.
