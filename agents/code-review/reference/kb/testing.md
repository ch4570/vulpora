---
title: 테스트 (Test Pyramid · Unit Test — Martin Fowler)
source: https://martinfowler.com/bliki/TestPyramid.html
sources_extra:
  - https://martinfowler.com/bliki/UnitTest.html
  - https://martinfowler.com/bliki/TestDouble.html
  - https://martinfowler.com/articles/practical-test-pyramid.html
versions: martinfowler.com (bliki/articles)
last_fetched: 2026-06-22
consumers: [kotlin-spring-reviewer]
---

# KB: 테스트 (Fowler)

## 리뷰 훅
- [ ] 새 로직에 단위 테스트가 있는가. 피라미드 비율(단위 多 > 통합 > E2E 소)이 깨졌는가.
- [ ] 테스트 가능 설계인가(의존성 주입으로 외부 격리). 정적/싱글톤 강결합으로 테스트 불가한가.
- [ ] 테스트 더블(stub/mock/fake)을 의미에 맞게 쓰는가 — 과도한 목으로 구현에 결합됐는가.
- [ ] AAA(Arrange-Act-Assert), 경계/예외 케이스, 결정성(시간·랜덤 격리)을 지키는가.
- [ ] 통합/E2E를 단위로 대체 가능한 것에 과용하는가(느림·취약).

## 근거 (Fowler 요지)
- **Test Pyramid**: 빠르고 격리된 **단위 테스트가 토대**, 통합은 그 위, 느린 E2E(UI)는 최소. 역피라미드(아이스크림콘)는 느리고 취약. (bliki/TestPyramid, practical-test-pyramid)
- **Unit Test**: "단위"의 범위는 팀마다 다르나 핵심은 **빠르고 격리되어 자주 실행 가능**할 것. (bliki/UnitTest)
- **Test Double**: stub(상태 응답) vs mock(행위 검증) 구분 — 행위 검증 과용은 리팩터링 취약성을 키운다. (bliki/TestDouble)

## 인용 시
"Fowler `Test Pyramid` 기준 E2E로 단위 로직을 검증 → 느리고 취약, 단위로 내리라" 식으로.

## 보조 (실무 도구)
- Kotlin: JUnit5 + MockK/Kotest, `@SpringBootTest`는 통합에 한정(슬라이스 테스트 `@WebMvcTest`/`@DataJpaTest` 우선).
- 책 기반 FIRST/체크리스트는 스킬 내부 `references/checklist-and-severity.md` 병용.
