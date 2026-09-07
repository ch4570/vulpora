# fixture: sample-schema-doc

`schema-cartographer` 에이전트 / `schema-doc-extract` 스킬의 **스키마별 명세 파일 분리** 동작을 검증하기 위한
멀티스키마 정적 fixture다. 라이브 DB 없음 — 마이그레이션 SQL + 엔티티 코드만으로 스키마를 도출한다.

## 구성
- `db/migration/` — Flyway 관습 마이그레이션(`V{yyyyMMdd.HHmmss}__module__desc.sql`).
  - `public` 스키마: `member`
  - `sales` 스키마: `order` (FK→member, CHECK, 인덱스)
- `src/Order.java` — JPA 엔티티. `coupon_id`는 코드에만 있어 **drift** 예시를 만든다.

## 기대 산출(에이전트가 생성해야 할 것)
- `docs/schema/erd.md` — 전체 ERD 단일 파일(cross-schema 관계 포함).
- `docs/schema/tables/_index.md` — 스키마 인덱스 + 전역 drift 요약.
- `docs/schema/tables/public.md` — `member` 명세.
- `docs/schema/tables/sales.md` — `order` 명세 + 해당 스키마 drift(`coupon_id`).

> 두 스키마가 한 파일에 섞이면 실패다(스키마당 파일 하나).
