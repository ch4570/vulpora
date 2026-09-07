---
title: Jakarta Bean Validation 기본 제약과 규칙
source: https://jakarta.ee/specifications/bean-validation/3.0/
last_fetched: 2026-06-24
skills: [request]
---

# Jakarta Bean Validation (JSR 380/381) 기본

요청 DTO 검증에 쓰는 표준 제약(constraint)과 규칙을 정리한다.
출처: Jakarta Bean Validation 3.0 Specification (`jakarta.validation.constraints.*`).

## 1. 표준 내장 제약

| 제약 | 적용 대상 | 의미 |
|------|-----------|------|
| `@NotNull` | 모든 타입 | null 금지(빈 문자열/컬렉션은 통과) |
| `@NotBlank` | `CharSequence` | null 금지 + 트림 후 길이 > 0 |
| `@NotEmpty` | `CharSequence`/`Collection`/`Map`/배열 | null 금지 + size > 0 |
| `@Size(min,max)` | `CharSequence`/`Collection`/`Map`/배열 | 길이/크기 범위 |
| `@Min` / `@Max` | 정수 계열 | 최소/최대 값(포함) |
| `@DecimalMin` / `@DecimalMax` | 숫자/문자열 | 소수 포함 경계(`inclusive` 옵션) |
| `@Positive` / `@PositiveOrZero` | 숫자 | 양수 / 0 이상 |
| `@Negative` / `@NegativeOrZero` | 숫자 | 음수 / 0 이하 |
| `@Digits(integer,fraction)` | 숫자 | 정수/소수 자릿수 한도 |
| `@Pattern(regexp)` | `CharSequence` | 정규식 일치 |
| `@Email` | `CharSequence` | 이메일 형식 |
| `@Past` / `@PastOrPresent` | 날짜/시간 | 과거 / 과거·현재 |
| `@Future` / `@FutureOrPresent` | 날짜/시간 | 미래 / 미래·현재 |
| `@AssertTrue` / `@AssertFalse` | `boolean` | 불리언 단언 |

## 2. @NotNull vs @NotBlank vs @NotEmpty (핵심 구분)

- `@NotNull`: 값이 존재만 하면 통과. `""`(빈 문자열)도 통과한다.
- `@NotEmpty`: null 아님 + 크기 1 이상. 문자열 `" "`(공백만)은 통과한다(길이 1).
- `@NotBlank`: null 아님 + **트림 후** 길이 1 이상. 공백-only는 거부.
- 필수 문자열 입력은 보통 `@NotBlank`, 컬렉션/배열은 `@NotEmpty`, 객체/숫자/열거형은 `@NotNull`.

## 3. 제약 조합 (Composition)

- 한 요소에 여러 제약을 함께 선언할 수 있고, 모두 통과해야 유효하다.

```kotlin
data class CreateMemberRequest(
    @field:NotBlank
    @field:Size(max = 50)
    val name: String,

    @field:NotBlank
    @field:Email
    val email: String,

    @field:NotNull
    @field:Min(0)
    @field:Max(150)
    val age: Int,
)
```

- 반복되는 제약 묶음은 **합성 제약(composed constraint)** 으로 추출할 수 있다(메타 애너테이션).

## 4. 메시지 보간 (Message Interpolation)

- 각 제약은 `message` 속성으로 검증 실패 메시지를 지정. 기본은 `{jakarta.validation.constraints.NotBlank.message}` 같은 리소스 키.
- `ValidationMessages.properties`로 메시지를 외부화/현지화한다.
- 메시지에 `{min}`, `{max}`, `${validatedValue}` 등 표현식/플레이스홀더를 보간할 수 있다.
- 사용자 입력을 메시지에 그대로 넣을 때 EL 주입에 주의(신뢰 경계).

## 5. 검증 그룹 (Validation Groups)

- 제약을 `groups` 속성으로 그룹화해, 상황별로 일부 제약만 적용할 수 있다(예: 생성 vs 수정).
- 그룹은 마커 인터페이스로 정의한다.

```kotlin
interface OnCreate
interface OnUpdate

data class SaveArticleRequest(
    @field:Null(groups = [OnCreate::class])
    @field:NotNull(groups = [OnUpdate::class])
    val id: Long?,

    @field:NotBlank(groups = [OnCreate::class, OnUpdate::class])
    val title: String,
)
```

- 트리거 측에서 `@Validated(OnCreate::class)`로 그룹을 선택한다(검증 트리거 KB 참조).

## 6. 주의

- 제약은 형식/구조 검증용이다. 상태 의존 비즈니스 규칙은 서비스 계층 책임(principles §9).
- 정규식(`@Pattern`)은 ReDoS에 취약할 수 있으므로 과도한 백트래킹 패턴을 피한다.

## 리뷰 훅

- [ ] 필수 문자열에 `@NotBlank`(빈/공백 거부)를 썼는가, 아니면 `@NotNull`로 충분한가?
- [ ] 컬렉션/배열 필수에 `@NotEmpty`를 썼는가?
- [ ] 숫자 범위에 `@Min/@Max/@Positive/@DecimalMin` 등 적절한 제약이 있는가?
- [ ] 길이 한도(`@Size`)가 저장소/계약 한도와 일치하는가?
- [ ] 메시지가 외부화되어 현지화 가능한가? 사용자 입력 EL 보간 위험은 없는가?
- [ ] 생성/수정처럼 케이스가 다르면 검증 그룹으로 분리했는가?
