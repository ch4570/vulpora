---
title: 문서 주석과 의미 계약 검증
source: https://docs.oracle.com/en/java/javase/21/docs/specs/javadoc/doc-comment-spec.html
last_fetched: 2026-08-11
consumers: [documentation-comment-author]
owner: documentation-comment-author
source_type: official
sources:
  - uri: https://docs.oracle.com/en/java/javase/21/docs/specs/javadoc/doc-comment-spec.html
    version: JDK 21
    locator: References, @param, @return, @throws, Comment Inheritance
  - uri: https://kotlinlang.org/docs/kotlin-doc.html
    version: current
    locator: Block tags
  - uri: https://doc.rust-lang.org/rustdoc/how-to-write-documentation.html
    version: current
    locator: Common Sections
last_verified: 2026-08-11
verified_by: Vulpora authoring session
review_after: 2027-02-11
status: verified
evals: [documentation-comment-author.language-native-positive.v1]
revalidate_on: [signature-change, source-version-change, eval-failure]
---

## 리뷰 훅 — 주석이 현재 계약과 일치하는가

- [ ] 모든 parameter와 type parameter 이름이 실제 선언과 일치하는가?
- [ ] 반환 설명이 void/Unit, nullable/Optional/Option, Result/exception 모델과 일치하는가?
- [ ] `throws`/Errors/Panics/Safety 조건이 body·호출부·테스트에서 확인되는가?
- [ ] generic bound, unit/range, side effect, blocking/suspending semantics를 발명하지 않았는가?
- [ ] link와 sample이 현재 symbol/API를 가리키는가?

## 선언별 대조 순서

1. **Declaration**: visibility, modifier, annotation, receiver, parameter, type parameter와 bound, return type을 적는다.
2. **Behavior**: body에서 validation, throw/error construction, I/O, mutation, callback, locking을 찾는다.
3. **Consumers**: 직접 call site와 test가 null/absence, exception/error, ordering을 어떻게 처리하는지 확인한다.
4. **Existing documentation**: 기존 문구를 위 사실과 비교해 stale claim을 찾는다.
5. **Reconciliation**: 각 tag/section을 `verified`, `remove`, `unknown`으로 판정한다.

## 자주 생기는 불일치

- parameter rename 뒤 예전 `@param` 이름이 남아 있음.
- Java/Kotlin generic의 type parameter 설명이 빠졌거나 값 parameter처럼 표기됨.
- nullable/Optional/Option 반환을 “항상 반환”이라고 씀.
- 구현이 더는 던지지 않는 예외 또는 구현 세부의 모든 unchecked exception을 `@throws`에 나열함.
- Kotlin의 `suspend`를 곧바로 non-blocking 보장이라고 단정함.
- Rust `unsafe` 함수의 호출자 의무가 `# Safety`에 없거나 코드 invariant와 다름.
- TypeScript signature의 type과 JSDoc type 표현이 서로 달라짐.

## 증거 강도

- 선언과 명시 annotation은 shape와 static contract의 강한 증거다.
- body와 deterministic test는 현재 behavior의 증거지만 외부 API의 장기 보장 여부는 별도 판단한다.
- 한 call site의 사용 방식만으로 전체 허용 범위나 thread safety를 단정하지 않는다.
- 기존 주석·README·issue만 있는 주장은 검증 전 문서 계약으로 승격하지 않는다.
