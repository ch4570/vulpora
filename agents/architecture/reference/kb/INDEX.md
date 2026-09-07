# Architecture Knowledge Base — 색인 (INDEX)

> 아키텍처 표준 서적·공식 자료를 distill한 인용 가능한 KB. 각 파일은 frontmatter에
> `title`·`source`(책명+장 또는 URL, 정직 라벨)·`last_fetched`·`skills`를 담는다.
> **리뷰 시 사용법**: 작업 유형에 맞는 KB 파일을 먼저 읽고, 그 "리뷰 훅"으로 점검하며,
> 지적할 때 KB의 `source`를 근거로 인용한다. (예: "Clean Architecture 의존성 규칙 기준 …")

## 작업 유형 → 읽을 KB

### 스타일 식별 (구조 스캔)
| KB | 다룸 |
|----|------|
| [architecture-styles](architecture-styles.md) | 레이어드/헥사고날/클린/MSA/이벤트드리븐 비교 + 각 식별 신호 |
| [detection-method](detection-method.md) | 코드/구조에서 아키텍처를 추론하는 방법(모듈 경계·import 그래프·패키지·빌드 모듈·배포 단위 grep) |

### 경계 · 의존성 평가
| KB | 다룸 |
|----|------|
| [dependency-rule-boundaries](dependency-rule-boundaries.md) | 의존성 규칙(안→밖 금지), 포트/어댑터, 경계 누수, 도메인↔인프라 분리 |
| [ddd-bounded-context](ddd-bounded-context.md) | bounded context, 컨텍스트 맵, 애그리거트, 도메인/애플리케이션 레이어 |

### MSA · 분해
| KB | 다룸 |
|----|------|
| [msa-decomposition](msa-decomposition.md) | 서비스 분해(비즈니스 능력/서브도메인), 결합도, 데이터 소유권, 분산 모놀리스 안티패턴 |

### 통합 · 복원력
| KB | 다룸 |
|----|------|
| [integration-resilience](integration-resilience.md) | 동기/비동기(REST/메시징), saga/이벤트, 타임아웃/서킷브레이커/재시도, 최종 일관성 |

## 원칙 문서와의 관계
- 상위 원칙(의존성 규칙·경계·결합도·트레이드오프·증거 기반)은 `../principles.md`(헌법). KB는 그 원칙의 **구체 규칙·식별 신호·체크리스트**.
- 충돌 시 **KB(구체 규칙)가 우선**하며, principles는 책 기반 통찰을 보탠다.

## 갱신
- 각 파일 `last_fetched` 기준. 외부 URL(martinfowler.com·microservices.io 등) source는 주기적으로 재확인해 갱신한다.
- TODO(차기): CQRS/event sourcing, API gateway/BFF, 모듈러 모놀리스, 아키텍처 특성(-ility) 트레이드오프 매트릭스, ADR(아키텍처 결정 기록) KB 추가 여지.
