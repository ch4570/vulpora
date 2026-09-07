---
title: 데이터 타입 선택
source: https://www.postgresql.org/docs/current/datatype.html
pg_version: current (17/18)
last_fetched: 2026-06-22
consumers: [postgres-dba]
---

# KB: 데이터 타입 선택

## 리뷰 훅 (플래그 기준)
- [ ] **금액/정밀계산 = `numeric`**. `real/double` 금지(0.1+0.2≠0.3). (정수 통화 원단위면 `bigint`도 허용하되 도메인/주석으로 의미 고정)
- [ ] **식별자 = `bigint`** + **`GENERATED ... AS IDENTITY`**(권장). `serial`은 레거시.
- [ ] **시각 = `timestamptz`**(권장, UTC 저장/세션TZ 표시). `timestamp`(무TZ)는 다지역에서 모호. 날짜만 `date`.
- [ ] **문자열 = `text`** 또는 `varchar(n)`(성능 동일, 길이는 **업무 규칙일 때만**). 근거 없는 `varchar(50)` 질문.
- [ ] **JSON = `jsonb`**(json 아님). 단 정규화 회피용 남용 금지(`jsonb.md`).
- [ ] **배열**: 빈배열/NULL 혼재 막게 `NOT NULL DEFAULT '{}'`. 과용은 정규화 부족 신호.
- [ ] **enum**: 값 추가에 `ALTER TYPE` 필요·삭제 어려움 → 변하는 코드값은 코드테이블+FK가 유리.
- [ ] **uuid**: 16바이트(>bigint 8). 전역 유일 필요할 때만. 랜덤 UUID는 인덱스 지역성 나쁨(시간순 v7 권장).
- [ ] **boolean** 입력형식 표준화(t/f/true/false/1/0 다 받음).
- [ ] **range 타입**(`int4range/daterange/tstzrange`): 기간/구간. 중첩 금지는 EXCLUDE(`constraints.md`).
- [ ] **inet vs cidr**: 호스트는 `inet`(호스트비트 보존), 네트워크는 `cidr`.

## 표준화 팁
```sql
CREATE DOMAIN krw AS numeric(18,0) CHECK (VALUE >= 0);   -- 금액 표준 도메인
CREATE DOMAIN email AS text CHECK (VALUE ~ '^[^@]+@[^@]+$');
```
