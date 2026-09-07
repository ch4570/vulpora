---
title: jsonb 설계와 인덱싱
source: https://www.postgresql.org/docs/current/datatype-json.html
pg_version: current (17/18)
last_fetched: 2026-06-22
consumers: [postgres-dba]
---

# KB: jsonb

## 리뷰 훅
- [ ] `json` 대신 **`jsonb`** 쓰는가(이진·인덱싱 가능·빠름). json은 텍스트 보존 필요 시만.
- [ ] **정규화 회피용 jsonb 남용** 아닌가 — 자주 조회/집계하는 필드는 관계형 컬럼이 낫다.
- [ ] 한 행 update가 **행 전체 잠금** → 큰 문서·고빈도 갱신이면 경합/bloat 주의.
- [ ] 컨테인먼트 조회(`@>`)가 많으면 `jsonb_path_ops` GIN(작고 빠름), 키존재(`?`)도 쓰면 기본 `jsonb_ops`.

## 연산자/인덱스
```sql
-- 키 존재까지 (?,?|,?&,@>,@?,@@)
CREATE INDEX ON api USING gin (jdoc);
-- 컨테인먼트 전용 (@>,@?,@@) — 더 작고 빠름, '?' 불가
CREATE INDEX ON api USING gin (jdoc jsonb_path_ops);
-- 자주 쓰는 경로만
CREATE INDEX ON api USING gin ((jdoc -> 'tags'));
```
- 추출: `->`(jsonb), `->>`(text). 컨테인먼트: `@>`. 존재: `?`(top-level만). 경로: `@?`/`@@`.

## 근거
- 문서는 **예측 가능한 구조**를 권장(집계·쿼리 용이). 무정형 남발은 유지보수·동시성 비용.
