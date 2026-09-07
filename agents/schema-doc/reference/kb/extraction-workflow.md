---
title: 추출 워크플로 — 누적 리플레이 + ORM 병합 + drift 화해
source: https://documentation.red-gate.com/fd/
last_fetched: 2026-06-24
consumers: [schema-cartographer]
---

# KB: 추출 워크플로

> Flyway는 versioned 마이그레이션을 **버전 순서대로 한 번씩** 적용해 스키마를 진화시킨다(공식 문서).
> 따라서 현재 스키마는 "최신 파일"이 아니라 **모든 versioned 마이그레이션의 누적 결과**다.
> 본 KB는 라이브 DB 없이 그 누적을 **정적으로 재구성(replay)** 하는 방법을 정의한다(정적 파싱 기반, 실행 아님).

## 1. 마이그레이션 수집·정렬
- Glob: `**/db/migration/**/*.sql`, `**/migration/**/*.sql`, `**/V*__*.sql`, `**/R__*.sql`.
- 파일명에서 버전 추출(`V<version>__<desc>.sql`). 버전은 점/언더스코어 구분 숫자로 **파트별 비교** 정렬.
- repeatable(`R__`)은 버전이 없으므로 마지막에 별도 적용(뷰·함수 정의 = 최신 덮어쓰기).

## 2. 누적 스키마 모델 리플레이 (핵심 알고리즘)
빈 모델에서 시작해 정렬 순서대로 각 파일의 DDL을 반영한다(in-memory 모델 갱신, DB 실행 아님).

| DDL | 모델 반영 |
|-----|-----------|
| `CREATE TABLE s.t (...)` | 테이블 `s.t` 추가, 컬럼·타입·NULL·기본값·인라인 제약 등록 |
| `ALTER TABLE ... ADD COLUMN` | 해당 테이블에 컬럼 추가 |
| `ALTER TABLE ... DROP COLUMN` | 컬럼 제거 |
| `ALTER TABLE ... ALTER COLUMN TYPE/SET NOT NULL/SET DEFAULT` | 타입·NULL·기본값 갱신 |
| `ADD CONSTRAINT ... PRIMARY KEY/UNIQUE/FOREIGN KEY/CHECK` | 제약 등록(키·관계·enum 후보) |
| `CREATE [UNIQUE] INDEX` | 인덱스 등록(부분·표현식 인덱스 포함) |
| `COMMENT ON TABLE/COLUMN ... IS '...'` | 논리 설명 등록 |
| `DROP TABLE ... [IF EXISTS]` | 테이블 제거 |

- 멱등 가드(`IF NOT EXISTS`/`IF EXISTS`)는 무시하고 의도만 반영한다.
- 파싱 실패 라인은 버리지 말고 "미해석"으로 기록해 사람이 검토하게 한다(조용히 삼키지 않는다).

## 3. ORM 메타데이터 병합
- `@Entity`/`@Table(schema=, name=)`로 클래스 ↔ 물리 테이블 매핑.
- `@Column(name=)`로 필드 ↔ 컬럼 매핑, KDoc/`@Comment`로 논리 설명 보강.
- `@Enumerated(EnumType.STRING)` enum 클래스 → 컬럼의 허용 값 후보(`CHECK ... IN`과 대조).
- `@ManyToOne`/`@JoinColumn`/`@OneToMany` → 관계 의도(단, 물리 FK 근거와 대조).

## 4. drift 화해 (reconciliation)
물리는 마이그레이션이 이긴다. 불일치는 버리지 않고 **drift로 보고**한다.

| 케이스 | 처리 |
|--------|------|
| 코드에만 있는 컬럼/테이블 | 물리 미반영 → drift("코드 있음, 마이그레이션 없음") |
| 마이그레이션에만 있는 컬럼 | 물리에 채택, drift("코드 미매핑")로 표기 |
| 타입/NULL 불일치 | 물리=마이그레이션 채택, drift에 코드 값 병기 |
| 관계 불일치(코드 연관 ↔ FK 없음) | ERD에 그리지 않음(FK 근거 없음), drift로 기록 |

## 리뷰 훅
- [ ] 최신 파일만 보지 않고 **모든 versioned를 버전순 누적** 리플레이했는가.
- [ ] `ALTER`/`DROP`으로 인한 후속 변경(컬럼 추가/삭제/타입 변경)이 반영됐는가.
- [ ] repeatable(`R__`)을 마지막에 처리했는가.
- [ ] 물리는 마이그레이션을 채택하고, 코드 불일치를 **drift로 빠짐없이** 기록했는가.
- [ ] 파싱 못한 DDL을 조용히 버리지 않고 "미해석"으로 남겼는가.
- [ ] 근거 없는 컬럼·관계를 지어내지 않았는가.
