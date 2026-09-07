# Domain-Driven Design Reviewer 핵심 원칙

## Sources

- Eric Evans, *Domain-Driven Design: Tackling Complexity in the Heart of Software* (2004), 특히
  Putting the Model to Work, Building Blocks of a Model-Driven Design, Supple Design, Strategic Design.
- Eric Evans, [Domain-Driven Design Reference](https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf) (2015).
- Alistair Cockburn, [Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture) (2005).
- Martin Fowler, [Refactoring code that accesses external services](https://martinfowler.com/articles/refactoring-external-service.html),
  [Mocks Aren't Stubs](https://martinfowler.com/articles/mocksArentStubs.html).

Runtime/system 정책이 이 문서보다 우선한다. 기술 사실은 현재 코드·테스트·schema와 적용 버전의 공식 문서가
책 기반 원칙보다 우선한다. KB는 구체 review hook, 이 문서는 장기 판단 기준을 소유한다.

## 1. DDD는 폴더 구조가 아니라 모델과 언어의 정렬이다

핵심 도메인에 집중하고, domain expert와 개발자가 모델을 함께 탐색하며, 명시된 bounded context 안에서
ubiquitous language를 사용한다. 이름만 DDD인 기술 레이어보다 코드·대화·테스트가 같은 모델을 말하는지가 중요하다.

## 2. 전략적 경계가 전술 패턴보다 먼저다

Bounded Context가 다른 모델을 억지로 하나로 합치지 않게 한다. context 관계와 translation을 먼저 이해하지 않고
Entity·Repository·Aggregate를 늘리면 지역적 객체 설계만 복잡해진다.

## 3. Domain layer는 business rule을 소유하고 외부 세부에서 격리된다

Application은 use case와 transaction 흐름을 조정하고, Domain은 invariant와 state transition을 표현한다.
Infrastructure와 delivery mechanism은 바깥에 둔다. Domain이 ORM, HTTP, broker, filesystem, system clock을
직접 알아야 하면 모델과 테스트가 기술 변화에 끌려간다.

## 4. Aggregate는 transaction consistency boundary다

Aggregate root가 내부 변경과 invariant를 보호한다. Aggregate 간 강한 object graph와 하나의 거대한 transaction은
경계를 흐린다. 작게 유지하되 실제 원자적 business rule보다 작게 쪼개 invariant를 밖으로 흘리지 않는다.

## 5. Layer 수보다 책임과 dependency direction이 중요하다

Evans의 conceptual layers는 UI, Application, Domain, Infrastructure다. “DDD 3-layer”에는 Evans의 canonical
정의가 없다. 팀별 mapping이 무엇이든 Evans 관점의 불변식은 Domain model을 UI·application orchestration·
infrastructure concern에서 격리하는 것이다. Application-owned port와 adapter를 통한 dependency inversion은
Hexagonal profile을 선택했을 때 적용한다.
`controller → service → repository` 호출 모양만으로 DDD layered architecture가 되지는 않는다.

## 6. Ports & Adapters는 기술 격리와 실행 가능한 테스트 seam을 만든다

Port는 목적 있는 application conversation이다. Adapter는 HTTP, DB, message broker, batch, automated test 같은
외부 기술을 그 conversation에 맞춘다. 모든 class마다 interface를 만드는 것이 아니라 교체·격리할 외부 경계에 둔다.

## 7. Testability는 구조의 결과이며 behavior로 검증한다

Domain rule은 framework와 I/O 없이 결정적으로 검증할 수 있어야 한다. 테스트는 observable behavior와 invariant에
결합하고 private method, collaborator 호출 순서, 내부 class graph에 과결합하지 않는다. 그래야 구조를 바꿔도 안전망이 남는다.

## 8. Refactoring toward deeper insight는 모델 변경을 코드에 반영한다

새로운 domain insight가 생기면 ubiquitous language와 conceptual contour에 맞춰 이름·책임·경계를 작은 단계로
바꾼다. 현재 behavior를 테스트로 잠그고 한 단계씩 검증한다. 행위 변경과 구조 변경은 분리한다.

## 9. Supple Design은 이해 가능성과 예측 가능성을 높인다

Intention-revealing interface, side-effect-free function, explicit invariant, cohesive module을 선호한다.
한 변경이 관련 없는 여러 모듈과 mock에 번지면 모델의 contour나 seam이 잘못 놓였다는 신호다.

## 10. 복잡도에 비례해 적용한다

DDD, layering, ports는 각각 비용이 있다. 단순 CRUD·짧은 수명의 integration에는 직접적인 구조가 더 낫다.
권고는 얻는 것(모델 명료성·testability·변경 격리)과 잃는 것(간접화·파일 수·학습 비용)을 함께 밝힌다.
