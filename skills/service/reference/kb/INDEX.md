# service KB — INDEX

서비스 계층 설계 지식 베이스의 라우팅 진입점. **작업 유형 → 읽을 KB**를 먼저 고르고, 충돌 시 우선순위는 **KB > `../principles.md` > 일반 통념**이다.

## 작업 유형 → 읽을 KB

| 작업 유형 | 읽을 KB | 한 줄 요약 |
|---|---|---|
| 서비스에 `@Transactional` 붙이기 / `open` 안 됨 / 자기 호출로 트랜잭션 무시됨 | [`transactional-basics.md`](transactional-basics.md) | 프록시 AOP가 부르는 제약(`open`, 자기 호출, public, 롤백 규칙) |
| 쓰기를 호출자와 분리, `REQUIRES_NEW`/`NESTED` 선택 | [`transaction-propagation.md`](transaction-propagation.md) | 전파 7종 의미와 선택, 중단 비용 |
| 읽기 전용 최적화 / 격리 수준 / timeout 지정 | [`readonly-isolation.md`](readonly-isolation.md) | `readOnly` 힌트, `Isolation` enum, timeout |
| 트랜잭션이 너무 길다 / 외부 호출을 어디 둘까 / 대량 처리 | [`transaction-boundaries.md`](transaction-boundaries.md) | 경계는 서비스, 짧게, 외부 I/O는 tx 밖, chunk 분할 |
| Kafka 소비·배치 재실행·재시도에서 중복 처리 | [`idempotency.md`](idempotency.md) | upsert/멱등성 키/dedup, at-least-once, 재시도+REQUIRES_NEW |
| 비즈니스 규칙을 서비스/도메인 중 어디에 / 얇은 vs 두꺼운 서비스 / 주입 방식 | [`orchestration-vs-domain.md`](orchestration-vs-domain.md) | 조정은 서비스, 규칙은 도메인, 단일 진입점, 생성자 주입, model 노출 |
| DB/JPA 예외가 상위로 새어나감 / 예외를 도메인 예외로 | [`exception-translation.md`](exception-translation.md) | `DataAccessException` 계층, `@Repository` 번역, 도메인 예외 재번역 |

## 원칙과의 관계

- `../principles.md`는 서비스 계층 **헌법(불변 규칙 10개)**이다. 각 KB는 그 원칙 중 하나 이상을 사실·규칙·코드로 구체화한다.
  - 원칙 1·2·4 ↔ [`transactional-basics.md`](transactional-basics.md), [`transaction-boundaries.md`](transaction-boundaries.md), [`readonly-isolation.md`](readonly-isolation.md)
  - 원칙 3 ↔ [`transaction-propagation.md`](transaction-propagation.md)
  - 원칙 5·6·9 ↔ [`orchestration-vs-domain.md`](orchestration-vs-domain.md)
  - 원칙 7 ↔ [`idempotency.md`](idempotency.md)
  - 원칙 8 ↔ [`exception-translation.md`](exception-translation.md)
- 충돌 시 **KB가 원칙보다 우선**한다(구체가 일반을 이긴다).

## 갱신 정책

- 각 KB 프론트매터의 `source`(Spring 공식 문서 / RFC) 변경 시에만 해당 KB를 갱신하고 `last_fetched`를 올린다.
- 새 작업 유형이 반복되면 위 라우팅 표에 행을 추가하고, 필요 시 KB 파일을 신설한다(프론트매터 + `## 리뷰 훅` 필수).
- SSOT는 `../../SKILL.md`(영문). KB는 그 스캐폴드를 뒷받침하는 사실 근거이며, 스캐폴드 규칙과 모순되면 안 된다.

## TODO
- [ ] 낙관적 락(`@Version`) + 재시도 패턴 전용 KB 분리 검토(현재 [`exception-translation.md`](exception-translation.md)/[`idempotency.md`](idempotency.md)에 분산).
- [ ] 이벤트 발행(트랜잭셔널 아웃박스) 패턴 KB 추가 검토 — 트랜잭션 안 외부 발행 금지 원칙과 연결.
- [ ] DB별 기본 격리 수준 표 보강(`readonly-isolation.md`).
