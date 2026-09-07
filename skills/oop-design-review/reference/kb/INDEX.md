# 객체지향 설계 리뷰 Knowledge Base — 색인 (INDEX)

> 객체지향 설계의 **표준·정전(canon)** (Martin SOLID, Larman GRASP, Parnas, GoF, Bloch,
> Lieberherr)을 distill한 인용 가능한 KB. 각 파일은 frontmatter에 `source`(원문/책+장)·
> `last_fetched`·`skills`를 담는다.
> **리뷰 시 사용법**: 작업 유형에 맞는 KB를 먼저 읽고, 그 "리뷰 훅"으로 점검하며, 지적할 때
> KB의 `source`를 근거로 인용한다. (예: "Effective Java Item 18 기준 — 합성으로 바꿔라")

## 작업 유형 → 읽을 KB
| 리뷰 작업 | 먼저 읽을 KB |
|-----------|--------------|
| 클래스 책임/구조 전반 리뷰 | [solid](solid.md), [grasp](grasp.md) |
| "이 책임을 어느 객체에?" 결정 | [grasp](grasp.md), [cohesion-coupling](cohesion-coupling.md) |
| 빈약한 도메인 모델 / 게터-세터 덩어리 | [encapsulation-invariants](encapsulation-invariants.md), [grasp](grasp.md) |
| God 클래스 / 변경 파급 큼 | [solid](solid.md)(SRP), [cohesion-coupling](cohesion-coupling.md) |
| 타입 분기(`when (type)`) 산재 | [solid](solid.md)(OCP), [grasp](grasp.md)(Polymorphism) |
| 상속 계층 / 오버라이드 위험 | [composition-over-inheritance](composition-over-inheritance.md), [solid](solid.md)(LSP) |
| 불변식·값 객체·가변 상태 누수 | [encapsulation-invariants](encapsulation-invariants.md) |
| 메시지 체인 / 강한 결합 | [law-of-demeter](law-of-demeter.md), [cohesion-coupling](cohesion-coupling.md) |
| 인프라 직접 의존(`new DB(...)`) | [solid](solid.md)(DIP), [grasp](grasp.md)(Protected Variations) |

## KB 한 줄 요약
| KB | 다룸 |
|----|------|
| [solid](solid.md) | SRP/OCP/LSP/ISP/DIP — 정의·위반 신호·교정 (Martin) |
| [grasp](grasp.md) | 책임 할당 9패턴: Expert/Creator/Controller/Low Coupling/High Cohesion/Polymorphism/Pure Fabrication/Indirection/Protected Variations (Larman) |
| [cohesion-coupling](cohesion-coupling.md) | 응집 7등급·결합 6등급, CBO/LCOM 지표, 낮추는 법 (Constantine/Yourdon) |
| [encapsulation-invariants](encapsulation-invariants.md) | 정보은닉(Parnas)·불변식·불변성·방어적 복사·Tell Don't Ask (Bloch) |
| [composition-over-inheritance](composition-over-inheritance.md) | fragile base class, is-a vs has-a, 합성+위임 (GoF/Bloch) |
| [law-of-demeter](law-of-demeter.md) | 최소 지식 원칙, train wreck, 허용 호출 대상, 자료구조 예외 (Lieberherr) |

## 원칙 문서와의 관계
- 상위 판단 기준은 `../principles.md`(헌법) — 책 기반 통찰·우선순위·트레이드오프.
- KB는 그 원칙의 **표준/공식 근거와 세부 규칙**(정의·등급·체크리스트).
- **충돌 시 KB(공식 문서/표준)가 우선**하며, principles는 판단의 통찰을 보탠다.

## 갱신 정책 (last_fetched)
- 각 파일 `last_fetched` 기준. 출처는 안정된 표준/명저라 변동이 드물지만, 위키피디아 항목(SOLID/GRASP/LoD)
  개정이나 Effective Java 신판 출간 시 `source`를 다시 확인해 갱신한다.

## TODO (차기 KB 후보)
- design-patterns(GoF 23패턴 카탈로그 요약), dependency-injection(DI/IoC 컨테이너),
  value-objects-and-ddd(값 객체·애그리거트 경계), anemic-vs-rich-domain(빈약/풍부 도메인 모델),
  command-query-separation(CQS, Meyer).
