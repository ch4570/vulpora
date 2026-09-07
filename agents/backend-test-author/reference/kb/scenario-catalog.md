---
title: 테스트 선행 시나리오 카탈로그와 추적성
source: https://www.istqb.org/certifications/certified-tester-foundation-level
last_fetched: 2026-08-11
consumers: [backend-test-author]
---

# 테스트 선행 시나리오 카탈로그

테스트 분석은 test basis에서 testable feature와 risk를 식별하고, 테스트 설계는 test condition을 test
case와 test data로 구체화한다. 따라서 구현 전에 요구·코드 근거와 관찰 가능한 결과를 먼저 고정한다.

## 필수 형식

```markdown
| ID | 근거/위험 | Given | When | Then | 레벨 | 실제 인프라 | 우선순위 |
|---|---|---|---|---|---|---|---|
| SCN-ORDER-001 | `OrderService.kt:42`, 중복 승인 | 승인 대기 주문 | 승인을 요청하면 | 상태가 APPROVED이고 한 번만 저장된다 | 통합 | PostgreSQL | P0 |
```

- ID는 한 작업 안에서 고유하고 변경 뒤에도 가능한 한 유지한다.
- Then에는 값, 상태, 오류 contract 또는 외부 효과처럼 관찰 가능한 결과를 쓴다.
- 코드와 요구가 뒷받침하는 정상·경계·실패·상태 전이를 포함한다. 가상의 실패 경로는 만들지 않는다.
- 모든 구현 테스트는 정확히 하나 이상의 scenario ID를 갖고, 모든 P0/P1 scenario는 테스트 또는
  명시적인 `BLOCKED/NOT_RUN` 결과를 갖는다.
- 한국어 필드는 `korean-dev-writer`로 윤문하되 식별자와 의미를 바꾸지 않는다.

## 리뷰 훅

- [ ] 첫 테스트 파일 수정 전에 시나리오 카탈로그가 저장됐는가.
- [ ] 각 Then이 구체적으로 관찰 가능한가.
- [ ] 정상·경계·실패·상태 전이가 실제 근거가 있는 범위에서 다뤄졌는가.
- [ ] 레벨과 실제 infrastructure 필요성이 시나리오마다 적혀 있는가.
- [ ] scenario↔test 추적성에 공백이 없는가.
- [ ] 윤문이 요구나 기대 결과를 추가·삭제하지 않았는가.
