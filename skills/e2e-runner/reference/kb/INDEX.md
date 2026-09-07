# E2E Runner Knowledge Base — 색인 (INDEX)

> 실행 중인 시스템에 대해 E2E를 실행/리포팅하는 스킬을 위한, **공식 문서/표준을 distill한
> 인용 가능한 KB**. 각 파일은 frontmatter에 `source`(원문 URL)·`last_fetched`·`skills`를 담는다.
> **사용법**: 작업 유형에 맞는 KB를 먼저 읽고, 그 "리뷰 훅"으로 점검하며, 지적/판단 시 KB의
> `source` URL을 근거로 인용한다. (예: "Awaitility Usage 기준 unbounded polling 금지 …")

## 작업 유형 → 읽을 KB

| KB | 다룸 |
|----|------|
| [operating-contract](operating-contract.md) | runner 전체 실행 순서, RUN rule, report/partial-run 계약 |

### HTTP/REST 시나리오 실행 (동기 fence)
| KB | 다룸 |
|----|------|
| [http-api-e2e](http-api-e2e.md) | 상태코드/헤더/바디 단언, `.http` 파일 형식, REST-assured given/when/then |
| [pii-masking-and-evidence](pii-masking-and-evidence.md) | 응답 본문 증거 캡처(head+tail), 마스킹 |

### 비동기/이벤트 기반 시나리오 실행 (Kafka, 최종일관성)
| KB | 다룸 |
|----|------|
| [async-and-eventual-consistency](async-and-eventual-consistency.md) | bounded polling, awaitility, consumer lag, DLQ, publish/consume |
| [flaky-tests](flaky-tests.md) | 비동기에서 자주 생기는 타이밍·순서 플레이키, 재시도 금지 |

### 환경 게이팅 & 데이터 셋업
| KB | 다룸 |
|----|------|
| [test-environment-and-data](test-environment-and-data.md) | Testcontainers owner/topology, capability bootstrap, case/run cleanup, false-green 차단 |
| [ci-integration](ci-integration.md) | 빌드시스템 자동감지 게이트, 헬스체크(Actuator/readiness) 후 실행 |

### 리포트 생성 & 보존
| KB | 다룸 |
|----|------|
| [pii-masking-and-evidence](pii-masking-and-evidence.md) | PII 마스킹, 증거(상태/지연/본문/로그), 마스킹 클래스 중앙화 |
| [ci-integration](ci-integration.md) | 아티팩트 보존, exit code 규약 |

### 결과 신뢰성 / 플레이키 대응
| KB | 다룸 |
|----|------|
| [flaky-tests](flaky-tests.md) | 원인 분류, 재현·격리(quarantine), 재시도로 가리지 말 것 |

## KB 한 줄 요약

| KB | 한 줄 요약 |
|----|-----------|
| [http-api-e2e](http-api-e2e.md) | HTTP/REST e2e의 단언 대상과 `.http`/REST-assured 검증 DSL |
| [test-environment-and-data](test-environment-and-data.md) | Compose는 근거만 사용하고 Testcontainers 환경·데이터 수명주기를 검증 |
| [async-and-eventual-consistency](async-and-eventual-consistency.md) | 최종일관성 검증 = 유한 deadline polling; Kafka consume/publish/DLQ/lag |
| [flaky-tests](flaky-tests.md) | 플레이키 원인 4종, 격리 전략, 재시도 은폐 금지 |
| [ci-integration](ci-integration.md) | 빌드 자동감지 게이트 + readiness 후 실행 + 아티팩트 + exit code |
| [pii-masking-and-evidence](pii-masking-and-evidence.md) | 공유 아티팩트의 PII 마스킹 + 증거 캡처 + 마스킹 클래스 중앙화 |

## 원칙 문서와의 관계
- 상위 판단 기준은 `../principles.md`(헌법). KB는 그 원칙의 **공식 문서 근거·세부 규칙**이다.
- SKILL.md의 `RUN-n` 규칙은 이 KB의 사실을 실행 절차로 못박은 것이다. 충돌 시
  **SKILL.md(RUN-n) > KB(공식 문서) > principles(통찰)** 순으로 우선한다.

## 갱신
- 각 파일 `last_fetched` 기준. 의존 라이브러리/프레임워크 메이저 업그레이드 시(예: Spring
  Boot Actuator 엔드포인트 변경, Kafka 프로토콜 변경) `source` URL을 다시 fetch해 갱신한다.
- 마스킹 클래스는 KB가 아니라 공유 계약(CONTRACT)에서 중앙 관리하며, 새 민감 필드가 생기면
  같은 PR에서 추가한다(`RUN-14.1`).

## TODO (차기 KB 후보)
- 계약 검사(consumer-driven contract testing, Pact) — 마이크로서비스 경계 검증.
- 성능/부하 시나리오(p95/p99 지연 임계) — 현재는 단일 지연 캡처만 다룸.
- 인증/세션 플로우(OAuth2/JWT 토큰 캡처와 만료) — 캡처 변수 grammar 확장 여지.
