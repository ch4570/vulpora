---
title: 테스트 리포트 구조와 JUnit XML 스키마
source: https://junit.org/junit5/docs/current/user-guide/#running-tests-build-reporting
last_fetched: 2026-06-24
skills: [e2e-report-renderer]
---

# KB: 테스트 리포트 구조 / JUnit XML 스키마 / 집계

테스트 리포트의 정보 구조와, 사실상 표준인 JUnit XML(Ant `junit` task → Maven Surefire가
계승) 스키마를 정리한다. 렌더러는 자체 JSON을 입력으로 받지만, 그 JSON이 표현하는 개념은
이 표준 모델과 1:1 대응하므로 구조·집계 규칙을 여기서 근거로 삼는다.

## 1. 리포트의 4대 구역 (위→아래)

| 구역 | 목적 | 핵심 내용 |
|------|------|-----------|
| **요약 카드(Summary)** | 한눈에 전체 건강도 | total, pass, fail, skipped, (선택)failedDependency, probeError, 소요시간 |
| **결과 표(Results table)** | 케이스별 상태 일람 | ID / 목적 / 데이터셋 / 기대 / 실제 / 상태 / 지연(latency) |
| **실패 상세(Failures detail)** | 실패만 깊게 | 기대 vs 실제, 메시지/스택, 증거(스크린샷·로그·트레이스) |
| **남은 리스크(Remaining risks)** | 통과해도 남는 위험 | 미커버 영역, 알려진 한계, 후속 TODO |

- 요약은 **집계값**, 결과 표는 **개별값**이다. 두 값은 반드시 일치해야 한다(아래 3절).
- 실패 상세는 결과 표의 부분집합을 "펼친" 것이다. 새 데이터가 아니다.

## 2. JUnit XML 핵심 스키마

Ant/Surefire `TEST-*.xml`의 골격. 테스트 리포트가 표현해야 할 최소 필드 집합의 사실상 표준.

### `<testsuite>` (집계 루트)
| 속성 | 의미 |
|------|------|
| `name` | 스위트 이름 |
| `tests` | 전체 케이스 수 |
| `failures` | 단언 실패(assertion) 수 |
| `errors` | 예외/오류(테스트 코드 밖) 수 |
| `skipped` | 건너뛴 수 |
| `time` | 총 소요(초) |
| `timestamp` | 실행 시각(ISO-8601) |

### `<testcase>` (개별 케이스)
| 속성 | 의미 |
|------|------|
| `name` | 케이스 이름 |
| `classname` | 그룹/영역(area) |
| `time` | 케이스 소요(초) → latency 컬럼의 원천 |

### 자식 요소(케이스 상태를 결정)
| 요소 | 의미 | 상태 매핑 |
|------|------|-----------|
| (없음) | 단언 통과 | PASS |
| `<failure message="..." type="...">` | 단언 실패. 본문에 상세 | FAIL |
| `<error message="..." type="...">` | 예외/환경 오류 | FAIL 또는 probe-error |
| `<skipped message="...">` | 건너뜀(전제 미충족 등) | SKIPPED |
| `<system-out>` / `<system-err>` | 표준출력/표준오류 캡처 | 증거(로그 꼬리)로 임베드 |

- **`failure`(단언 실패)와 `error`(코드 밖 오류)는 의미가 다르다.** 전자는 테스트가 정상
  동작하며 결과가 기대와 다른 것, 후자는 테스트/환경 자체가 깨진 것. 리포트는 이를 구분해
  보여야 한다(렌더러의 `FAIL` vs `PROBE-ERROR` 구분과 같은 정신).

## 3. 집계 무결성 (가장 중요)

- **합산 항등식**: `total = pass + fail + skipped (+ failedDependency + probeError)`.
  이 식이 어긋나는 리포트는 신뢰 불가 → 렌더링 중단(SKILL.md `REN-5.SUMMARY-MATH`).
- JUnit XML에서도 `tests`는 `failures + errors + skipped + (성공)` 을 포괄한다. 도구가
  채워준 `tests` 값을 **다시 더해 검증**할 수 있다.
- **집계값은 생성 측이 확정한다.** 렌더러는 `summary.total`을 **그대로 복사**하고, 합산은
  *읽을 때 1회* 검증만 한다. 화면에서 재계산하지 않는다(view-layer-never-reinterprets).
- 상태 카운트는 **상호 배타(mutually exclusive)** 여야 한다. 한 케이스가 동시에 PASS이면서
  SKIPPED일 수 없다. 중복 집계는 합산 불일치로 드러난다.

## 4. 범용 예시

`Order`/`Member`/`Article` 같은 일반 엔티티 시나리오로 표현한다.

```text
요약: total=42  PASS=37  FAIL=3  SKIPPED=2
표:
  ID        목적                    상태   지연
  ord-001   주문 생성 happy path     PASS   210ms
  ord-007   재고 부족 시 주문 거절    FAIL   180ms
  mbr-003   탈퇴 회원 로그인 차단     SKIPPED -
```
- ID는 **안정적 식별자**여야 추세/비교에서 케이스를 교차 매칭할 수 있다(다음 KB 참조).

## 리뷰 훅
- [ ] 요약 카드의 합이 결과 표의 상태 카운트와 일치하는가(`total = pass + fail + skipped + ...`).
- [ ] `total`을 JS에서 재계산하지 않고 입력값을 그대로 복사하는가.
- [ ] 단언 실패(`failure`)와 환경/예외 오류(`error`/probe-error)를 구분해 표시하는가.
- [ ] 각 케이스에 안정적 ID가 있어 추세/비교에서 교차 매칭이 가능한가.
- [ ] 상태 카운트가 상호 배타적인가(한 케이스가 두 상태로 중복 집계되지 않는가).
- [ ] latency 컬럼이 케이스별 `time`(소요)에서 왔고 단위가 표기되는가.
- [ ] 리포트가 4대 구역(요약/표/실패상세/리스크)을 빠짐없이 갖추는가.
