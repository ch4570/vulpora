---
title: Bounded Context와 도메인 레이어 (DDD)
source: Domain-Driven Design (Eric Evans, Part II Building Blocks / Part IV Strategic Design) + https://martinfowler.com/bliki/BoundedContext.html
last_fetched: 2026-06-24
consumers: [architecture-reviewer]
---

# KB: Bounded Context와 도메인 레이어 (DDD)

## 리뷰 훅 (이걸 점검하라)
- [ ] 모듈/컨텍스트 경계가 **하나의 일관된 모델·언어** 범위로 그어졌는가 — 같은 용어(`Member`, `Order`)가 컨텍스트마다 다른 의미라면 경계 분리 신호.
- [ ] 컨텍스트 간 **도메인 모델·엔티티·DB 테이블·트랜잭션을 공유**하는가 → 경계 누수(공유는 컨텍스트 경계를 무력화).
- [ ] 컨텍스트 관계가 명시됐는가 — 공유 커널 / 고객-공급자 / **Anti-Corruption Layer(ACL)** 로 외부 모델 오염 차단.
- [ ] **애그리거트** 경계가 있는가 — 외부는 애그리거트 루트로만 접근, 불변식이 루트 안에서 보장되는가.
- [ ] 도메인 레이어가 애플리케이션/인프라 레이어와 분리됐는가 — 도메인 로직이 컨트롤러·SQL에 흩어지지 않았는가(빈약한 도메인 모델 anemic 신호).
- [ ] 리포지토리가 **애그리거트 단위**로 추상화됐는가, 아니면 테이블 CRUD에 그치는가.

## 근거 (요지)
- **Bounded Context**: 특정 모델이 유효하고 일관된 경계. 같은 단어라도 컨텍스트가 다르면 다른 모델이다(예: 주문 컨텍스트의 `Member` ≠ 결제 컨텍스트의 `Member`). 경계 안에서 Ubiquitous Language가 통일된다.
- **Context Map**: 여러 컨텍스트의 관계를 그린 지도. 통합 패턴 — Shared Kernel, Customer/Supplier, Conformist, **Anti-Corruption Layer**(번역 계층으로 외부 모델 침투 차단), Open Host Service.
- **Aggregate**: 일관성 경계. 외부는 애그리거트 **루트**를 통해서만 내부에 접근하고, 불변식(invariant)은 한 트랜잭션 안에서 루트가 보장. 애그리거트 간 참조는 ID로.
- **레이어 분리**: 도메인 레이어(엔티티·값객체·도메인 서비스)는 애플리케이션 레이어(유스케이스 조정)·인프라(영속성·메시징)와 분리. 도메인이 인프라에 의존하지 않게(의존성 역전).
- **빈약한 도메인 모델(Anemic Domain Model)** 안티패턴: 엔티티가 데이터만 갖고 로직은 서비스에 몰려 객체지향 이점을 잃음 → 도메인 응집 저하 신호.

## 인용 시
"DDD bounded context 기준, `Order` 컨텍스트와 `Payment` 컨텍스트가 동일 `Member` 테이블/엔티티를 직접 공유(`<path>`) → 컨텍스트 경계 누수. ACL 또는 컨텍스트별 모델 분리 권고" 식으로 근거와 함께 단다.
