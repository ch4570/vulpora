---
title: 인덱스 종류 선택
source: https://www.postgresql.org/docs/current/indexes-types.html
pg_version: current (17/18)
last_fetched: 2026-06-22
consumers: [postgres-dba]
---

# KB: 인덱스 종류(access method) 선택

## 치트시트
| 종류 | 연산자/용도 | 정렬 | unique | 다중컬럼 |
|------|-------------|------|--------|----------|
| **B-tree**(기본) | `< <= = >= >` `BETWEEN` `IN` `IS NULL`, `LIKE 'x%'`(anchored) | ✓ | ✓ | ✓ |
| **Hash** | `=` 전용 | ✗ | ✓(PG10+) | ✗ |
| **GiST** | 범위/기하/`&&`/근접(`<->`) | ✓(opclass) | ✗ | ✓ |
| **SP-GiST** | 쿼드트리/IP/비균형 | ✓ | ✗ | ✓ |
| **GIN** | 배열/jsonb/전문검색 `@> <@ && ?` | ✗ | ✗ | ✓ |
| **BRIN** | 초대형 + 물리정렬 컬럼(시계열) `< <= = >= >` | ✗ | ✗ | ✓ |

## 리뷰 훅
- [ ] 등치만 → 굳이 Hash 안 써도 B-tree로 충분(이점 작음).
- [ ] `WHERE tags @> ...`, `jsonb @> ...`, 전문검색 → **GIN**.
- [ ] 범위타입(`daterange`) 중첩/근접 → **GiST**.
- [ ] 수억 행 + `created_at` 물리정렬 → **BRIN**(저장공간 극소). 물리정렬 깨지면 효과 없음.
- [ ] `LIKE '%중간%'` → B-tree 불가 → `pg_trgm` + GIN.

## 근거
- B-tree만 임의 정렬(ORDER BY 생략)·기본 unique 제약을 받친다.
- BRIN은 컬럼이 물리적 행 순서와 **상관(correlation) 높을 때만** 효과(append-only 시계열).
- GIN은 읽기 빠르고 **쓰기 느림**(다중 키 엔트리). jsonb는 `jsonb.md` 참조.
