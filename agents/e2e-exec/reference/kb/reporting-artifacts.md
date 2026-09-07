---
title: 리포팅·아티팩트 (screenshot/video/trace)
source: https://playwright.dev/docs/trace-viewer
last_fetched: 2026-06-24
consumers: [e2e-test-runner]
---

# KB: 리포팅·아티팩트

실패를 재현·디버그하고 결과를 공유 가능하게 남기는 규칙.

## 아티팩트 종류
| 아티팩트 | 용도 | 권장 |
|---|---|---|
| **screenshot** | 실패 시점 화면 캡처 | 실패 시(또는 핵심 단계) |
| **video** | 실행 과정 녹화 | 실패 재현용. 성공 시 최소화 |
| **trace** | 액션·네트워크·DOM 스냅샷 타임라인 | 실패 디버그의 핵심. Trace Viewer로 재생 |

- Playwright는 `trace: 'on-first-retry'`/`retain-on-failure` 등으로 **실패 시에만** trace를 남겨
  비용을 줄인다. trace는 Trace Viewer(`npx playwright show-trace`)로 단계별 재현한다.

## 리포트
- run-result JSON이 SSOT. 시각 리포트가 필요하면 단일 HTML로 렌더한다
  (외부 CDN 없는 오프라인 단일 파일).
- 두 스킬은 서로 호출하지 않고 **on-disk 아티팩트로만 연계**한다: 실행(JSON) → 렌더(HTML).

## 안전 (마스킹)
- 아티팩트·로그·리포트는 **공유**되므로 자격증명·PII를 **마스킹**한 뒤 기록한다. HTML은 가장
  공유되기 쉬운 산출물이므로 마스킹을 한 번 더 적용한다(이중 방어).
- 동적 텍스트(응답 본문·로그)는 XSS 안전하게 주입(`textContent`/이스케이프) — 렌더러 규약 위임.

## 리뷰 훅
- [ ] 실패에 재현 아티팩트(screenshot/video/trace)가 붙는가. 성공 시 아티팩트는 최소인가.
- [ ] trace로 실패를 단계별 재현할 수 있는가.
- [ ] 리포트는 run JSON에서 렌더하고, run JSON을 SSOT로 두는가.
- [ ] 아티팩트·로그·리포트에서 비밀·PII가 **마스킹**되었는가.
- [ ] 결과를 추측이 아니라 **관찰(증거)**로 보고하는가.
