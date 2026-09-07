# Enum 핵심 원칙 (Principles)

> 이 문서는 Kotlin·Jakarta Persistence·Jackson **공식 문서**로 검증한 enum 설계 실무 원칙
> 모음이다. 에이전트와 스킬이 판단의 근거로 삼는 "헌법" 역할을 한다.
> KB(공식 문서 distill)와 충돌하면 **KB가 우선**한다.
>
> **출처(Sources)**
> - Kotlin 언어 문서: Enum classes — https://kotlinlang.org/docs/enum-classes.html
> - Kotlin 언어 문서: Sealed classes and interfaces — https://kotlinlang.org/docs/sealed-classes.html
> - Kotlin 언어 문서: Conditions and loops (`when` expression) — https://kotlinlang.org/docs/control-flow.html#when-expressions-and-statements
> - Jakarta Persistence 3.2 Specification — `@Enumerated` — https://jakarta.ee/specifications/persistence/3.2/jakarta-persistence-spec-3.2
> - Jackson databind 문서 (enum 직렬화/역직렬화) — https://github.com/FasterXML/jackson-databind/wiki

---

## 1. enum은 코드/상태의 SSOT다 (재정의 금지·typealias 재사용)

- 하나의 고정된 인스턴스 집합(주문 상태, 회원 유형 등)은 **단 한 곳**에서 enum으로 정의한다.
- 같은 개념을 여러 모듈에서 다시 enum으로 선언하지 말 것. 다른 모듈은
  `typealias <Alias> = <Name>`로 **재사용**한다. 중복 정의는 값 드리프트(한쪽만 값 추가)와
  매핑 버그의 근원이다.
- 단, `typealias`는 **어노테이션을 옮기지 못한다**. 따라서 폴백/직렬화 동작은 alias가 아니라
  원본 enum 선언 + 소비 측 매퍼 설정으로 보장해야 한다(원칙 3 참조).

## 2. 영속화는 `@Enumerated(EnumType.STRING)`만 (ORDINAL 금지)

- DB에 enum을 저장할 땐 항상 **`@Enumerated(EnumType.STRING)`**. 기본값인 `ORDINAL`은 금지.
- **ORDINAL이 위험한 이유**: 저장되는 값이 enum 선언 **순서(0,1,2…)** 다. 중간에 상수를
  추가/재배치하면 기존 행의 의미가 통째로 어긋난다(예: `1`이 어제는 PAID, 오늘은 SHIPPED).
  STRING은 이름을 저장하므로 순서 변경에 안전하다.
- DB 컬럼은 **가장 긴 enum 이름**을 수용할 길이로 잡고, 가능하면 `CHECK`/FK 코드테이블로
  유효 값을 제약한다. 더 강한 매핑 제어가 필요하면 `AttributeConverter` 대안을 쓴다.
- enum 값 추가/제거는 **마이그레이션 사건**이다. 제거된 이름이 DB에 남아 있으면 로딩 시
  예외가 나므로, 제거 전 데이터 정리/매핑 전략을 먼저 세운다.

## 3. 외부/불안정 소스는 UNKNOWN 폴백

- 우리가 통제하지 못하는 소스(외부 API, 다른 팀의 메시지 등)에서 역직렬화하는 enum은
  **새 값이 언제든 추가될 수 있다**고 가정한다.
- `@JsonEnumDefaultValue UNKNOWN(...)`을 선언하고, 소비 측 매퍼가
  `EnumFeature.READ_UNKNOWN_ENUM_VALUES_USING_DEFAULT_VALUE`(Jackson 3.x)를 켠다. 이러면
  미지원 값은 예외 대신 `UNKNOWN`으로 떨어져 **전방호환**이 된다.
- 반대로 **내부/닫힌 집합**(우리가 정의·저장하는 상태값)은 UNKNOWN을 두지 않는다. 미지원
  값은 진짜 버그이므로 빠르게 실패시키는 편이 낫다.

## 4. exhaustive `when`으로 컴파일타임 안전

- enum/sealed를 분기할 때는 `else` 없이 **모든 분기를 명시**한 exhaustive `when`을 쓴다.
- 표현식으로 쓰는 `when`은 컴파일러가 누락 분기를 강제한다. 그래서 enum에 새 값을 추가하면
  관련 `when`이 **컴파일 에러**로 드러나 "처리 누락"을 빌드 단계에서 잡는다.
- `else ->`로 뭉뚱그리면 이 안전망이 사라진다. 정말 필요한 기본 처리에만 제한적으로 쓴다.

## 5. enum vs sealed class 선택 기준

- **enum**: 인스턴스가 **고정·열거 가능**하고 각 항목이 동일한 형태(같은 프로퍼티 셋)일 때.
  상태 라벨, 코드, 유형 등.
- **sealed class/interface**: 각 변형이 **서로 다른 데이터**를 가질 때(예: `Loading` /
  `Success(data)` / `Error(message)`). 닫힌 계층이라 `when`이 enum처럼 exhaustive하다.
- 데이터 차이가 없으면 enum, 변형별로 들고 있는 값이 다르면 sealed.

## 6. 표시 텍스트/코드 매핑 분리

- enum 상수의 **식별자(name)** 와 **사용자 표시 텍스트**, **외부 와이어 코드**는 별개 관심사다.
  하나로 합치지 말고 분리한다.
- 표시 라벨은 `public val text: String` 같은 생성자 프로퍼티로, 와이어 코드는
  `@JsonValue`/`@JsonProperty`로 매핑한다. `name`/`ordinal`을 표시·영속·직렬화에 직접
  쓰지 말 것(리네이밍/재배치에 취약).
