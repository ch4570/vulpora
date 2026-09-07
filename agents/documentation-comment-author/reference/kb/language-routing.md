---
title: 언어별 문서 주석 라우팅
source: https://docs.oracle.com/en/java/javase/21/docs/specs/javadoc/doc-comment-spec.html
last_fetched: 2026-08-11
consumers: [documentation-comment-author]
owner: documentation-comment-author
source_type: official
sources:
  - uri: https://docs.oracle.com/en/java/javase/21/docs/specs/javadoc/doc-comment-spec.html
    version: JDK 21
    locator: General Syntax, Standard Tags
  - uri: https://kotlinlang.org/docs/kotlin-doc.html
    version: current
    locator: KDoc syntax, Block tags
  - uri: https://tsdoc.org/
    version: current
    locator: TSDoc syntax and standardization
  - uri: https://jsdoc.app/
    version: current
    locator: supported tags and getting started
  - uri: https://peps.python.org/pep-0257/
    version: PEP 257
    locator: What is a Docstring, Multi-line Docstrings
  - uri: https://go.dev/doc/comment
    version: current
    locator: Packages, Types, Funcs, Consts, and Vars
  - uri: https://doc.rust-lang.org/rustdoc/how-to-write-documentation.html
    version: current
    locator: Getting started, Common Sections
last_verified: 2026-08-11
verified_by: Vulpora authoring session
review_after: 2027-02-11
status: verified
evals: [documentation-comment-author.language-native-positive.v1]
revalidate_on: [source-version-change, generator-change, eval-failure]
---

## 리뷰 훅 — 언어와 toolchain에 맞는가

- [ ] 확장자뿐 아니라 build/doc 설정과 기존 공개 API 문서를 함께 확인했는가?
- [ ] 프로젝트가 이미 쓰는 dialect를 불필요하게 바꾸지 않았는가?
- [ ] 문서 주석이 해당 generator가 인식하는 선언 바로 앞 위치에 있는가?
- [ ] 언어가 표현하는 타입을 산문 tag로 중복하지 않았는가?

## Java — JavaDoc

- `/** ... */`는 문서화할 module/package/type/constructor/method/member 선언 바로 앞에 둔다.
- 첫 문장은 짧지만 선언의 역할을 완결되게 요약한다.
- 값 parameter는 `@param name`, type parameter는 `@param <T>`로 실제 이름과 일치시킨다.
- 값 반환이 있을 때 `@return`, 공개 계약에 포함되는 발생 조건에 `@throws`를 쓴다.
- symbol은 `{@link ...}`, code literal은 `{@code ...}`로 표현하고 실제 해소 가능성을 확인한다.
- override의 상위 문서가 정확하면 상속을 활용하고 같은 내용을 복제하지 않는다.

## Kotlin — KDoc

- `/** ... */`를 선언 앞에 두며 Kotlin의 Markdown과 `[Symbol]` link 문법을 사용한다.
- `@param`, `@property`, `@return`, `@throws`, `@receiver`, `@constructor`, `@sample`, `@see`,
  `@since`, `@suppress` 중 실제 계약에 필요한 tag만 쓴다.
- Kotlin은 별도 `@deprecated` KDoc tag 대신 `@Deprecated` annotation을 사용한다.
- nullable type(`T?`), default argument, extension receiver, coroutine/suspension과 예외 조건을 signature/body와 대조한다.

## TypeScript·JavaScript — TSDoc 또는 JSDoc

- TypeScript는 repository의 API Extractor/TSDoc 설정이나 기존 style이 TSDoc을 채택했는지 확인한다.
  채택했으면 TSDoc 문법을 따르고 TypeScript signature에 이미 있는 타입을 JSDoc식으로 반복하지 않는다.
- 그렇지 않으면 repository의 기존 JSDoc convention을 유지한다. JavaScript에서 타입 정보가 실제 소비자와
  tooling에 가치가 있을 때만 `@param`, `@returns`, `@throws`, `@template` 등을 사용한다.
- dialect가 섞여 generator가 tag를 해석하지 못하게 만들지 않는다.

## Python — docstring

- module, class, function/method의 첫 statement에 string literal로 둔다.
- 공개 함수는 한 줄 summary를 우선하고, 더 설명할 계약이 있을 때만 빈 줄 뒤 상세 설명을 둔다.
- repository가 Sphinx/Google/NumPy style을 이미 사용하면 일관되게 따르고, 없으면 PEP 257의 위치·summary 규칙만
  적용한다. 새 section dialect를 임의 도입하지 않는다.
- type annotation을 장황하게 반복하지 말고 값의 의미, shape/단위, absence/error와 side effect를 설명한다.

## Go — doc comment

- package 또는 top-level declaration 바로 앞에 일반 comment로 둔다.
- exported declaration의 설명은 가능한 한 선언 이름으로 시작해 독립적으로 읽히게 한다.
- package comment는 package clause 바로 앞에서 package의 목적과 중요한 사용 제약을 설명한다.
- 구현을 줄별로 해설하지 않고 호출자가 알아야 하는 concurrency, ownership, error와 side effect를 기록한다.

## Rust — Rustdoc

- item 바깥 문서는 `///`, crate/module 안쪽 문서는 `//!`를 사용한다.
- 실제 계약이 있을 때 `# Examples`, `# Errors`, `# Panics`, unsafe item의 `# Safety`를 사용한다.
- code example은 가능한 경우 doctest 대상이므로 실제 API와 컴파일 가능성을 확인한다.
- `Result`, `Option`, lifetime, ownership/borrowing과 unsafe invariant를 signature/body에서 검증한다.
