---
title: SOLID 5원칙
source: https://en.wikipedia.org/wiki/SOLID + Robert C. Martin, "Design Principles and Design Patterns"(2000) / "Clean Architecture"(2017) 7~11장
last_fetched: 2026-06-24
skills: [oop-design-review]
---

# KB: SOLID — 객체지향 설계 5원칙

Robert C. Martin이 정리한 클래스/모듈 수준 설계 원칙. 목표는 **변경에 강하고(robust),
이해하기 쉽고, 재사용 가능한 구조**. 각 원칙은 위반 신호로 탐지하고 리팩터링으로 교정한다.

## 한눈에 보기
| 약자 | 이름 | 한 줄 정의 |
|------|------|-----------|
| **SRP** | Single Responsibility | 한 모듈은 **하나의 액터(변경 이유)** 에게만 책임을 진다 |
| **OCP** | Open–Closed | 확장에는 열려 있고 **수정에는 닫혀** 있어야 한다 |
| **LSP** | Liskov Substitution | 하위 타입은 상위 타입을 **대체**해도 프로그램이 옳아야 한다 |
| **ISP** | Interface Segregation | 클라이언트는 **안 쓰는 메서드에 의존**하면 안 된다 |
| **DIP** | Dependency Inversion | 고수준이 저수준에 의존하지 말고 **둘 다 추상에 의존**하라 |

## SRP — 단일 책임 원칙
- **정의**: "한 클래스는 변경할 이유가 하나뿐이어야 한다." Martin의 정밀한 표현은 *변경 이유 = 액터(actor)*.
  서로 다른 이해관계자(예: 회계팀 vs 운영팀)가 같은 클래스를 각자 이유로 바꾸게 되면 위반.
- **위반 신호**: God 클래스, 메서드명이 "and"로 이어짐(`saveAndNotify`), 한 변경이 무관한 기능을 깨뜨림,
  서로 다른 변경 빈도의 코드가 한 파일에.
- **교정**: 액터별로 클래스 분리(추출), 퍼사드로 묶기. 예: `OrderCalculator`(금액)·`OrderRepository`(영속)·`OrderNotifier`(통지) 분리.

## OCP — 개방-폐쇄 원칙
- **정의**: 새 요구사항이 오면 **기존 코드를 수정하지 않고 새 코드를 추가**해 확장한다(Meyer/Martin).
- **위반 신호**: 타입에 따른 `when`/`switch` 분기가 여러 곳에 흩어져, 새 타입 추가 시 분기를 전부 고쳐야 함.
- **교정**: 다형성으로 분기 제거(추상 + 구현체), 전략/템플릿메서드 패턴. 확장점은 **추상(인터페이스)** 으로 연다.
```kotlin
interface DiscountPolicy { fun apply(amount: Money): Money }
// 새 정책 추가 = 새 클래스 추가일 뿐, 기존 코드 불변
class RateDiscount(val rate: BigDecimal) : DiscountPolicy { ... }
```

## LSP — 리스코프 치환 원칙
- **정의(Barbara Liskov)**: S가 T의 하위 타입이면 T를 쓰는 곳에 S를 넣어도 **프로그램의 정확성이 깨지지 않아야** 한다.
- **계약 규칙**: 하위 타입은 **사전조건을 강화하면 안 되고**(더 까다롭게 요구 X), **사후조건을 약화하면 안 되며**,
  **상위 타입의 불변식을 보존**해야 한다. 새로운 예외를 던지거나 반환 의미를 바꾸면 위반.
- **위반 신호**: 정사각형-직사각형 문제, 하위 클래스가 메서드를 `UnsupportedOperationException`으로 막음,
  호출 쪽에서 `if (x is SubType)` 로 타입 검사.
- **교정**: is-a가 진짜 성립하는지 재검토 → 아니면 **상속 대신 합성**(`composition-over-inheritance.md`).

## ISP — 인터페이스 분리 원칙
- **정의**: 비대한 인터페이스를 여러 **역할 단위 작은 인터페이스**로 쪼개, 클라이언트가 자기가 쓰는 것에만 의존하게 한다.
- **위반 신호**: 구현 클래스에 빈 메서드/`TODO`/예외 던지는 더미 구현이 많음, 한 메서드 추가가 무관한 구현체를 전부 깨뜨림.
- **교정**: 역할 인터페이스(role interface)로 분할. 예: `Readable`, `Writable`을 나눠 읽기 전용 클라이언트는 `Readable`만 의존.

## DIP — 의존성 역전 원칙
- **정의**: ① 고수준 모듈이 저수준 모듈에 의존하지 말고 **둘 다 추상에 의존**한다. ② 추상이 세부에 의존하지 말고 **세부가 추상에 의존**한다.
- **핵심**: 소스코드 의존성 방향을 **제어흐름과 반대로** 뒤집는다(인터페이스를 고수준 쪽에 둠).
- **위반 신호**: 도메인/유스케이스 코드가 구체 DB·HTTP 클라이언트·프레임워크를 `new`로 직접 생성, 의존성 화살표가 안→밖.
- **교정**: 추상(port)을 도메인에 정의하고 구현(adapter)을 바깥에. 생성은 DI 컨테이너/팩터리로 주입.
```kotlin
// 도메인이 정의한 포트
interface MemberRepository { fun findById(id: Long): Member? }
class RegisterMember(private val repo: MemberRepository) { ... } // 추상에만 의존
```

## 리뷰 훅
- [ ] **SRP**: 이 클래스가 서로 다른 액터의 변경 이유를 둘 이상 갖고 있지 않은가. 메서드명에 "and"가 없는가.
- [ ] **OCP**: 타입 추가가 기존 `when`/`switch` 분기 수정을 강제하지 않는가. 확장점이 추상으로 열려 있는가.
- [ ] **LSP**: 하위 타입이 사전조건 강화/사후조건 약화/예외 추가로 상위 계약을 깨지 않는가. 호출부에 `is SubType` 검사가 없는가.
- [ ] **ISP**: 구현체에 빈/예외 던지는 더미 메서드가 없는가. 클라이언트가 안 쓰는 메서드에 의존하지 않는가.
- [ ] **DIP**: 도메인/유스케이스가 구체 인프라를 직접 `new` 하지 않는가. 의존성이 추상을 향하고 안→밖으로 흐르지 않는가.
- [ ] 위반 지적 시 어느 원칙·어느 신호인지와 교정안(분리/다형성/주입)을 함께 제시했는가.
