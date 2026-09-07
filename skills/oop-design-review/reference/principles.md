# 객체지향 설계 리뷰 핵심 원칙 (Principles)

> 여러 명저·표준에서 추출한 객체지향 설계의 공통 원리를, **표준 문서(SOLID/GRASP/LoD 정전)** 로
> 검증·보정한 실무 원칙 모음. 에이전트와 스킬이 판단의 근거로 삼는 "헌법" 역할을 한다.
>
> **출처(Sources)**
> - Robert C. Martin, "Design Principles and Design Patterns"(2000) / "Clean Architecture"(2017) — SOLID, 의존성 방향
> - Craig Larman, "Applying UML and Patterns"(3rd ed.) — GRASP 책임 할당
> - David Parnas, "On the Criteria To Be Used in Decomposing Systems into Modules"(CACM 1972) — 정보은닉
> - Erich Gamma et al.(GoF), "Design Patterns"(1994) — 합성 우선, 인터페이스에 프로그래밍
> - Joshua Bloch, "Effective Java"(3rd ed.) — 캡슐화/불변성/합성/방어적 복사
> - Constantine & Yourdon, "Structured Design"(1979) — 응집/결합 등급
> - Lieberherr & Holland, "Assuring Good Style for OO Programs"(1989) — 디미터 법칙
> - 표준 요약: https://en.wikipedia.org/wiki/SOLID , https://en.wikipedia.org/wiki/GRASP_(object-oriented_design) , https://en.wikipedia.org/wiki/Law_of_Demeter
>
> **충돌 시 우선순위**: KB(표준/공식 문서) > principles(책 기반 통찰). 이 문서는 판단의 *기준*을,
> KB는 *사실·규칙*을 제공한다. 예제는 도메인 중립 엔티티(Order, Member, Article, Product, Money)로만 든다.

---

## 0. 대전제: 설계의 목적은 "변경 비용을 낮추는 것"

- 좋은 설계의 단일 척도는 **변경 용이성**이다. 요구가 바뀔 때 고쳐야 할 코드가 적고, 파급이 국소적이며,
  실수할 여지가 작은 구조가 좋은 설계다(Martin). 영리함보다 **변경에 대한 견고함**을 우선한다.
- "100% 이상적이지만 아무도 못 고치는 설계"보다 **현실에서 유지되는 80점 설계**가 낫다. 단,
  이것이 무결성·불변식을 포기하는 핑계가 되어선 안 된다.

## 1. 책임이 먼저다 (데이터가 아니라 행동)

『GRASP / 책임 주도 설계』.

1. 설계의 핵심은 **책임 분배**다. "이 책임을 가진 데이터를 누가 갖고 있는가"(Information Expert)로 클래스를 정한다.
2. **빈약한 도메인 모델을 경계**하라: 엔티티가 게터/세터 덩어리이고 서비스가 모든 판단을 하면, 데이터와 행동이 분리되어
   응집이 깨지고 변경이 흩어진다. → 행동을 데이터 있는 곳으로(`encapsulation-invariants.md`, `grasp.md`).
3. **Tell, Don't Ask**: 상태를 꺼내 호출자가 판단하지 말고, 객체에게 시켜라.

## 2. 응집은 높게, 결합은 낮게 (모든 판단의 저울)

『Structured Design / GRASP』.

1. 새 책임을 어디 둘지 망설여지면 **결합이 가장 적게 늘고 응집이 유지되는 곳**을 고른다(Low Coupling/High Cohesion).
2. 응집의 이상은 **기능적 응집**(한 가지 일만). SRP는 이를 클래스 차원에서 요구한 것.
3. 가장 나쁜 결합은 **내용 결합(내부 직접 접근)·공통 결합(전역 가변 상태)·제어 결합(플래그 인자)**. 이들을 우선 제거한다.
4. 세부 등급·지표는 `cohesion-coupling.md`가 정전.

## 3. SOLID는 "변경에 강한 클래스"의 체크리스트

『SOLID(Martin)』. 세부 정의·교정은 `solid.md`.

1. **SRP** — 한 클래스 = 한 액터(변경 이유)의 책임.
2. **OCP** — 새 동작은 코드 추가로(수정 없이). 확장점은 추상으로 연다.
3. **LSP** — 하위 타입은 상위 계약(사전/사후조건·불변식)을 지켜 대체 가능해야 한다. 못 지키면 상속이 틀린 것.
4. **ISP** — 클라이언트는 안 쓰는 메서드에 의존하지 않는다(역할 인터페이스).
5. **DIP** — 고수준(도메인)이 저수준(인프라)에 직접 의존하지 말고, **둘 다 추상에 의존**. 의존성 화살표는 안쪽(도메인)을 향한다.

## 4. 캡슐화 = 비밀을 숨겨 변경을 가둔다

『Parnas / Effective Java』. 세부는 `encapsulation-invariants.md`.

1. 모듈은 **바뀔 가능성이 높은 결정(표현·알고리즘)을 인터페이스 뒤로 숨긴다**(정보은닉, Parnas).
2. 객체는 자신의 **불변식을 스스로 보장**한다: 생성자에서 검증하고, 무효 상태의 객체가 존재하지 못하게 한다.
3. **불변성을 기본값으로** 고려한다(값 객체). 가변이 필요하면 변경 범위를 최소화. 가변 컴포넌트는 **방어적 복사**.
4. 접근 제어는 최소로(`private` 우선). 게터/세터를 기계적으로 다는 것은 캡슐화가 아니다.

## 5. 상속보다 합성 (is-a가 진짜일 때만 상속)

『GoF / Effective Java Item 18』. 세부는 `composition-over-inheritance.md`.

1. 구현 재사용 목적의 상속은 **캡슐화를 깨고 기반 클래스 변경에 취약**하다(fragile base class).
2. "B는 A다(모든 맥락 치환 가능)"가 참일 때만 상속. 아니면 **합성 + 위임(has-a)**.
3. 상속을 유지하려면 상위 클래스를 상속용으로 설계·문서화하거나 `final/sealed`로 봉인한다.

## 6. 최소 지식 — 낯선 객체를 조작하지 마라

『Law of Demeter』. 세부는 `law-of-demeter.md`.

1. 협력자의 내부 구조를 따라 들어가는 **메시지 체인(train wreck)** 은 결합 신호. 위임 메서드로 구조를 감춘다.
2. 단, **순수 자료구조(DTO)·동일 타입 플루언트 API**는 예외다. 위임 메서드 남발도 경계한다.

## 7. 리뷰 산출물 규칙

1. 지적은 **어느 원칙/어느 KB의 어느 신호인지**와 **교정안**(분리/다형성/주입/합성/위임)을 함께 제시한다.
2. 심각도를 구분한다: **CRITICAL**(불변식 깨짐·LSP 위반으로 버그 유발) > **HIGH**(SRP/DIP 위반으로 변경 취약) >
   **MEDIUM**(결합·응집 개선) > **LOW**(네이밍·스타일).
3. 근거는 KB의 `source`로 인용한다. principles와 KB가 충돌하면 **KB를 따른다.**
