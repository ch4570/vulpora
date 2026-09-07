---
title: GRASP 책임 할당 패턴
source: https://en.wikipedia.org/wiki/GRASP_(object-oriented_design) + Craig Larman, "Applying UML and Patterns"(3rd ed.) 17·25장 (GRASP)
last_fetched: 2026-06-24
skills: [oop-design-review]
---

# KB: GRASP — 책임 할당의 일반 원칙

Craig Larman의 GRASP(General Responsibility Assignment Software Patterns)는 "이 책임을
**어느 객체에** 줄 것인가"를 결정하는 9개 원칙. 클래스를 정하는 사고 도구이자 SOLID·디자인패턴의 토대.

## 9개 패턴 요약
| 패턴 | 책임을 누구에게 | 핵심 |
|------|----------------|------|
| **Information Expert** | 그 일에 필요한 **정보를 가진 객체** | 데이터 있는 곳에 행동을 둔다 |
| **Creator** | B를 **포함/집약/긴밀히 사용**하는 객체가 B를 생성 | 생성 책임 배치 |
| **Controller** | UI와 도메인 사이 **첫 수신 객체**(유스케이스/시스템 핸들러) | 입력 조율 |
| **Low Coupling** | 결합을 **낮추는 쪽**으로 책임 배치 | 변경 파급 최소화 |
| **High Cohesion** | 책임이 **응집**되도록 배치 | 한 객체는 관련된 일만 |
| **Polymorphism** | 타입별 행위를 **다형 메시지**로 | type-switch 제거 |
| **Pure Fabrication** | 도메인에 없는 **인위적 서비스 클래스** | 응집↑·결합↓ 위해 합성 |
| **Indirection** | **중간 객체**를 두어 직접 결합 회피 | 디커플링 |
| **Protected Variations** | 변동점을 **안정 인터페이스 뒤로** 감쌈 | 변화로부터 보호 |

## 상세
### Information Expert
- 책임 수행에 필요한 데이터를 가진 객체가 그 책임을 진다. → "데이터 있는 곳에 메서드". 빈약한 도메인 모델의 해독제.
- 예: 주문 총액 계산은 주문 항목(`OrderLine`)들을 가진 `Order`가. `order.totalAmount()`.

### Creator
- A가 B를 **집약/포함하거나, B의 초기화 데이터를 갖거나, B를 긴밀히 사용**하면 A가 B를 생성하게 한다.
- 예: `Order`가 `OrderLine`을 생성(`order.addLine(...)`). 외부 서비스가 내부 부품을 직접 `new` 하지 않는다.

### Controller
- 시스템 이벤트의 첫 수신 책임은 도메인 객체가 아닌 **유스케이스 컨트롤러/파사드**에. UI 위젯이 도메인 로직을 직접 호출하지 않게.
- 과부하 주의: 컨트롤러가 비대해지면(bloated controller) 책임을 도메인/서비스로 위임.

### Low Coupling / High Cohesion (쌍으로 평가)
- 새 책임을 배치할 때 **결합이 가장 적게 늘고 응집이 유지되는** 곳을 고른다. 둘은 트레이드오프 — `cohesion-coupling.md` 참조.

### Polymorphism
- 타입에 따라 동작이 달라질 때 조건 분기 대신 다형 메서드로. 새 타입 = 새 클래스(OCP와 직결).

### Pure Fabrication
- Information Expert만 따르면 응집이 깨질 때, 도메인에 없는 **인위적 클래스**를 만들어 책임을 모은다.
  예: 영속화 책임을 엔티티가 아닌 `MemberRepository`(순수 조작물)에. 합성(Repository/Service) 정당화 근거.

### Indirection
- 두 객체의 직접 결합을 피하려 **중간 매개 객체**를 둔다(어댑터·중재자). Protected Variations의 구현 수단.

### Protected Variations
- 예측되는 변동점을 **안정된 인터페이스로 감싸** 변화의 파급을 막는다. DIP·OCP·캡슐화·다형성을 아우르는 상위 원칙.

## 리뷰 훅
- [ ] **Expert**: 데이터를 가진 객체가 그 데이터를 쓰는 로직을 갖고 있는가. 서비스가 엔티티 게터로 계산만 하지 않는가.
- [ ] **Creator**: 객체 생성 책임이 그 객체를 집약/사용하는 곳에 있는가. 부품을 외부에서 임의로 `new` 하지 않는가.
- [ ] **Controller**: 시스템 이벤트 진입점이 명확하며, UI가 도메인 로직을 직접 호출하지 않는가. 컨트롤러가 비대하지 않은가.
- [ ] **Low Coupling/High Cohesion**: 새 책임이 결합을 최소로 늘리고 응집을 깨지 않는 곳에 놓였는가.
- [ ] **Polymorphism**: 타입 분기(`when (type)`)가 다형성으로 대체 가능한가.
- [ ] **Pure Fabrication**: 응집을 위해 인위적 서비스/리포지토리로 책임을 모았는가(억지 배치 아닌가).
- [ ] **Indirection / Protected Variations**: 예상 변동점이 안정 인터페이스/중간 객체 뒤로 감춰져 있는가.
