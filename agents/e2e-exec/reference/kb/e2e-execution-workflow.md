---
title: E2E 실행 흐름 (수령→준비→실행→수집)
source: https://playwright.dev/docs/intro
last_fetched: 2026-06-24
consumers: [e2e-test-runner]
---

# KB: E2E 실행 흐름

QA가 설계한 시나리오를 받아 실제 E2E로 돌리고 결과를 수집하기까지의 표준 흐름.

## 단계
| 단계 | 행위 | 산출 |
|------|------|------|
| ① 수령 | `qa-test-designer` 시나리오/카탈로그 수령, stale·구조 검증 | 실행 대상 확정 |
| ② 준비 | 환경 게이팅, 픽스처·시드(고유 데이터) 준비, 변경 기록 | 시드 목록(정리 입력) |
| ③ 실행 | 직렬·결정적 순서로 1회 실행(무재시도), 결정적 대기 | per-scenario 결과 |
| ④ 수집 | run JSON·증거(screenshot/video/trace) 수집 | 아티팩트 |
| ⑤ 클렌징 | teardown/롤백 + 정리 검증 (→ test-data-lifecycle.md) | 원상복구 |
| ⑥ 리포트 | 다섯 수치·경로·클렌징 결과 보고 | 보고 |

## 빌드/프레임워크 자동감지 (가정 금지)
| 마커 | 판단 |
|---|---|
| `gradlew` / `build.gradle(.kts)` | Gradle |
| `pom.xml` | Maven |
| `package.json`(pnpm/yarn/npm) | Node — lock 파일로 패키지 매니저 구분 |
| `playwright.config.(ts|js)` | Playwright — `npx playwright test` |
| `cypress.config.(ts|js)` | Cypress |

- 모듈명·태스크명은 빌드 파일에서 **발견**한다(하드코딩 금지).
- Playwright는 브라우저 설치(`npx playwright install`)·웹서버 기동(`webServer` 설정)을 전제로 한다.

## 리뷰 훅
- [ ] 시나리오를 QA에서 수령했는가(임의 발명 아님). 카탈로그 stale/구조 검증을 거쳤는가.
- [ ] 빌드시스템·E2E 프레임워크를 **마커로 감지**했는가(Gradle/Playwright 가정 금지).
- [ ] 시드/변경한 리소스를 ②에서 **기록**했는가(⑤ 클렌징의 입력).
- [ ] 실행은 직렬·1회·결정적 대기인가(무재시도, 고정 sleep 없음).
- [ ] ⑤ 클렌징·정리 검증을 ⑥ 리포트 전에 완료했는가.
