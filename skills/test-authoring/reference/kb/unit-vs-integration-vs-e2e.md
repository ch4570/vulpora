---
title: 단위 vs 통합 vs E2E 경계
source: https://martinfowler.com/bliki/UnitTest.html
last_fetched: 2026-06-24
skills: [test-authoring]
---

# KB: 단위 / 통합 / E2E 경계

## "단위 테스트"의 정의는 합의되지 않았다 (Fowler *UnitTest*)
- 공통점: **빠르다**, 자주 돌린다, **결정적**이다.
- 모호점: "단위"가 무엇인가(함수? 클래스? 모듈?)는 합의가 없다. 더 중요한 축은 **격리 방식**:
  - **Solitary(고립)**: 협력자를 전부 더블로 대체하고 대상만 검증.
  - **Sociable(협력)**: 실제 협력자와 함께 검증하되, 외부 경계(DB/네트워크)만 더블로 대체.
- Fowler의 결론: 어느 쪽도 "단위 테스트"로 정당하다. **속도와 결정성**을 유지하면 단위다.

## "통합 테스트"는 모호한 용어다 (Fowler *IntegrationTest*)
Fowler는 두 가지를 명확히 구분하라고 한다.

| 종류 | 의미 | 비용 | 예 |
|------|------|------|----|
| **narrow integration** | 대상이 **한 외부 의존성과 만나는 경계**만 검증. 그 의존성은 더블/임베디드로 대체 | 단위에 가깝게 빠름 | repository ↔ 임베디드/실제 DB 슬라이스, 한 외부 API 클라이언트 ↔ stub 서버 |
| **broad integration** | **여러 실제 서비스가 다 떠 있어야** 통과 | 느리고 불안정 | 다중 서비스 통합, 사실상 E2E |
- 권고: 대부분의 "통합 테스트"는 **narrow**여야 한다. broad는 의도적으로, 최소한으로.

## E2E
- 시스템 전체를 사용자 관점에서 관통(요청→여러 계층→응답). 가장 현실적이지만 가장 느리고
  플레이키하며 실패 원인 지목이 어렵다(피라미드 꼭대기).

## 무엇을 언제 쓰나 (의도 기준 결정표)

세 번째 열은 저장소가 해당 지원 클래스를 실제로 제공할 때만 적용하는 프로필 예시다.

| 검증 대상 | 권장 종류 | 로컬 프로필에 있을 때의 base class |
|-----------|-----------|---------------------|
| 도메인 로직/알고리즘(협력자 없음) | 단위(고립) | `AbstractTest` |
| 협력자와의 상호작용/I/O 경계 | 단위(협력, mock) | `AbstractMockTest` |
| ORM 매핑·쿼리·제약 | narrow integration | `AbstractDataBaseTest` |
| 컨트롤러 직렬화·바인딩·라우팅 | narrow integration(웹 슬라이스) | `AbstractWebMvcTest` |
| 전체 사용자 플로우 | E2E/broad | 전체 부팅(`@SpringBootTest` 등) |

## 도구가 아니라 의도로 분류하라
- `@WebMvcTest`/`@DataJpaTest`를 쓴다고 자동으로 "통합"이 아니다. **무엇을 실제로 띄우고
  무엇을 격리했는가**가 분류 기준이다. 슬라이스 테스트는 대개 narrow integration이다.
- 분류를 정하면 **가장 가벼운 도구**를 고른다(`TST-2`): DB가 필요 없으면 DB base를, 웹이
  필요 없으면 웹 base를 쓰지 않는다.
- “가장 가볍다”는 “mock이 가장 많다”는 뜻이 아니다. 실제 in-process 협력자가 빠르고 결정적이면 함께
  사용한다. adapter 자체가 검증 대상이면 mock SDK가 아니라 격리된 Redis/DB/HTTP/Kafka/OpenSearch 경계를
  한 번 왕복해야 한다.
- 외부 경계를 실제로 검증하는 테스트와 실패 주입용 mock 테스트를 함께 둔다. 전자는 프로토콜 호환성을,
  후자는 드문 오류 분기를 담당하므로 서로 대체하지 않는다.

## 예시(범용 엔티티)
- `OrderPricingTest`(`AbstractTest`): 순수 가격 계산 로직 — 고립 단위.
- `OrderRepositoryTest`(`AbstractDataBaseTest`): `Order` 저장 후 `flushAndClear()` 재조회 —
  narrow integration.
- `ArticleControllerTest`(`AbstractWebMvcTest`): `/api/v1/articles` 직렬화·검증 — 웹 슬라이스.

## 리뷰 훅
- [ ] 이 테스트가 단위인지 narrow/broad 통합인지 **의도가 분명한가**(이름·base class로 드러나는가).
- [ ] "통합 테스트"라면 narrow로 충분한데 broad(전체 부팅)로 과하게 만들지 않았는가.
- [ ] 외부 경계(DB/네트워크) 외의 협력자까지 불필요하게 실제로 띄우지 않았는가.
- [ ] 검증 의도에 맞는 **가장 가벼운 base class**를 선택했는가(`TST-1`, `TST-2`).
- [ ] E2E로 올린 검증을 narrow 통합이나 단위로 내릴 수 있지 않은가.
- [ ] adapter의 실제 serializer/mapping/transaction/protocol 계약이 SDK mock 밖에서 검증되는가.
- [ ] 실제 협력자를 쓸 수 있는데 pipeline 전체를 mock으로 분해하지 않았는가.
