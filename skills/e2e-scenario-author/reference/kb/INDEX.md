# E2E Scenario Author Knowledge Base — 색인 (INDEX)

> BDD/테스트 설계 표준과 Spring·NestJS·메시징·HTTP **공식 문서**를 distill한 인용 가능한 KB.
> 각 파일은 frontmatter에 `source`(원문 URL)·`last_fetched`·`skills`를 담고, 본문 끝에 `## 리뷰 훅`을 둔다.
> **사용법**: 생성 단계에 맞는 KB를 먼저 읽고, 그 "리뷰 훅"으로 점검하며, 단정할 때 `source` URL을
> 근거로 인용한다. (예: "Gherkin reference 기준 When은 단일 행위 …")

## 생성 단계 → 읽을 KB

### 1. 표면 발견 (소스 열거)
| KB | 다룸 |
|----|------|
| [api-surface-discovery](api-surface-discovery.md) | Spring/NestJS REST 매핑(클래스+메서드+전역 prefix 결합), `@KafkaListener`, outbox 핸들러/발행기, 경로 상수/프로퍼티 해석, 결정론적 ID 생성 |

### 2. 시나리오 구조 작성
| KB | 다룸 |
|----|------|
| [given-when-then](given-when-then.md) | Gherkin Given/When/Then 키워드 의미, 선언적·단일 행위 규칙, Kotest BehaviorSpec, 카탈로그 블록 대응 |

### 3. 커버리지 채우기 (happy + 음성/경계)
| KB | 다룸 |
|----|------|
| [boundary-and-negative-cases](boundary-and-negative-cases.md) | 동등 분할, 경계값 분석(BVA), 음성 경로(AUTH/VALIDATION/NOT-FOUND/CONFLICT/DLQ), "코드가 강제하는 것만" 규율 |
| [data-driven-scenarios](data-driven-scenarios.md) | Scenario Outline/Examples 파라미터화, 합성 데이터·라운드 넘버 시드, PII/실데이터 금지 |

### 4. 멱등성·의존성 (재실행 안전)
| KB | 다룸 |
|----|------|
| [idempotent-scenarios](idempotent-scenarios.md) | HTTP 멱등성(RFC 9110), `Mutates` 선언, finally-style teardown, 고유 키, `Depends-on` 체인·순환 금지 |

## SCA-n 규칙 ↔ KB 매핑
| 규칙 | 관련 KB |
|------|---------|
| `SCA-5`, `SCA-5.1`, `SCA-5.2` (소스 열거·경로 해석) | api-surface-discovery |
| `SCA-6`, `SCA-6.1`, `SCA-6.2` (결정론적 ID) | api-surface-discovery |
| `SCA-7` (표면별 하한선·음성 floor) | boundary-and-negative-cases |
| `SCA-19` (source inventory target·behavior coverage) | api-surface-discovery, boundary-and-negative-cases |
| `SCA-8`, `SCA-9` (전제·의존성 선언) | idempotent-scenarios |
| `SCA-11` (블록 포맷 = Given/When/Then 대응) | given-when-then |
| `SCA-16` (합성 데이터) | data-driven-scenarios |
| `SCA-17` (멱등성 선언·teardown) | idempotent-scenarios |

## 원칙 문서와의 관계
- 상위 판단 기준은 `../principles.md`(헌법). KB는 그 원칙의 **공식 문서 근거·세부 규칙**.
- 충돌 시 **KB(공식 문서)가 우선**하며, principles는 설계 통찰을 보탠다.

## 갱신
- 각 파일 `last_fetched` 기준. Gherkin/Spring/NestJS/Kafka/RFC 문서 개정 시 `source` URL을 다시 fetch해 갱신.
- TODO(차기): 계약 테스트(consumer-driven contract), 비동기 단언(Awaitility 패턴), 테스트 격리/컨테이너 시드 KB 추가 여지.
