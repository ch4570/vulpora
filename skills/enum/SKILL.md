---
name: enum
description: Scaffold a protocol enum in the shared SSOT module with the unknown-value fallback convention. Use when adding a domain/protocol enum shared across modules.
---

# enum — protocol enum scaffold (shared SSOT module)

Generate a shared enum in the single source of truth, with the unknown-value handling that
forward-compatible deserialization relies on.

> **Authority**: 프로젝트 규약(AGENTS.md 등)이 바인딩. 원칙: `reference/principles.md`,
> 지식: `reference/kb/INDEX.md`.

## Where it goes
- 프로토콜 공유 모듈(`<protocol-module>`, 공유 enum SSOT 모듈), 패키지
  `com.example.protocol.enums.<domain>`.
- **`public enum class`** — `explicitApi = Enabled`로 설정된 모듈은 `public`이 필수다.

## Skeleton
```kotlin
// 외부/불안정 소스에서 역직렬화 → UNKNOWN 폴백 + 표시 텍스트:
public enum class MemberType(public val text: String) {
    @JsonEnumDefaultValue UNKNOWN("미상"),
    INDIVIDUAL("개인"),
    BUSINESS("기업"),
}

// 내부/닫힌 집합(예: @Enumerated(STRING)으로 영속화) → 단순:
public enum class OrderStatus { PENDING, PAID, SHIPPED, CANCELLED }
```

## Rules (MUST)
- 이 모듈이 프로토콜/도메인 enum의 **SSOT**. 다른 모듈은 `typealias <Alias> = <Name>`로
  재사용 — **재정의 금지**.
- 외부/불안정 소스에서 역직렬화하는 enum은 `@JsonEnumDefaultValue UNKNOWN(...)`을 선언하고,
  소비 측 `ObjectMapper`/`JsonMapper`가 `EnumFeature.READ_UNKNOWN_ENUM_VALUES_USING_DEFAULT_VALUE`를
  활성화해야 한다 — 이건 **Jackson 3.x의 `EnumFeature`**이지 구버전 `DeserializationFeature`가 아니다.
- 이름→값 변환은 제네릭 헬퍼(`enumFromNameOrDefault` 류)로 통일하고, per-enum companion은 피한다.
- 표시 라벨이 필요하면 `public val text: String` 생성자 파라미터로 매핑(코드와 표시 텍스트 분리).
- 생성 코드에 단일 파라미터 람다가 있으면 중첩되지 않은 경우 `it`을 쓰고, 중첩 스코프를 구분해야 할 때만 내부 파라미터에 이름을 붙인다. 여러 파라미터가 필요한 API는 예외다.

## Hard constraints (build/runtime fail otherwise)
- `public` 누락 시 explicitApi 모듈에서는 컴파일이 실패한다. `typealias`는 어노테이션을 옮기지
  못하므로, aliased enum의 unknown 폴백을 복원하는 것은 매퍼의 `EnumFeature` 설정이다.
- feature 위치 오류(Jackson-3 `EnumFeature` 대신 구 `DeserializationFeature` 사용)는 폴백이
  조용히 실패하고 미지원 값에서 예외를 던진다.

## Verify
빌드시스템 자동감지(gradle/maven 등) 후 공유 모듈의 컴파일 태스크를 실행해 확인한다.

## reference
원칙: `reference/principles.md`, 지식: `reference/kb/INDEX.md`.

## Related
[[entity]] · [[mapper]]
