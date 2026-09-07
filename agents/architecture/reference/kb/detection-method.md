---
title: 코드/구조에서 아키텍처 추론하는 방법
source: 내부 방법론 (정직 라벨 — 공식 표준 아님; principles.md의 책 출처를 코드 신호로 환원한 실무 절차)
last_fetched: 2026-06-24
consumers: [architecture-reviewer]
---

# KB: 코드/구조에서 아키텍처 추론하는 방법

> **정직 라벨**: 이 문서는 공식 표준이 아니라, 표준 서적(Clean Architecture·DDD·Building Microservices 등)의 개념을
> **읽기 전용 코드 신호로 환원한 내부 방법론**이다. 신호는 *가설*이며 import/빌드/배포 사실로 검증한 뒤 단정한다.

## 리뷰 훅 (이걸 점검하라)
- [ ] 디렉터리/패키지 트리를 먼저 본다 — 최상위가 **기술 레이어**(controller/service/repo)인가 **도메인**(member/order/payment)인가.
- [ ] **배포 단위를 센다** — 빌드 파일·Dockerfile·배포 매니페스트 개수로 모놀리식 vs 분산 판정.
- [ ] **import 그래프**로 의존 방향을 확정 — 안→밖 위반·순환을 grep으로 찾는다(보이는 구조만 믿지 말 것).
- [ ] 식별은 **신호의 누적**으로 — 단일 키워드 하나로 스타일을 단정하지 않는다.
- [ ] 확정 못 한 신호는 "확인 필요"로 표기하고 심각도 MEDIUM 상한.

## 절차 (grep/glob 예시)

### 1) 모듈 경계·패키지 구조
```bash
# 최상위 소스 구조 / 모듈 디렉터리
ls -d */ ; find . -maxdepth 3 -type d | grep -iE 'domain|application|usecase|adapter|port|infra|service|controller|repository'
```
- 도메인명(`member`/`order`/`article`/`payment`) 디렉터리 → 도메인 중심(DDD/모듈러).
- `controller`/`service`/`repository` 수평 분리 → 레이어드.
- `port`/`adapter`(`in`/`out`, `inbound`/`outbound`) → 헥사고날.
- `domain`/`usecase`/`application`/`infrastructure` 동심원 → 클린.

### 2) 빌드 모듈·배포 단위 (모놀리식 vs 분산)
```bash
# 빌드 파일 수·위치
find . -name 'pom.xml' -o -name 'build.gradle*' -o -name 'package.json' -o -name 'go.mod' | sort
# 컨테이너/배포 단위 수
find . -name 'Dockerfile*' ; grep -rl 'kind: *Deployment' . 2>/dev/null
```
- 빌드/배포 단위 1개 → 모놀리식. 여러 개(서비스별) → 분산/MSA 후보.

### 3) import 그래프·의존 방향 (경계/규칙 검증)
```bash
# 도메인이 인프라/웹/DB를 import 하는지 (안→밖 위반)
grep -rniE 'import .*(infra|persistence|jpa|jdbc|http|web|framework)' <domain-dir>/
# 모듈 간 양방향/순환 의존 단서
grep -rn 'import .*moduleB' moduleA/ ; grep -rn 'import .*moduleA' moduleB/
```

### 4) 통합 방식 (동기/비동기·이벤트)
```bash
# 메시징/이벤트 신호
grep -rniE 'kafka|rabbitmq|sqs|@?(publish|subscribe|consumer|listener)|event' . | head
# 동기 호출(REST/RPC) 클라이언트
grep -rniE 'resttemplate|webclient|feign|httpclient|grpc' . | head
```

## 신호→스타일 매핑 (요약)
| 신호 | 시사 스타일 |
|------|-------------|
| 단일 빌드 + `controller/service/repository` | 레이어드 모놀리식 |
| `port`/`adapter` + 코어 분리 | 헥사고날 |
| `domain/usecase` + 의존성 역전 | 클린 |
| 도메인별 모듈 + aggregate/context | DDD |
| 서비스별 빌드·DB·배포 + 네트워크 호출 | MSA |
| 브로커 + event publish/subscribe 핵심 흐름 | 이벤트 드리븐 |

## 인용 시
"detection-method 절차 기준, 빌드 파일 1개 + `service`/`repository` 구조 → 레이어드 모놀리식(가설). import grep으로 도메인→인프라 의존 확인 후 의존성 규칙 위반 확정" 식으로 가설→검증 경로를 밝힌다.
