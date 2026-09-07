---
title: Jackson Enum Serialization & Unknown-Value Fallback
source: https://github.com/FasterXML/jackson-databind/wiki
last_fetched: 2026-06-24
skills: [enum]
---

# Jackson Enum 직렬화 / Unknown-Value 폴백

Jackson databind 문서 distill. enum의 직렬화·역직렬화와 **전방호환 폴백** 패턴.
(버전별 기능 위치 차이 참고:
https://fasterxml.github.io/jackson-databind/javadoc/2.18/com/fasterxml/jackson/databind/DeserializationFeature.html)

## 와이어 표현 제어: `@JsonValue` / `@JsonProperty`

```kotlin
enum class MemberType(@get:JsonValue val code: String) {
    INDIVIDUAL("I"),
    BUSINESS("B"),
    UNKNOWN("?"),
}
// 직렬화 → "I" / "B". @JsonValue가 있으면 역직렬화도 이 값 기준.
```

- `@JsonValue` — 직렬화 시 출력할 단일 값(코드)을 지정. 역직렬화 매칭에도 사용된다.
- `@JsonProperty("...")` — 특정 상수에 와이어 이름을 고정(상수 리네이밍과 무관하게 계약 유지).

## Unknown-Value 폴백 (전방호환 핵심)

외부/불안정 소스는 **새 enum 값이 언제든 추가될 수 있다**. 미지원 값에서 예외 대신 기본값으로
떨어지게 한다.

```kotlin
enum class MemberType(val text: String) {
    @JsonEnumDefaultValue UNKNOWN("미상"),
    INDIVIDUAL("개인"),
    BUSINESS("기업"),
}
```

매퍼에서 폴백 기능을 켠다. **버전에 따라 위치가 다르다:**

- **Jackson 3.x**: `EnumFeature.READ_UNKNOWN_ENUM_VALUES_USING_DEFAULT_VALUE`

```kotlin
val mapper = JsonMapper.builder()
    .enable(EnumFeature.READ_UNKNOWN_ENUM_VALUES_USING_DEFAULT_VALUE)
    .build()
```

- **Jackson 2.x (구버전)**: `DeserializationFeature.READ_UNKNOWN_ENUM_VALUES_USING_DEFAULT_VALUE`

```kotlin
objectMapper.enable(DeserializationFeature.READ_UNKNOWN_ENUM_VALUES_USING_DEFAULT_VALUE)
```

- 둘 다 `@JsonEnumDefaultValue`가 선언된 상수로 미지원 값을 흡수한다. **위치를 틀리면(3.x에서
  구 `DeserializationFeature` 사용 등) 폴백이 조용히 안 먹고 미지원 값에서 throw**한다.

## 전방호환(새 enum 값 무시) 패턴 요약

1. 외부 소스 enum에 `@JsonEnumDefaultValue UNKNOWN(...)`을 둔다.
2. 소비 매퍼에 (버전에 맞는) unknown-default 기능을 켠다.
3. 비즈니스 로직은 `UNKNOWN`을 "아직 모르는 값"으로 명시적으로 처리한다.

## typealias 주의

- `typealias Alias = MemberType`은 enum을 재사용하지만 **어노테이션을 옮기지 못한다.**
  `@JsonEnumDefaultValue` 등은 원본 선언에 있어야 하고, 폴백 동작은 결국 **소비 매퍼 설정**이
  복원한다. alias만 만들고 매퍼 설정을 빼면 폴백이 사라진다.

## 리뷰 훅

- [ ] 외부/불안정 소스 enum에 `@JsonEnumDefaultValue UNKNOWN`이 선언돼 있는가?
- [ ] 소비 매퍼가 unknown-default 기능을 **버전에 맞는 위치**로 켰는가(3.x=`EnumFeature`)?
- [ ] 와이어 계약이 `@JsonValue`/`@JsonProperty`로 고정돼 상수 리네이밍에 견디는가?
- [ ] `typealias`만 만들고 폴백을 복원할 매퍼 설정을 빠뜨리지 않았는가?
- [ ] 내부/닫힌 집합 enum에까지 불필요하게 UNKNOWN 폴백을 둬 버그를 숨기지 않는가?
