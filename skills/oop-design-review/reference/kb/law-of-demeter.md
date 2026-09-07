---
title: 디미터 법칙 (최소 지식 원칙)
source: https://en.wikipedia.org/wiki/Law_of_Demeter + Lieberherr & Holland, "Assuring Good Style for Object-Oriented Programs"(IEEE Software, 1989)
last_fetched: 2026-06-24
skills: [oop-design-review]
---

# KB: 디미터 법칙 (Law of Demeter, 최소 지식 원칙)

"**낯선 이에게 말하지 말고, 친구에게만 말하라.**" 객체는 직접 아는 협력자에게만 메시지를 보내고,
협력자의 **내부 구조를 따라 들어가 그 너머의 객체를 조작**하지 않는다(Lieberherr, 1989). 결합을 낮추는 규칙.

## 허용되는 호출 대상 (메서드 M, 객체 O 기준)
메서드 M 안에서 메시지를 보내도 되는 대상은 다음뿐:
1. **O 자신**(`this`)의 메서드
2. **M의 매개변수**로 받은 객체
3. M 안에서 **직접 생성한** 객체
4. **O의 직접 구성요소(필드)** 인 객체
5. (전역적으로 접근 가능한 객체 — 가능한 한 피함)

> 즉 **한 점(one dot) 규칙** 의 정신: 메서드 호출 결과로 받은 **낯선 객체에 다시 메시지를 보내지 마라.**

## train wreck (메시지 체인)
- 안티패턴: `order.getCustomer().getAddress().getCity().getName()` — 호출자가 `Order`→`Customer`→`Address`→
  `City` 의 **내부 구조 전체를 알게** 되어, 중간 어느 클래스가 바뀌어도 호출부가 깨진다.
- 교정: 중간 객체에 **위임 메서드**를 두어 구조를 감춘다. `order.deliveryCityName()` (Tell, Don't Ask와 짝).
```kotlin
// 위반: val name = order.getCustomer().getAddress().getCity().getName()
// 교정: Order가 위임 메서드를 제공
class Order(private val customer: Customer) {
    fun deliveryCityName(): String = customer.deliveryCityName()  // 내부 구조 은닉
}
```

## 자료 구조(DTO)는 예외
- 디미터 법칙은 **행위를 가진 객체**에 적용된다. 순수 자료 구조(DTO/레코드/값 객체)는 데이터 노출이
  본분이므로 필드 접근 체이닝이 위반이 아니다(Fowler "train wreck vs. data structures").
- 빌더, 플루언트 API(`builder.a().b().c()`)도 매번 **같은 타입**을 반환하므로 디미터 위반이 아니다.

## 효과와 비용
- **효과**: 결합 감소(`cohesion-coupling.md`의 내용/스탬프 결합 억제), 변경 국소화, 캡슐화 강화.
- **비용**: 위임 메서드(wrapper)가 늘어 클래스가 비대해질 수 있음 → 무분별 적용 말고 **체인 깊이/안정성**으로 판단.

## 리뷰 훅
- [ ] `a.getB().getC().doX()` 같은 **train wreck 메시지 체인**이 행위 객체에서 일어나지 않는가.
- [ ] 호출자가 협력자의 **내부 구조(B→C→D)** 를 알아야만 동작하지 않는가 → 위임 메서드로 은닉.
- [ ] 체이닝 대상이 **순수 자료구조/같은 타입 플루언트 API**인지 구분했는가(이 경우 위반 아님).
- [ ] getter로 꺼낸 객체에 다시 메시지를 보내는 대신 **Tell, Don't Ask**로 시켰는가.
- [ ] 위임 메서드 남발로 클래스가 wrapper 더미가 되지 않았는가(체인 깊이·변경 빈도로 판단).
