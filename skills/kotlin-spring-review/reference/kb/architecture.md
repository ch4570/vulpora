---
title: 아키텍처 리뷰 — DDD 레이어드 · 헥사고날 · MSA
source: https://martinfowler.com/bliki/DDD_Aggregate.html
last_fetched: 2026-06-24
skills: [kotlin-spring-review]
---

# 아키텍처 리뷰 — DDD 3-레이어드 · 헥사고날 · MSA

> 근거: Clean Code 8장(경계), 11장(시스템), 10장(클래스·SRP·DIP) + DDD/헥사고날 정립된 실무.
> **리뷰 시 가장 먼저 보는 차원.** 의존성 방향 위반은 한 번 새면 되돌리기 가장 비싸다.

## 0. 핵심 원칙 — 의존성 규칙 (The Dependency Rule)

> **모든 소스 의존성은 항상 안쪽(도메인)을 향한다. 도메인은 바깥(프레임워크·DB·웹)을 모른다.**

```
  ┌───────────────────────────────────────────────┐
  │  adapter (web / persistence / messaging / ...)  │  ← 프레임워크 의존 OK
  │   ┌───────────────────────────────────────┐    │
  │   │  application (use case / port)          │    │  ← 도메인만 의존
  │   │   ┌───────────────────────────────┐    │    │
  │   │   │  domain (entity / vo / 규칙)    │    │    │  ← 아무것도 의존 X (순수 Kotlin)
  │   │   └───────────────────────────────┘    │    │
  │   └───────────────────────────────────────┘    │
  └───────────────────────────────────────────────┘
        의존성 방향 →→→ 안쪽으로만
```

- 🔴 **CRITICAL/HIGH**: 도메인 → 어댑터/인프라 의존 (예: 도메인 엔티티가 `@Entity`, `@Table`,
  `RestTemplate`, `JdbcTemplate`, Jackson 애너테이션에 의존). 의존성 역전.
- 🟠 **HIGH**: application 레이어가 구체 어댑터(예: `JpaUserRepository`)에 직접 의존.
  포트(인터페이스)에 의존하고 어댑터가 이를 구현(DIP)해야 한다.

## 1. DDD 기반 3-레이어드 아키텍처

전형적 패키지 구조 (바운디드 컨텍스트 단위):

```
com.example.order
├── domain/                  # 순수 도메인 — 프레임워크 무관
│   ├── model/               #   Order, OrderLine (Aggregate), Money (VO)
│   ├── event/               #   OrderPlaced (도메인 이벤트)
│   └── service/             #   도메인 서비스 (엔티티 하나에 안 맞는 규칙)
├── application/             # 유스케이스 오케스트레이션
│   ├── port/in/             #   PlaceOrderUseCase (인바운드 포트)
│   ├── port/out/            #   LoadProductPort, SaveOrderPort (아웃바운드 포트)
│   └── service/             #   PlaceOrderService (@Service, @Transactional)
└── adapter/                 # 바깥 세상
    ├── in/web/              #   OrderController, 요청/응답 DTO
    ├── out/persistence/     #   OrderJpaEntity, OrderPersistenceAdapter
    └── out/client/          #   PaymentClientAdapter
```

### 레이어별 책임과 리뷰 포인트

| 레이어 | 책임 | FLAG (위반) |
|--------|------|------------|
| **domain** | 비즈니스 규칙·불변식. 순수 Kotlin | 🔴 프레임워크/JPA/Jackson 애너테이션, DB·HTTP 호출, `@Autowired` |
| **application** | 유스케이스 흐름, 트랜잭션 경계, 포트 호출 | 🟠 구체 어댑터 직접 참조, 도메인 규칙이 여기로 샘(빈약한 도메인), 컨트롤러/HTTP 개념 누수 |
| **adapter** | 외부 ↔ 내부 변환(매핑), 프레임워크 결합 | 🟠 어댑터에 비즈니스 규칙, 도메인 모델을 그대로 외부에 노출 |

### Aggregate / Entity / Value Object
- 🟠 **HIGH**: 불변식을 깨는 setter 노출 → 도메인 메서드로 상태 전이(`order.cancel()`),
  생성자/팩토리에서 불변식 검증(`require(...)`).
- 🟡 VO는 `data class` + 전부 `val` + `copy()`. 동등성은 값 기반(`data class` 자동).
- 🟠 Aggregate 경계 넘는 직접 참조 금지 — 다른 Aggregate는 **ID로 참조**.
- 🟡 빈약한 도메인 모델(Anemic Domain Model): 엔티티가 게터/세터 자루뿐이고 모든 로직이
  서비스에 있으면 → 행위를 도메인으로 이동 (Clean Code 6장 객체 vs 자료구조, "기능 욕심" G14).

## 2. 헥사고날 아키텍처 (포트 & 어댑터)

- **포트(Port)** = application이 정의하는 인터페이스. 인바운드(유스케이스), 아웃바운드(SPI).
- **어댑터(Adapter)** = 포트의 구현/사용. 인바운드(컨트롤러·리스너), 아웃바운드(JPA·HTTP·MQ).
- 근거: Clean Code 8장 "경계" — *"통제 불가능한 외부 패키지에 의존하는 대신 통제 가능한
  우리 코드(포트)에 의존하라."*

```kotlin
// application/port/out/LoadProductPort.kt — 도메인 언어로 정의된 아웃바운드 포트
interface LoadProductPort {
    fun loadProduct(id: ProductId): Product   // 도메인 타입만 등장
}

// adapter/out/persistence/ProductPersistenceAdapter.kt — 어댑터가 포트를 구현
@Component
class ProductPersistenceAdapter(
    private val repository: ProductJpaRepository,
    private val mapper: ProductMapper,
) : LoadProductPort {
    override fun loadProduct(id: ProductId): Product =
        repository.findById(id.value)
            .map(mapper::toDomain)
            .orElseThrow { ProductNotFoundException(id) }
}
```

### 리뷰 포인트
- 🔴 **CRITICAL**: 외부 SDK/브로커/HTTP 클라이언트 호출이 도메인/유스케이스에 직접 박혀 있음
  → 아웃바운드 포트 + 주입된 어댑터로 격리 (Clean Code 8장 R8.3).
- 🟠 **HIGH**: 포트 시그니처에 프레임워크/벤더 타입(`ResponseEntity`, `JsonNode`, JPA `Entity`,
  `Map`) 노출 → 도메인 타입/DTO만 (Clean Code 8장 R8.1/R8.2).
- 🟠 어댑터가 다른 어댑터를 직접 호출 → 포트를 통해서만.
- 🟡 단일 구현뿐인 포트라도, 테스트 더블·교체 가능성·의존성 역전을 위해 정당화되면 유지.
  단, 아무 이유 없이 모든 클래스에 `Impl` 인터페이스를 다는 것은 과설계 (Clean Code 17장 Rule 4).

## 3. MSA 경계 (바운디드 컨텍스트 / 서비스 간)

- 🟠 **HIGH**: 다른 서비스의 내부 DB/엔티티에 직접 접근(공유 DB 안티패턴) → API/이벤트로만 통신.
- 🟠 컨텍스트 간 모델 공유 강요 금지 — 각 컨텍스트가 자기 모델 소유. 경계에서 변환(ACL,
  Anti-Corruption Layer = 어댑터의 일종).
- 🔴 **CRITICAL**: 서비스 간 동기 호출에 타임아웃·재시도·서킷브레이커 부재 → 장애 전파.
  외부 대기는 항상 타임아웃 경계(`withTimeout`, 클라이언트 타임아웃) 설정.
- 🟠 분산 트랜잭션을 2PC로 시도 → Saga/이벤트 기반 최종 일관성 검토.
- 🟡 멱등성(idempotency): 재시도/중복 메시지에 안전한가(멱등 키, 업서트).
- 🟠 이벤트 발행/소비: 이벤트 스키마 호환성(하위호환), 발행 실패 처리(아웃박스 패턴) 확인.

## 4. 구성/와이어링 분리 (Clean Code 11장)
- 🟡 객체 생성/와이어링은 `@Configuration`/`main`에 모으고, 비즈니스 메서드에 생성 로직을
  섞지 않는다 (R11.1~R11.3). 런타임 로직 속 `if (x == null) x = ...` 지연초기화 산재 금지.
- 🟠 도메인/유스케이스는 컨테이너 없이도 단위 테스트 가능해야 한다(프레임워크 프리). 실행
  컨테이너가 떠야만 테스트되는 도메인 로직 → 결합 분리.
- 🟡 횡단 관심사(트랜잭션·보안·로깅)는 AOP/선언적 처리로 모은다 — 서비스마다 복붙 금지.

## 빠른 의존성 점검 (grep 힌트)
```bash
# 도메인 패키지가 프레임워크에 의존하는지
grep -rEn "import (jakarta\.persistence|org\.springframework|com\.fasterxml)" domain/
# 유스케이스가 구체 어댑터를 참조하는지 (포트가 아니라 Impl/JpaXxx)
grep -rEn "JpaRepository|RestTemplate|WebClient|JdbcTemplate" application/
```
하나라도 잡히면 의존성 규칙 위반 후보 → 레이어 재배치 또는 포트 도입 제안.

## 리뷰 훅
- [ ] 🔴 도메인이 프레임워크/JPA/Jackson 애너테이션·HTTP 클라이언트에 의존하지 않는가 (의존성 규칙).
- [ ] 🔴 의존 화살표가 모두 안쪽(도메인)을 향하는가. 도메인 → 어댑터/인프라 import 없음.
- [ ] 🟠 application이 구체 어댑터가 아니라 포트(인터페이스)에 의존하는가 (DIP).
- [ ] 🟠 포트 시그니처에 벤더/프레임워크 타입(`ResponseEntity`/`JsonNode`/JPA Entity)이 노출되지 않는가.
- [ ] 🟠 다른 Aggregate는 ID로 참조하고, 바운디드 컨텍스트 경계를 넘는 직접 DB/엔티티 참조가 없는가.
- [ ] 🔴 서비스 간 동기 호출에 타임아웃/재시도/서킷브레이커가 있는가 (장애 전파 차단).
- [ ] 🟡 빈약한 도메인 모델이 아닌가 — 불변식이 생성자/도메인 메서드로 보장되는가.
