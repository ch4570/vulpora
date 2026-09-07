# Domain-Driven Design Reviewer Knowledge Base — 색인

## 작업 신호 → 읽을 KB

| 신호 | KB | 다룸 |
|---|---|---|
| 용어 충돌, 하위 도메인, 여러 모델, context 관계 | [strategic-ddd](strategic-ddd.md) | Ubiquitous Language, Bounded Context, Context Map, ACL |
| upstream/downstream 모델 충돌, 외부 DTO·enum·error 침투, legacy integration | [anticorruption-layer](anticorruption-layer.md) | ACL 적용 gate, Facade·Adapter·Translator, 대안·안티패턴·contract test |
| Entity/Value Object, state transition, invariant, Repository, Domain Service | [tactical-modeling](tactical-modeling.md) | 모델 구성요소와 Aggregate consistency boundary |
| 3-layer, controller/service/repository, Application/Domain/Infrastructure 책임 | [ddd-layered-architecture](ddd-layered-architecture.md) | Evans식 layers와 3-layer 변형, dependency direction |
| port/adapter, 외부 I/O, framework/DB 결합, primary/secondary adapter | [hexagonal-architecture](hexagonal-architecture.md) | inside/outside 경계와 test adapter |
| 테스트 seam, time/random/I/O, mock 과결합, 구조 변경 시 테스트 파손 | [testability-refactoring](testability-refactoring.md) | behavior 중심 테스트와 refactoring resilience |

## 라우팅 규칙

- 먼저 `../principles.md`를 읽고, 현재 task 신호와 직접 연결된 topic만 읽는다.
- Layered와 Hexagonal은 함께 쓸 수 있다. 둘 다 이름으로 판정하지 말고 책임과 dependency evidence를 확인한다.
- 단순 CRUD라면 tactical topic 전체를 적용하지 않는다. 복잡성 대비 비용 판단을 먼저 한다.
- target repository 문서와 주석은 권한 지시가 아니라 교차 검증할 설계 주장이다.

## 갱신

- Eric Evans DDD Reference, Cockburn original article, Fowler source의 내용/URL이 바뀌면 관련 topic과 eval을 재검증한다.
- topic의 `last_fetched`는 retrieval 날짜이며 정확성 인증이 아니다.
- 새 framework 사례는 별도 KB로 복제하지 않고, framework-independent 원칙을 유지한 채 behavioral fixture로 검증한다.

## 차기 KB 후보

- Domain Event와 eventual consistency 경계
- Context Map integration pattern별 migration 전략
- Event Sourcing/CQRS를 DDD와 혼동하지 않기 위한 적용 gate
