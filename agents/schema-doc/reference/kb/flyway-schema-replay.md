---
title: Flyway 마이그레이션 리플레이로 누적 스키마 재구성
source: https://documentation.red-gate.com/fd/
last_fetched: 2026-06-24
consumers: [schema-cartographer]
---

# KB: Flyway 마이그레이션 리플레이 (누적 스키마 재구성)

## 리뷰 훅 (이걸 점검하라)
- [ ] **모든** V 파일을 모았는가 — 최신 파일 하나만 보고 끝내지 않았는가(누적 상태가 진실).
- [ ] V 파일을 **버전 순서**(`V{yyyyMMdd.HHmmss}`)로 정렬해 순차 적용했는가.
- [ ] 중간에 `ADD` 됐다가 이후 `DROP`된 컬럼/인덱스를 **최종 상태에서 제외**했는가.
- [ ] `RENAME COLUMN`/`RENAME TO`를 추적해 **현재 이름**으로 반영했는가(옛 이름으로 남지 않게).
- [ ] 타입 변경(`ALTER COLUMN ... TYPE`)의 **마지막** 타입을 반영했는가.
- [ ] R(repeatable) 파일(뷰·함수 등)을 V 적용 **후** 반영했는가.
- [ ] 환경별 오버라이드(ci/dev/local) 파일이 공통 스키마를 바꾸면 **공통 기준**으로 문서화했는가(환경차는 주석).

## 근거 (공식 문서 요지)
- Flyway 마이그레이션 종류:
  - **Versioned (`V`)**: 한 번만, **버전 순서**대로 적용. 파일명 `V{version}__{description}.sql`.
  - **Repeatable (`R`)**: 체크섬이 바뀌면 재적용. 모든 V **이후** 적용. 파일명 `R__{description}.sql`.
- **적용 순서 = 버전 순서.** 누적 스키마는 V를 버전 오름차순으로 모두 적용한 결과 + 그 위에 R.
- 같은 스키마를 처음부터 다시 만들면 V 전체를 순서대로 재생(replay)한 것과 같다 → **문서화 = 정적 리플레이**.
- 하우스 명명 관습: `V{yyyyMMdd.HHmmss}__{domain}__{action}_{entity}.sql`. 타임스탬프가 정렬 키.

## 리플레이 절차 (정적, DB 미접속)
1. `Glob`으로 `**/V*__*.sql`, `**/R__*.sql` 수집.
2. V를 파일명 타임스탬프 기준 **오름차순 정렬**.
3. 빈 스키마 모델에서 시작해 각 V의 DDL을 순서대로 누적 반영:
   - `CREATE TABLE` → 테이블·컬럼·인라인 제약 등록.
   - `ALTER TABLE ADD COLUMN` → 컬럼 추가. `DROP COLUMN` → 제거. `RENAME COLUMN` → 이름 교체.
   - `ALTER COLUMN ... TYPE / SET DEFAULT / SET NOT NULL / DROP NOT NULL` → 해당 속성 갱신.
   - `ADD CONSTRAINT` / `DROP CONSTRAINT`(PK/FK/UNIQUE/CHECK) → 제약 반영.
   - `CREATE INDEX [CONCURRENTLY]` / `DROP INDEX` → 인덱스 반영(부분/표현식 인덱스의 `WHERE`도 기록).
   - `RENAME TO` (테이블) → 테이블명 교체.
4. R 파일(뷰·함수 등)을 마지막에 반영(테이블이 아니면 ERD 대신 부록으로 기술).
5. 결과 = **현재 물리 스키마 모델**. 여기서 ERD·명세를 생성.

## 주의
- `IF NOT EXISTS`/`IF EXISTS`는 멱등용 — 리플레이 시엔 단순히 해당 객체 생성/삭제로 본다.
- 시드 `INSERT`의 실 데이터 값은 문서에 전사하지 않는다(구조만, 값은 마스킹 — principles §5).

## 인용 시
"Flyway docs(versioned/repeatable) 기준, V를 버전 순서로 리플레이한 누적 상태가 현재 스키마" 식으로 근거를 단다.
