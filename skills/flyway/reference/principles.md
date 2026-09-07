# Flyway 마이그레이션 핵심 원칙 (Principles)

> 스키마 변경을 버전 관리되고 재현 가능하며 안전하게 적용하기 위한 판단 기준("헌법").
> KB(공식 문서 distill)가 "사실·규칙"이라면 이 문서는 "통찰·판단 기준"이다. 충돌 시 **KB(공식 문서)가 우선**.
>
> **출처(Sources)**
> - Flyway Documentation (Red Gate) — https://documentation.red-gate.com/fd
> - Flyway Concepts: Migrations / Versioned & Repeatable — https://documentation.red-gate.com/fd/migrations-184127470.html
> - Flyway Baseline / Out-of-order / Undo — Flyway docs
> - 온라인 DDL 안전성은 개념적으로 `postgres-risk-check` / PostgreSQL 공식 문서와 연계.

---

## 0. 대전제: 스키마도 코드처럼 버전 관리한다

- 모든 스키마 변경은 **마이그레이션 파일**로 남기고, 코드 변경과 **같은 변경 단위(MR)** 에 동반한다.
- DB에 사람이 손으로 친 변경(out-of-band)은 재현성을 깨뜨린다. 변경은 항상 파일을 통해서 들어간다.

## 1. 적용된 마이그레이션은 불변이다 (immutability)

- 한 번 적용된 versioned 마이그레이션 파일은 **수정하지 않는다.** 수정하면 체크섬이 깨져 `validate`가 실패한다.
- 이미 적용된 변경을 바꾸려면 **새 버전**을 추가한다(앞으로만 전진).

## 2. versioned vs repeatable를 의도적으로 고른다

- **Versioned(`V`)**: 한 번만, 순서대로. DDL·데이터 마이그레이션의 기본.
- **Repeatable(`R`)**: 체크섬이 바뀔 때마다 마지막에 재적용. 뷰·함수·시드처럼 "최신 정의로 덮어쓰기"에 적합.

## 3. 멱등성과 안전한 패턴

- `CREATE TABLE/INDEX IF NOT EXISTS`, `DROP ... IF EXISTS`로 재실행/부분 실패에 강하게.
- `NOT NULL`/타입 변경/백필 같은 락·재작성 위험은 **여러 단계**로 쪼갠다(개념적으로 온라인 DDL 안전성과 연계, `postgres-risk-check`).
- `CASCADE` drop 금지 — 의도치 않은 연쇄 삭제 방지.

## 4. 네이밍·버전이 곧 순서다

- 파일명 문법(`V{ts}__{desc}.sql`)은 빌드에서 강제된다. 타임스탬프 버전으로 충돌·역전을 줄인다.
- 같은 버전 번호 중복 금지. 협업 시 타임스탬프 기반이 정수 시퀀스보다 충돌이 적다.

## 5. baseline은 기존 DB를 Flyway에 편입할 때만

- 이미 객체가 있는 DB에 Flyway를 도입할 때 `baseline`으로 기준선을 긋는다.
- baseline 이전 버전은 적용하지 않는다. 신규 프로젝트에선 baseline이 불필요.

## 6. out-of-order는 신중히

- 기본은 **순서대로**만 적용. `outOfOrder`를 켜면 뒤늦게 끼어든 낮은 버전도 적용되지만, 환경 간 적용 순서가 달라질 수 있어 재현성 리스크가 있다.

## 7. undo에 의존하지 않는다

- Flyway의 자동 롤백(undo)은 제한적이고(에디션·범위 한계) 데이터 손실을 되돌리지 못한다.
- 롤백 전략은 **순방향 복구(forward-fix)** 와 백업·복제본을 기본으로 설계한다.

## 8. 로컬·CI·운영 DB를 동기화한다

- `info`/`validate`로 적용 상태와 체크섬 일치를 항상 확인. 로컬에서 먼저 검증하고 환경별 오버라이드는 분리된 폴더에만 둔다.
- 검증 명령은 특정 빌드 도구에 묶지 않고 **빌드시스템 자동감지**로 일반화한다(gradle/maven/npm/pnpm/yarn/CLI).
