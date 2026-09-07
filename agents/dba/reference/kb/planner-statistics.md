---
title: 플래너 통계 (옵티마이저는 통계가 전부)
source: https://www.postgresql.org/docs/current/planner-stats.html
pg_version: current (17/18)
last_fetched: 2026-06-22
consumers: [postgres-dba]
---

# KB: 플래너 통계

## 리뷰 훅
- [ ] 대량 INSERT/UPDATE/DELETE 또는 적재/백필 직후 **`ANALYZE`** 를 돌렸는가.
- [ ] `EXPLAIN`의 추정 rows가 실제와 어긋나면 → 통계 stale 또는 **상관 컬럼**.
- [ ] 자주 함께 쓰는 WHERE 컬럼이 상관관계면 **`CREATE STATISTICS`**(dependencies/mcv/ndistinct).
- [ ] 분포가 치우친 고선택 컬럼은 `ALTER TABLE ... ALTER COLUMN x SET STATISTICS 500`.
- [ ] `pg_stat_user_tables.last_analyze/last_autoanalyze`로 통계 신선도 확인.

## 근거 (공식 문서 요지)
- 통계 저장: `pg_class`(reltuples, relpages) + `pg_statistic`(읽기 쉬운 뷰 `pg_stats`).
- ANALYZE가 수집: `null_frac`, `n_distinct`, `most_common_vals`, `histogram_bounds`, `correlation`.
- **reltuples/relpages는 실시간이 아님** — VACUUM/ANALYZE/일부 DDL에서만 갱신. 그래서 stale 시 오추정.
- `default_statistics_target`(기본 100) ↑ → MCV/히스토그램 정밀도 ↑ (공간·ANALYZE 비용 ↑).
- **확장 통계(`CREATE STATISTICS`)**: 플래너의 "조건 독립 가정"이 깨지는 상관 컬럼용.
  - `dependencies`(함수 종속, 등치·IN 한정), `ndistinct`(GROUP BY 조합), `mcv`(다변량 최빈값).
  - 범위/LIKE/컬럼-컬럼 비교엔 적용 안 됨.

## 처방 예시
```sql
ANALYZE big_table;                          -- 적재/백필 후 필수
CREATE STATISTICS s_city_zip (dependencies, mcv) ON city, zip FROM addr;
ALTER TABLE big_table SET (autovacuum_analyze_scale_factor = 0.01);
```
> 남용 금지: 실제로 오추정이 측정될 때만 확장 통계를 만든다(ANALYZE 비용·저장 낭비).
