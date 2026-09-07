# Enum Knowledge Base — 색인 (INDEX)

> Kotlin / Jakarta Persistence / Jackson **공식 문서**를 distill한 인용 가능한 KB. 각 파일은
> frontmatter에 `title`·`source`(원문 URL)·`last_fetched`·`skills`를 담는다.
> **리뷰 시 사용법**: 작업 유형에 맞는 KB 파일을 먼저 읽고, 그 "리뷰 훅"으로 점검하며,
> 지적할 때 KB의 `source` URL을 근거로 인용한다.

## 작업 유형 → 읽을 KB

### enum 정의 / 스캐폴드
| KB | 다룸 |
|----|------|
| [kotlin-enum-classes](kotlin-enum-classes.md) | enum 기본, 생성자 프로퍼티, `entries`/`valueOf`, 추상 멤버, ordinal/name 주의 |
| [sealed-vs-enum](sealed-vs-enum.md) | enum vs sealed 선택, exhaustive `when` |

### 영속화 (DB 매핑)
| KB | 다룸 |
|----|------|
| [enum-persistence](enum-persistence.md) | `@Enumerated(STRING)` vs ORDINAL, 컬럼 길이/제약, AttributeConverter, 값 추가/제거 마이그레이션 |

### 직렬화 / 프로토콜 (외부 연동)
| KB | 다룸 |
|----|------|
| [enum-serialization-fallback](enum-serialization-fallback.md) | Jackson enum 직렬화, `@JsonEnumDefaultValue` + unknown-default 기능(3.x `EnumFeature`/2.x `DeserializationFeature`), `@JsonValue`/`@JsonProperty`, typealias 한계 |

### 분기 / 상태 모델링
| KB | 다룸 |
|----|------|
| [sealed-vs-enum](sealed-vs-enum.md) | sealed로 변형별 데이터 표현, exhaustive `when` 컴파일 강제 |

## 한 줄 요약

| KB | 한 줄 |
|----|------|
| kotlin-enum-classes | enum 기본기 — `ordinal`을 영속/직렬화에 쓰지 말 것 |
| sealed-vs-enum | 같은 모양이면 enum, 변형별 데이터가 다르면 sealed; `else` 없는 exhaustive `when` |
| enum-persistence | DB 저장은 무조건 `@Enumerated(STRING)`, ORDINAL 금지 |
| enum-serialization-fallback | 외부 소스는 `UNKNOWN` 폴백 + 버전에 맞는 unknown-default 기능 |

## 원칙 문서와의 관계
- 상위 원칙은 `../principles.md`(헌법). KB는 그 원칙의 **공식 문서 근거·세부 규칙**이다.
- 충돌 시 **KB(공식 문서)가 우선**하며, principles는 설계 통찰을 보탠다.
- 매핑: 원칙 1·6 → kotlin-enum-classes / 원칙 4·5 → sealed-vs-enum /
  원칙 2 → enum-persistence / 원칙 3 → enum-serialization-fallback.

## 갱신 정책
- 각 파일 `last_fetched` 기준. Kotlin/Jakarta Persistence/Jackson 메이저 업그레이드 시
  `source` URL을 다시 fetch해 갱신한다.
- 특히 Jackson은 2.x↔3.x에서 기능 위치가 바뀌므로 버전 변경 시 폴백 KB를 우선 점검.

## TODO (차기)
- value class / inline enum 대안, enum 기반 상태머신 패턴 KB 추가 여지.
- Jackson polymorphic deserialization, kotlinx.serialization enum 처리 비교 KB.
