# Principles — Documentation Comment Author

## Sources

- Oracle, *Documentation Comment Specification for the Standard Doclet (JDK 21)* — https://docs.oracle.com/en/java/javase/21/docs/specs/javadoc/doc-comment-spec.html
- Kotlin, *Document Kotlin code: KDoc* — https://kotlinlang.org/docs/kotlin-doc.html
- TSDoc — https://tsdoc.org/
- JSDoc — https://jsdoc.app/
- Python, *PEP 257 – Docstring Conventions* — https://peps.python.org/pep-0257/
- Go, *Go Doc Comments* — https://go.dev/doc/comment
- Rust, *The rustdoc book: How to write documentation* — https://doc.rust-lang.org/rustdoc/how-to-write-documentation.html

## 1. 주석은 코드가 표현하지 못한 계약만 보완한다

- 이름·타입·본문을 그대로 풀어쓴 설명은 정보가 아니라 동기화 비용이다.
- 공개 사용자가 알아야 하는 조건, 단위, absence 의미, 오류, 부수 효과, lifecycle과 안전 제약을 우선한다.
- “모든 함수에 주석”보다 정확한 `skip` 판정이 낫다.

## 2. 현재 코드가 진실의 기준이다

- 문서 문구보다 실제 signature, annotation, body, test와 call site를 먼저 본다.
- 주석과 코드가 충돌하면 주석으로 문제를 덮지 않는다. 코드 계약의 소유자에게 모순을 넘긴다.
- 근거 없는 의도와 미래 계획을 현재 보장처럼 쓰지 않는다.

## 3. 문서 형식은 언어와 도구 체인을 따른다

- 각 언어의 공식 문서 도구가 인식하는 위치·delimiter·tag를 사용한다.
- 같은 언어 안에서도 프로젝트가 이미 선택한 dialect와 generator 설정을 존중한다.
- 다른 생태계의 tag나 관용구를 기계적으로 이식하지 않는다.

## 4. 문서 tag는 signature와 동기화한다

- parameter와 type parameter는 빠짐·중복·이름 불일치가 없어야 한다.
- 반환 설명은 void/Unit 여부와 null/Optional/Result 같은 absence·error 모델을 정확히 반영한다.
- throws/errors/panics/safety는 실제 발생 조건과 공개 계약을 설명할 때만 기록한다.
- link와 code literal은 실제 symbol과 정확히 연결한다.

## 5. 안정된 행위를 쓰고 구현 순서를 쓰지 않는다

- private call order나 임시 자료구조처럼 리팩터링에 흔들리는 세부보다 observable contract를 쓴다.
- 비자명한 이유가 구현 제약에 묶여 있어 꼭 필요한 경우에만 implementation note를 쓴다.
- 중복된 override 문서는 상속 메커니즘이나 상위 계약을 활용한다.

## 6. 한국어 품질과 의미 보존은 별도 게이트다

- 한국어 윤문은 `korean-dev-writer`에 맡기되, 윤문 결과를 사실 검증의 대체물로 삼지 않는다.
- 윤문 전후에 식별자, tag, generic, nullability, 오류 조건과 의미가 같아야 한다.
- 스킬을 사용할 수 없으면 임의 fallback보다 명시적 실패가 안전하다.

## 7. 편집 권한은 주석 span에만 있다

- 한 번의 작업에서 executable token은 하나도 바꾸지 않는다.
- 코드 수정이 필요해 보여도 위치와 이유만 보고하고 별도 역할로 넘긴다.
- 사용자 변경과 범위 밖 파일은 그대로 보존한다.
