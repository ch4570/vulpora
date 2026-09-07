---
title: 객체지향 설계 원칙 KB (SOLID/GRASP/DDD)
source: https://en.wikipedia.org/wiki/SOLID
last_fetched: 2026-06-24
skills: [kotlin-spring-review]
---

# 객체지향 설계 원칙 KB (코드 리뷰 기준)

> 조회일: 2026-06-22 · 출처: Robert C. Martin (cleancoder.com), martinfowler.com, Wikipedia(SOLID/GRASP/Law of Demeter/Composition over inheritance), Eric Evans DDD
>
> 대상: Kotlin + Spring Boot MSA, DDD 3계층(`web/api → application → domain ← infrastructure`) 또는 헥사고날. 심각도: 🔴 BLOCK · 🟠 WARN · 🟡 INFO · 🟢 NOTE

---

## 1. SOLID

### SRP — 단일 책임
정의: 모듈이 변경될 이유는 하나. 변경의 "이유"는 액터(이해관계자).
- FLAG: `OrderService`가 결제계산+이메일+DB+PDF리포트 → FIX: 액터별 분리 🟠
- FLAG: `@Service`가 도메인규칙+영속화+외부API+트랜잭션 혼재 → FIX: 조율만, 규칙은 domain, I/O는 어댑터 🟠
- FLAG: Entity가 `save()`/`toJson()`/`sendKafkaEvent()` → FIX: 영속화=Repository, 직렬화=mapper/DTO 🟡
- FLAG: 클래스>800줄/함수>50줄 → FIX: 책임 단위 분할 🟡

### OCP — 개방/폐쇄
정의: 확장에 열려, 변경에 닫혀. 새 동작=새 코드 추가.
- FLAG: 새 타입마다 `when(type)` 수정 → FIX: `sealed interface` + 다형성, `Map<String, Strategy>` 주입 🟠
- FLAG: 정책이 if 사다리 분산 → FIX: `interface DiscountPolicy` 구현체 추가 🟡

### LSP — 리스코프 치환
정의: 파생 타입으로 치환해도 정상 동작. 하위는 상위 계약(사전/사후/불변식) 유지.
- FLAG: `override fun withdraw() = throw UnsupportedOperationException()` → FIX: ISP/컴포지션 재설계 🔴
- FLAG: 하위가 사전조건 강화/사후조건 약화 → FIX: 계약 유지 🟠
- FLAG: `is` + 캐스팅 분기 → FIX: 다형 메서드 위임 🟡

### ISP — 인터페이스 분리
정의: 안 쓰는 메서드 의존 강요 금지. 작은 역할별 인터페이스.
- FLAG: 한 포트에 무관 오퍼레이션 20개 → FIX: `UserReader`/`UserWriter`/`UserStatsPort` 분리 🟠
- FLAG: 구현체가 절반을 빈/`TODO` → FIX: 클라이언트 단위로 분리 🟠
- FLAG: inbound/outbound 포트 한 덩어리 → FIX: use-case 포트와 영속 포트 분리 🟡

### DIP — 의존 역전
정의: 추상에 의존. 고수준이 저수준에 의존 금지, 둘 다 추상에.
- FLAG: domain/application이 `JpaOrderRepository`/`RestTemplate`/`KafkaTemplate` import → FIX: 포트 인터페이스만 의존, 구현은 infra `@Repository` 주입 🔴
- FLAG: `package domain`이 `package infra` import(의존 화살표 역방향) → FIX: 포트는 domain, 어댑터는 infra 🔴
- FLAG: 구체 클래스 `new`/필드 주입 → FIX: 생성자 주입 + 인터페이스 타입 🟠

**출처:** SRP — https://blog.cleancoder.com/uncle-bob/2014/05/08/SingleReponsibilityPrinciple.html · SOLID — https://en.wikipedia.org/wiki/SOLID

---

## 2. GRASP

### Information Expert
정보를 가진 클래스에 책임 할당.
- FLAG: `OrderService`가 `order.items`로 합계 직접 계산(Anemic) → FIX: `Order.totalAmount()` 🟠
- FLAG: getter 남발 후 외부 조합 → FIX: 도메인 메서드 캡슐화 🟡

### Controller
시스템 이벤트를 받아 조율(application/service 계층). 일은 위임.
- FLAG: `@RestController`에 비즈니스 규칙 → FIX: 매핑·검증·위임만 🟠
- FLAG: 컨트롤러가 Repository 직접 호출 → FIX: use-case 서비스 경유 🟡

### High Cohesion
책임이 한 주제에 집중.
- FLAG: `UtilService`/`CommonManager` 잡탕 → FIX: 응집 단위 분리 🟠
- FLAG: 타입별 패키지(`controllers/`,`services/`)에 전 도메인 혼재 → FIX: 바운디드 컨텍스트/기능 단위 🟡

### Low Coupling
의존 최소화.
- FLAG: MSA 서비스가 타 서비스 DB/Entity 직접 참조 → FIX: API/이벤트로만 통신 🔴
- FLAG: 구체 구현 직접 결합 → FIX: 인터페이스/포트 + DI 🟠

**출처: https://en.wikipedia.org/wiki/GRASP_(object-oriented_design)**

---

## 3. Law of Demeter (최소 지식)
정의: m은 (1)자신 (2)파라미터 (3)생성 객체 (4)자신의 필드 메서드만 호출. "친구하고만." 점 하나 규칙.
- FLAG: 기차 충돌 `order.getCustomer().getAddress().getCity().getName()` → FIX: Tell-Don't-Ask `order.shippingCity()` 🟠
- FLAG: 반환 객체 내부 파고듦 `repo.find(id).getWallet().getBalance().subtract(...)` → FIX: `account.withdraw(amount)` 🟡
- ※ Kotlin `apply`/`let` 체인, Stream/시퀀스 파이프라인은 위반 아님(동일 타입 fluent). 🟢

**출처: https://en.wikipedia.org/wiki/Law_of_Demeter**

---

## 4. Composition over Inheritance
정의: 상속 대신 객체를 필드로 보유·위임. 런타임 교체 가능, 조합 폭발/취약 기반 클래스 회피. (기본 선호, 절대법칙 아님.)
- FLAG: 재사용만을 위한 상속(is-a 아님) `class OrderService : JdbcSupport()` → FIX: 의존 주입 + 위임 🟠
- FLAG: 깊은 상속/취약 기반 클래스 → FIX: 인터페이스 + 합성, Kotlin `by` 위임 🟡
- FLAG: 상태 공유용 abstract class 강요 → FIX: 인터페이스 + `by delegate` 🟢

**출처: https://en.wikipedia.org/wiki/Composition_over_inheritance**

---

## 5. DDD 전술 패턴
| 패턴 | 정의 |
|---|---|
| Entity | 식별자(identity)를 가진 객체 |
| Value Object | 속성 조합으로만 의미, 값 같으면 동일, 불변 |
| Aggregate/Root | 일관성·트랜잭션 경계, 외부 참조는 Root로만 |
| Repository | 도메인 객체 컬렉션형 인터페이스 |
| Domain Service | 특정 Entity/VO에 안 속하는 연산, 무상태 |

- FLAG: Entity `equals()`를 전체 필드로 → FIX: 식별자(id) 기준 🟠
- FLAG: VO가 가변(setter/`var`) → FIX: `data class` + `val`, 교체 방식 🟠
- FLAG: Aggregate 내부를 외부에서 직접 변경 `order.items.add(...)` → FIX: `order.addItem(...)` Root 메서드 🔴
- FLAG: 한 트랜잭션이 여러 Aggregate 강결합 변경 → FIX: Aggregate당 1트랜잭션, 교차는 도메인 이벤트/결과적 일관성 🟠
- FLAG: Repository에 비즈니스 로직 → FIX: 영속화/조회만 🟡
- FLAG: Anemic Domain(규칙이 전부 `@Service`) → FIX: 규칙을 Entity/VO/Domain Service로 🟠
- FLAG: Domain Service에 가변 상태 → FIX: 무상태 유지 🟡

**출처:** Aggregate — https://martinfowler.com/bliki/DDD_Aggregate.html · Entity/VO/Service — https://martinfowler.com/bliki/EvansClassification.html · Repository — https://martinfowler.com/eaaCatalog/repository.html · 원전: Eric Evans, *Domain-Driven Design*(2003)

---

## 빠른 PR 게이트
- [ ] 🔴 domain/application이 infra 구체 타입 import 안 하는가? (DIP)
- [ ] 🔴 의존 화살표가 모두 domain 쪽인가? (DIP/헥사고날)
- [ ] 🔴 Aggregate 내부를 Root 밖에서 변경 안 하는가?
- [ ] 🔴 LSP 위반(override 예외) 없는가?
- [ ] 🟠 한 클래스가 한 액터에만 응답? (SRP)
- [ ] 🟠 새 타입 추가가 기존 분기 수정 없이? (OCP)
- [ ] 🟠 포트가 클라이언트 단위로 분리? (ISP)
- [ ] 🟠 빈약한 도메인 아닌가? (Information Expert)
- [ ] 🟠 기차 충돌 체이닝 없는가? (Demeter)
- [ ] 🟡 재사용 상속을 합성으로 대체?

## 리뷰 훅
- [ ] 🔴 domain/application이 infra 구체 타입을 import하지 않는가, 의존 화살표가 domain 쪽인가 (DIP).
- [ ] 🔴 Aggregate 내부를 Root 밖에서 변경하지 않는가, LSP 위반(override 예외)이 없는가.
- [ ] 🟠 한 클래스가 한 액터에만 응답하는가 (SRP), 새 타입 추가가 기존 분기 수정 없이 되는가 (OCP).
- [ ] 🟠 포트가 클라이언트 단위로 분리됐는가 (ISP), 빈약한 도메인이 아닌가 (Information Expert).
- [ ] 🟠 기차 충돌 체이닝이 없는가 (Demeter), 재사용 목적 상속을 합성으로 대체했는가.
