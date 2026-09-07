---
title: 아키텍처 스타일 비교와 식별 신호
source: Fundamentals of Software Architecture (Richards & Ford, Part II — Architecture Styles) + https://martinfowler.com/architecture/
last_fetched: 2026-06-24
consumers: [architecture-reviewer]
---

# KB: 아키텍처 스타일 비교와 식별 신호

## 리뷰 훅 (이걸 점검하라)
- [ ] 배포 단위가 **하나**인가(모놀리식) **여럿**인가(분산/MSA) — 빌드 파일·`Dockerfile`·배포 매니페스트 수로 센다.
- [ ] 레이어드라면 호출이 **위→아래 단방향**인가, 레이어 우회(컨트롤러가 리포지토리 직접 호출)는 없는가.
- [ ] `port`/`adapter`/`inbound`/`outbound` 명명이 보이면 헥사고날 — 어댑터가 실제로 포트(인터페이스)에 의존하는가.
- [ ] `domain`/`usecase`/`application` + 의존성 역전(도메인이 인터페이스만 알고 구현은 바깥)이면 클린.
- [ ] 모듈이 비즈니스 도메인별(`Member`/`Order`/`Payment`)인가 기술 레이어별인가 — 도메인별이면 DDD/모듈러 지향.
- [ ] 메시지 브로커·`event`/`publish`/`subscribe`/`consumer`가 핵심 흐름이면 이벤트 드리븐 — 동기 호출과 혼합 비율 확인.
- [ ] 순수 한 스타일을 강요하지 마라 — 지배적 스타일 + 혼합/이행 부분을 함께 기술.

## 스타일 비교 (요지)

| 스타일 | 핵심 | 식별 신호 | 강점 / 약점 |
|--------|------|-----------|-------------|
| **레이어드(모놀리식)** | 기술 레이어(presentation/business/persistence)로 수평 분리 | `controller`/`service`/`repository` 패키지, 단일 배포 | 단순·익숙 / 변경이 레이어 전체 관통, 도메인 응집 약함 |
| **헥사고날(Ports & Adapters)** | 애플리케이션 코어를 포트로 노출, 어댑터가 외부 기술 연결 | `port`(in/out)·`adapter`(web/persistence) 분리 | 기술 교체·테스트 용이 / 보일러플레이트 증가 |
| **클린 아키텍처** | 동심원 + 의존성 규칙(안→밖 금지), 도메인 중심 | `domain`/`usecase`/`application`/`infrastructure` + 의존성 역전 | 도메인 보호·교체성 / 초기 구조 비용 |
| **DDD(전술/전략)** | 도메인 모델·bounded context 중심 분해 | 도메인별 모듈, `aggregate`/`repository`/`domain service`, 컨텍스트 경계 | 복잡 도메인 정합 / 모델링 난이도·오버엔지니어링 위험 |
| **MSA(마이크로서비스)** | 비즈니스 능력별 독립 서비스, 독립 배포·데이터 소유 | 서비스별 독립 빌드·DB·배포 단위, 서비스 간 네트워크 호출 | 독립 확장·배포 / 운영·분산 복잡성, 분산 모놀리스 위험 |
| **이벤트 드리븐** | 이벤트 produce/consume로 비동기 결합 | 브로커(Kafka/RabbitMQ 등), `event`/`publish`/`subscribe`/`consumer` | 느슨한 결합·확장 / 흐름 추적·최종 일관성 복잡 |

## 근거 (요지)
- *Fundamentals of Software Architecture*: 스타일은 **모놀리식(레이어드 등)** 과 **분산(MSA·이벤트드리븐 등)** 으로 크게 나뉘며, 각 스타일은 아키텍처 특성(배포성·확장성·테스트성·단순성 등)에서 다른 점수를 받는다 — 절대 우열이 아니라 트레이드오프.
- martinfowler.com/architecture: 레이어/헥사고날/마이크로서비스 등은 동일 문제(관심사 분리·결합 관리)에 대한 다른 응답이며 혼합·진화한다.

## 인용 시
"Fundamentals of Software Architecture 스타일 분류 기준, 배포 단위가 단일이고 `service`/`repository` 레이어 구조 → 레이어드 모놀리식. 단, `event` consumer가 일부 흐름에 혼합 → 부분 이벤트 드리븐" 식으로 식별 신호와 함께 근거를 단다.
