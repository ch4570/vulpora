---
title: 시나리오에서 실행 증거 보고서까지
source: https://junit.org/junit5/docs/current/user-guide/
last_fetched: 2026-08-11
consumers: [backend-test-author]
---

# 시나리오 → 테스트 → 보고서

테스트 framework의 display name, tag와 report는 시나리오를 식별하고 실행 결과를 추적하는 데 사용할 수
있다. 프로젝트의 기존 convention을 우선하고 별도 runner나 report dependency를 추가하지 않는다.

## 순서 불변식

1. `scenarios.md` 초안 작성과 한국어 윤문 완료.
2. scenario ID별 테스트 작성. 시나리오에 없는 동작이 발견되면 먼저 catalog 수정.
3. 가장 좁은 테스트 실행 후 영향 범위 suite 실행.
4. 결과·cleanup·mock ledger를 모아 보고서 초안 작성.
5. 보고서 한국어를 윤문하고 `report.md` 저장.

## 상태 정의

| 상태 | 의미 |
|---|---|
| PASS | 테스트가 실제 실행되어 exit 0이고 기대 결과를 단언함 |
| FAIL | 테스트가 실행되어 assertion/build/runtime failure가 남음 |
| BLOCKED | dependency 또는 안전한 infrastructure가 없어 작성/실행을 진행할 수 없음 |
| NOT_RUN | 테스트는 있으나 범위·시간·환경 제약으로 실행하지 않음 |

`scenarios.md`와 `report.md`에는 `korean-dev-writer: applied`를 기록한다. 이는 의미 검증 증거가 아니라
한국어 문장 검토를 수행했다는 process evidence다.

## 보고서 필수 항목

- scenario ID ↔ test path/display name ↔ 결과 표.
- 변경한 test/fixture/artifact 파일과 production file 변경 0건 확인.
- 실행 명령, exit code, 핵심 실패 메시지, 실행 시간.
- DB/OpenSearch/Redis/container image와 namespace, cleanup 성공/실패.
- mock ledger 또는 `없음`.
- NOT_RUN/BLOCKED, unrelated failure, coverage 공백과 재실행 조건.

## 리뷰 훅

- [ ] scenario 파일이 test 파일보다 먼저 작성됐다는 순서 증거가 있는가.
- [ ] 모든 테스트가 scenario ID와 연결되는가.
- [ ] PASS가 실제 exit 0 증거를 가지며 NOT_RUN과 섞이지 않는가.
- [ ] 실제 infrastructure와 cleanup 결과, mock ledger가 있는가.
- [ ] production file 변경 0건을 확인했는가.
- [ ] scenario와 report에 윤문 적용 사실이 기록됐는가.
