# Documentation Comment Author Knowledge Base — 색인

## 작업 유형 → 읽을 KB

| 작업 신호 | KB | 판단 범위 |
|---|---|---|
| `.java`, `.kt`, `.ts`, `.js`, `.py`, `.go`, `.rs`; 문서 형식이나 tag 선택 | [language-routing](language-routing.md) | JavaDoc/KDoc/TSDoc/JSDoc/docstring/Go doc/Rustdoc 라우팅 |
| parameter, generic, return, nullability, throws/error, side effect; stale comment 검증 | [semantic-contract-verification](semantic-contract-verification.md) | 선언·행위와 문서 계약의 1:1 대조 |
| 자명한 주석, override 중복, 구현 설명, refactoring 내성; comment-only edit | [comment-selection-and-safety](comment-selection-and-safety.md) | 쓸지 말지와 최소 안전 편집 |

## 원칙 문서와의 관계

- `../principles.md`는 정확성·절제·언어 고유 형식·의미 보존이라는 장기 판단 기준이다.
- KB는 현재 언어와 작업 신호에 필요한 공식 문법과 검증 체크리스트다.
- 기술 사실은 적용 중인 toolchain/version의 공식 문서와 실제 code/config가 우선한다.

## 갱신 정책

- `last_fetched`는 원문을 확인한 날짜이며 정확성 인증 날짜가 아니다.
- JDK/Kotlin/TypeScript/Python/Go/Rust 문서 규칙이나 프로젝트 generator가 바뀌면 해당 KB와 eval을 재검증한다.
- Swift DocC, C# XML documentation, C/C++ Doxygen은 실제 소비 요구가 생길 때 별도 topic으로 추가한다.
