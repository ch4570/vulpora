---
title: 함수 변동성 (VOLATILE/STABLE/IMMUTABLE)
source: https://www.postgresql.org/docs/current/xfunc-volatility.html
pg_version: current (17/18)
last_fetched: 2026-06-22
consumers: [postgres-dba]
---

# KB: 함수 변동성

## 3분류
| 분류 | 의미 | 인덱스 조건 | 생성컬럼/CHECK | 플래너 |
|------|------|-------------|----------------|--------|
| **VOLATILE**(기본) | 매 호출 결과 다를 수 있음, DB 수정 가능 | ❌ 불가 | ❌ 불가 | 매 행 재평가 |
| **STABLE** | 한 문장 내 동일(스냅샷) | ✅ 가능 | ✅ 가능 | 한 번 평가 |
| **IMMUTABLE** | 영원히 동일 | ✅ 가능 | ✅ 가능 | 상수 폴딩 |

## 리뷰 훅
- [ ] WHERE에 쓴 함수가 `VOLATILE`이면 인덱스를 못 타고 매 행 재평가 → STABLE/IMMUTABLE 확인.
- [ ] **표현식 인덱스/생성컬럼/CHECK**에 쓰는 함수는 반드시 STABLE 이상(IMMUTABLE 권장).
- [ ] TimeZone/`search_path` 등 설정 의존 함수를 IMMUTABLE로 라벨하면 **위험**(STABLE이어야 함).
- [ ] `now()/current_timestamp`는 STABLE(트랜잭션 고정), `clock_timestamp()/random()`은 VOLATILE.

## 근거 (공식 문서 요지)
- STABLE/IMMUTABLE은 쿼리 시작 스냅샷을 본다 → 인덱스 스캔 조건에서 1회 평가 가능.
- **IMMUTABLE 오라벨이 가장 위험**: 계획 시 상수 폴딩되어 prepared/plan-cache에서 stale 값 재사용.
- STABLE이 VOLATILE 함수를 호출하면 변경을 못 봄 → 논리 버그(리뷰어가 잡아야).
- 생성컬럼·CHECK 표현식에 VOLATILE 금지(문서 명시).
