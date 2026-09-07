# 디자인 패턴 Knowledge Base — 색인 (INDEX)

> GoF, refactoring.guru, Martin Fowler, Spring 공식문서를 distill한 인용 가능한 KB. 각 파일은
> frontmatter에 `source`(원문 URL/책)·`last_fetched`·`skills`를 담는다.
> **사용법**: 작업 유형에 맞는 KB를 먼저 읽고, 그 "리뷰 훅"으로 점검하며, 지적할 때 KB의
> `source`를 근거로 인용한다. (예: "refactoring.guru Strategy 기준 …")
> 예시는 모두 중립 도메인(Order, Member, Article, Product, Money, DiscountPolicy, PaymentType).

## 작업 유형 → 읽을 KB

### 패턴 적용 검토 / 도입 판단 (design-pattern-apply)
| 작업 | 먼저 읽을 KB |
|------|--------------|
| 객체 생성이 흩어짐 / `new` 분기 | [creational-patterns](creational-patterns.md) |
| 타입 불일치·복잡 구조·래핑 | [structural-patterns](structural-patterns.md) |
| 분기 흩어짐·행동 변화·이벤트 | [behavioral-patterns](behavioral-patterns.md) |
| "이 패턴 정말 필요한가" 점검 | [pattern-misuse-signals](pattern-misuse-signals.md) |
| Spring에서 DI/Strategy/Factory 실현 | [di-strategy-factory-spring](di-strategy-factory-spring.md) |

### 코드 리뷰 시 (패턴 오용 적발)
| 신호 | 읽을 KB |
|------|---------|
| 단일 구현 인터페이스+팩토리, 추측성 일반화 | [pattern-misuse-signals](pattern-misuse-signals.md) |
| Singleton/전역 가변 상태 | [pattern-misuse-signals](pattern-misuse-signals.md) + [di-strategy-factory-spring](di-strategy-factory-spring.md) |
| Visitor vs sealed when | [behavioral-patterns](behavioral-patterns.md) + [pattern-misuse-signals](pattern-misuse-signals.md) |

## KB 한 줄 요약

| KB | 다룸 |
|----|------|
| [creational-patterns](creational-patterns.md) | Factory Method, Abstract Factory, Builder, Prototype, Singleton — 적용/오용 신호 |
| [structural-patterns](structural-patterns.md) | Adapter, Bridge, Composite, Decorator, Facade, Flyweight, Proxy |
| [behavioral-patterns](behavioral-patterns.md) | Strategy·Template Method·Observer·State·Command·Chain 심화 + Iterator/Mediator/Visitor 요지 |
| [pattern-misuse-signals](pattern-misuse-signals.md) | 안티패턴 냄새 → 더 단순한 대안(sealed when / Extract Function / DI) |
| [di-strategy-factory-spring](di-strategy-factory-spring.md) | 생성자 주입, Strategy via DI, `@Bean`/`FactoryBean`/`ObjectProvider`, GoF↔Spring 대응 |

## 원칙 문서와의 관계
- 상위 판단 기준(적용 여부·YAGNI 가드레일)은 `../principles.md`(헌법). KB는 그 원칙의
  **공식 출처 근거·패턴별 세부 규칙**.
- **충돌 시 KB가 우선**한다. KB는 GoF/refactoring.guru/Spring 공식문서의 사실을 직접 인용하며,
  principles는 적용 판단의 통찰을 보탠다.

## 갱신 정책
- 각 파일 `last_fetched`(2026-06-24) 기준. refactoring.guru/Spring 문서 개정, GoF 재판 시
  `source`를 다시 확인해 갱신한다.
- Kotlin/Spring 메이저 변화(언어 기능, IoC API)가 패턴 실현 방식에 영향을 주면 해당 KB 보정.

## TODO (차기)
- 동시성 관련 패턴(Producer-Consumer, Active Object) 별도 KB 여지.
- Kotlin 함수형 대안(고차함수·`sealed`)과 GoF 패턴 대체 매핑 확장.
- 헥사고날/포트-어댑터와 Adapter·DI의 관계 심화.
