---
title: Effective Kotlin (Marcin Moskała)
source: https://jihunparkme.gitbook.io/docs/book/effective-kotlin
sources_extra:
  - Effective Kotlin, Marcin Moskała (kt.academy)
versions: Effective Kotlin 2nd ed. 요약(gitbook)
last_fetched: 2026-06-22
note: gitbook은 클라이언트 렌더라 자동 패치 불가 — 항목 번호는 Effective Kotlin(Moskała) 목차 기준으로 기재. 인용 전 최종 확인 권장.
consumers: [code-refactor-agent]
---

# KB: Effective Kotlin (요약 — 안정성·가독성·코드설계·효율성)

> 구성: **1부 좋은 코드(안정성·가독성)** / **2부 코드 설계(재사용성·추상화·객체생성·클래스설계)** / **3부 효율성(비용·컬렉션)**.

## 리뷰 훅
- [ ] **가변성 제한(item 1)** — `var`/가변 컬렉션 남용 → `val`·읽기전용·`copy()`. 상태 변경점을 줄여라.
- [ ] **변수 스코프 최소화(item 2)** — 변수는 쓰는 곳 가까이, 좁은 스코프로.
- [ ] **플랫폼 타입 제거(item 3)** — 자바 연동의 플랫폼 타입(`Type!`)을 경계에서 즉시 제거.
- [ ] **적절한 null 처리 / `!!` 회피(item 8)** — 비즈니스 로직 `!!` 금지, `?.`/`?:`/스마트캐스트로. (item 4 "추론 타입 노출 금지"와는 별개 — 혼동 주의)
- [ ] **인자·상태 제한(item 5)** — `require`/`check`로 기대를 명시(빠른 실패).
- [ ] **결과 부재는 null/sealed Result(item 7)** — 예측 가능한 실패는 null/Result, 예측 불가는 예외. 자원은 `use`(item 9).

## 2부 — 가독성 · 코드 설계 (Readability / Design)
- [ ] **가독성을 위한 설계(item 11)** — 관습적·예측 가능한 코드. 영리함보다 명확함.
- [ ] **연산자 의미는 함수명과 일치(item 12)** — 연산자 오버로딩 남용 금지.
- [ ] **단일 추상화 수준(item 26) / 변경 보호 추상화(item 27)** — 한 함수는 한 추상화 수준, 추상화로 변경 파급 차단.
- [ ] **가시성 최소화(item 30)** — 공개 표면을 좁혀 결합을 줄인다.
- [ ] **상속보다 합성(item 36)** — 행동 재사용은 위임으로. 상속은 is-a일 때만.
- [ ] **함수 타입·함수형 인터페이스(item 38) / tagged class보다 sealed 계층(item 39)** — 제한된 계층은 `sealed`로 망라성 확보.
- [ ] **팩토리 함수(item 33) / 명명 인자 가진 주 생성자(item 34)** — 생성 의도 표현.
- [ ] **DSL/빌더는 복잡 생성에만(item 35).** 기본은 명명 인자(named args)·기본값.

## 3부 — 효율성 (Efficiency)
- [ ] **불필요한 객체 생성 회피(item 45)** — 박싱·정규식 재컴파일 등.
- [ ] **다단계·큰 컬렉션은 `Sequence`(item 49)** — 처리 단계 2+이고 데이터가 크면 지연 평가, 짧으면 `List`가 빠름.
- [ ] **연산 수 제한(item 50)** — 중간 컬렉션 최소화, 적절한 연산 선택(`filter`+`map` 순서, `asSequence`).
- [ ] **inline 한정자(item 46)** — 함수형 파라미터의 람다 오버헤드 제거(고차함수 핫패스).

## 인용 시
"Effective Kotlin '가변성 제한' — `var` 누적 상태를 `fold`/`val`로" /
"EK '추상화 레벨 통일' — 한 함수에 SQL·정책·포맷이 섞임 → Extract" 식으로(`source` URL 병기).

## 리팩터링 연결
- 본 항목들은 `refactoring-catalog.md`의 처방과 짝지어 쓴다(예: 가변성 제한 ↔ Replace Temp with Query,
  sealed 분기 ↔ Replace Conditional with Polymorphism).
