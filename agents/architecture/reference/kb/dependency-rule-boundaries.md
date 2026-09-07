---
title: 의존성 규칙과 경계 (Dependency Rule & Boundaries)
source: Clean Architecture (R. Martin, Ch.22 The Clean Architecture / Part V Architecture) + https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html
last_fetched: 2026-06-24
consumers: [architecture-reviewer]
---

# KB: 의존성 규칙과 경계

## 리뷰 훅 (이걸 점검하라)
- [ ] **안쪽이 바깥을 import 하는가** — 도메인/엔티티 패키지가 프레임워크·DB·HTTP·UI를 import 하면 의존성 규칙 위반.
  - grep 예: `grep -rn "import .*\(infra\|web\|persistence\|http\|jpa\|jdbc\)" <domain-dir>/`
- [ ] **포트(인터페이스)가 안쪽에, 구현(어댑터)이 바깥에** 있는가 — 의존성 역전이 실제로 적용됐는지.
- [ ] 도메인이 **구체 구현이 아니라 추상**에 의존하는가(예: `OrderRepository` 인터페이스를 도메인이 정의, 구현은 인프라).
- [ ] 경계를 가로지르는 데이터가 **단순 DTO/구조체**인가, 아니면 인프라 엔티티(ORM 엔티티)가 도메인까지 새는가(경계 누수).
- [ ] 레이어/경계 **우회**가 있는가 — 상위가 중간을 건너뛰고 최하위에 직접 의존.
- [ ] 순환 의존(A↔B)이 있는가 — import 그래프로 확인.

## 근거 (공식 자료 요지)
- **의존성 규칙(The Dependency Rule)**: 소스 코드 의존성은 **오직 안쪽(고수준 정책)으로만** 향한다. 안쪽 원의 어떤 것도 바깥 원(프레임워크·DB·UI·드라이버)의 이름을 알아선 안 된다.
- 동심원(바깥→안): Frameworks & Drivers → Interface Adapters → Use Cases → Entities. 바깥은 세부(detail), 안쪽은 정책(policy).
- **경계를 가로지를 때 의존성 역전(DIP)**: 제어 흐름은 바깥→안으로 가지만, 소스 의존성은 안→바깥이 되면 안 되므로 인터페이스(포트)를 안쪽에 두고 바깥이 구현하게 해 의존 방향을 뒤집는다.
- 경계를 넘는 데이터는 **단순한 데이터 구조**여야 한다 — 엔티티 객체나 DB row를 그대로 넘기면 안쪽이 바깥 형식에 묶인다.
- **Ports & Adapters(Hexagonal)**: 애플리케이션은 포트(인터페이스)로만 외부와 통신하고, 어댑터가 특정 기술(웹·DB·메시징)을 포트에 맞춘다 → 기술은 교체 가능한 세부.

## 경계 누수 신호 (boundary leak)
- ORM/프레임워크 애너테이션이 도메인 엔티티에 직접 붙음(도메인이 영속성 기술에 결합).
- 도메인 서비스가 HTTP 클라이언트·SQL을 직접 호출(어댑터 없이).
- "공유 모델" 패키지를 여러 모듈이 직접 의존해 한쪽 변경이 전체로 전파.

## 인용 시
"Clean Architecture 의존성 규칙 기준, `<domain>` 패키지가 `<infra>`를 import(`<path>:<line>`) → 안→밖 의존으로 규칙 위반. 포트 인터페이스를 도메인에 두고 인프라가 구현하도록 역전 권고" 식으로 근거(코드 위치)와 함께 단다.
