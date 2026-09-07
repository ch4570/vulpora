---
title: 네이밍 / 버저닝
source: https://documentation.red-gate.com/fd/migrations-184127470.html
last_fetched: 2026-06-24
skills: [flyway]
---

# KB: 네이밍 / 버저닝

## 파일명 문법
```
<PREFIX><VERSION>__<DESCRIPTION>.<SUFFIX>
예: V20260623.140000__create_table_order.sql
    R__refresh_order_summary_view.sql
```
- **PREFIX**: `V`(versioned), `R`(repeatable), `U`(undo).
- **VERSION**: versioned만. 점/언더스코어로 구분된 숫자(`1`, `1.1`, `20260623.140000`).
- **SEPARATOR**: 더블 언더스코어 `__`.
- **DESCRIPTION**: 사람이 읽는 설명. 본 저장소는 `[A-Za-z0-9_]{1,50}` 강제.

## 버전 비교
- VERSION은 숫자 파트별로 비교(`1.10` > `1.9`). 0 패딩 불필요.
- **타임스탬프 버전**(`yyyyMMdd.HHmmss`)은 브랜치 병합 시 충돌·역전을 줄여 협업에 유리.

## 하우스 스타일 (본 저장소)
- `V{ts}__{domain}__{action}_{entity}.sql` (예: `V20260428.110000__order__create_table_order.sql`).
- 빌드의 마이그레이션 파일명 검증을 통과해야 한다(문법 위반 = 빌드 실패).

## 충돌 방지
- 같은 VERSION 두 개 금지(적용 시 에러).
- 협업: 정수 시퀀스 대신 타임스탬프 → 동시에 작업해도 충돌 가능성↓.

## 리뷰 훅
- [ ] PREFIX/VERSION/`__`/DESCRIPTION 문법을 정확히 지켰는가.
- [ ] versioned 버전이 기존과 중복되지 않는가.
- [ ] DESCRIPTION이 `[A-Za-z0-9_]` 범위·길이 제한을 지키는가.
- [ ] 협업 환경이면 타임스탬프 버전을 쓰는가(병합 충돌·역전 방지).
- [ ] 파일이 표준 마이그레이션 디렉터리에 있는가(환경 폴더는 오버라이드 전용).
