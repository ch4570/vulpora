# request KB 인덱스

요청 DTO 설계·검증 작업 시 읽을 KB(공식문서 기반)의 목차다.
판단 기준은 `../principles.md`, 정확한 문법·동작의 SSOT는 이 디렉터리의 KB 파일이다.

## 작업 유형 → 읽을 KB

| 작업 유형 | 먼저 읽을 KB |
|-----------|--------------|
| 새 요청 DTO 골격 만들기 | [`kotlin-validation-site-target.md`](kotlin-validation-site-target.md), [`request-dto-immutability.md`](request-dto-immutability.md) |
| 어떤 바인딩 애너테이션을 쓸지 결정 | [`mvc-argument-binding.md`](mvc-argument-binding.md) |
| 경로/쿼리/본문 분리 결정 | [`mvc-argument-binding.md`](mvc-argument-binding.md), `../principles.md` §6 |
| 필드 제약(@NotBlank/@Size/@Min 등) 고르기 | [`bean-validation-basics.md`](bean-validation-basics.md) |
| 검증이 동작 안 함(조용한 통과) 디버깅 | [`validation-triggering.md`](validation-triggering.md), [`kotlin-validation-site-target.md`](kotlin-validation-site-target.md) |
| 중첩 객체/컬렉션 검증 | [`validation-triggering.md`](validation-triggering.md) |
| `@RequestParam`/`@PathVariable` 제약 검증 | [`validation-triggering.md`](validation-triggering.md) |
| 생성/수정 등 케이스별 검증(그룹) | [`bean-validation-basics.md`](bean-validation-basics.md), [`validation-triggering.md`](validation-triggering.md) |
| 외부 입력 신뢰 경계 설계 | [`input-validation-boundary.md`](input-validation-boundary.md) |
| 검증/바인딩 실패 응답(400, Problem Detail) | [`binding-error-handling.md`](binding-error-handling.md) |
| Kotlin 제약이 적용 안 됨 | [`kotlin-validation-site-target.md`](kotlin-validation-site-target.md) |

## KB 한 줄 요약

| 파일 | 요약 | 출처 |
|------|------|------|
| [`mvc-argument-binding.md`](mvc-argument-binding.md) | `@RequestBody`/`@RequestParam`/`@PathVariable`/`@ModelAttribute`/`@RequestHeader` 의미·필수여부·defaultValue·컨텐트 협상 | Spring MVC 문서 |
| [`bean-validation-basics.md`](bean-validation-basics.md) | Jakarta 표준 제약 목록, `@NotNull`/`@NotBlank`/`@NotEmpty` 차이, 조합, 메시지 보간, 그룹 | Jakarta Bean Validation 3.0 |
| [`validation-triggering.md`](validation-triggering.md) | `@Valid` vs `@Validated`, 중첩 cascade, 메서드 검증(`@RequestParam` 제약), 트리거 누락 함정 | Spring 검증 문서 + Jakarta |
| [`kotlin-validation-site-target.md`](kotlin-validation-site-target.md) | Kotlin `@field:` 사이트 타깃 필요 이유, data class 불변, 널 매핑 | Kotlin 문서 + Spring |
| [`request-dto-immutability.md`](request-dto-immutability.md) | 불변 값 객체, 방어적 복사, DTO≠엔티티 | Spring 문서 + Effective Java |
| [`input-validation-boundary.md`](input-validation-boundary.md) | 경계 검증, 외부 입력 불신, 검증 vs 정제 vs 인코딩, 검증 vs 비즈니스 규칙 | OWASP + Jakarta |
| [`binding-error-handling.md`](binding-error-handling.md) | `MethodArgumentNotValidException`/`BindException`/`ConstraintViolationException`, RFC 9457 Problem Detail 매핑 | Spring 에러 처리 + RFC 9457 |

## principles.md 와의 관계

- `principles.md`는 **판단 기준(헌법)** — "무엇을/왜". 불변성, 경계 검증, fail fast 등.
- KB는 **사실/문법의 SSOT** — "정확히 어떻게". 공식문서·표준에 근거.
- **충돌 시 KB(공식문서) > principles.** principles는 KB가 답하지 않는 설계 판단을 메운다.

## 갱신 정책

- 각 KB 프런트매터의 `last_fetched`는 출처 문서를 마지막으로 확인한 날짜다(현재 `2026-06-24`).
- Spring/Jakarta/RFC 버전 갱신 시 해당 KB를 재확인하고 `last_fetched`를 갱신한다.
- 출처 URL이 바뀌면(문서 개편) `source`를 함께 수정한다.

## TODO (향후 KB)

- `custom-constraints.md` — 사용자 정의 제약(`@Constraint` + `ConstraintValidator`) 작성.
- `cross-field-validation.md` — 필드 간 상관 검증(클래스 레벨 제약).
- `pagination-sort-params.md` — 페이지네이션/정렬 쿼리 파라미터 표준 DTO.
- `multipart-file-requests.md` — 멀티파트/파일 업로드 요청 검증.
