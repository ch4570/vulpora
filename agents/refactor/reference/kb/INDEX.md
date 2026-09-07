# 리팩터링 Knowledge Base — 색인 (INDEX)

> 리팩터링 카탈로그(Fowler) + 객체지향 설계(조영호 『오브젝트』·『객체지향의 사실과 오해』) +
> GoF 디자인 패턴(헤드퍼스트) + 모던 자바 인 액션 + JPA(김영한) + 토비의 스프링 +
> Effective Kotlin(Marcin Moskała)을 distill한 인용 가능한 KB. 각 파일 frontmatter에
> `title`·`source`·`versions`·`last_fetched`·`skills`.
>
> **사용법**: 변경/스멜 성격에 맞는 KB를 먼저 읽고 "리팩터링 훅"으로 점검하며, 처방 시 KB의
> 카탈로그명/항목(Effective Kotlin item, source URL)을 근거로 인용한다.

## 스멜·변경 성격 → 읽을 KB

| 신호 / 경로 | KB |
|---|---|
| 중복·긴 함수·큰 클래스·feature envy·primitive obsession·긴 매개변수 | [refactoring-catalog](refactoring-catalog.md) |
| 책임 배분·의존성 방향·캡슐화·도메인 빈혈·Tell Don't Ask | [oop-design](oop-design.md) |
| 타입 분기 반복(`when`/`if` 사다리)·전략 교체·알림/확장 지점·합성 vs 상속 | [design-patterns](design-patterns.md) |
| `val`/불변·`!!`/널·스코프함수·data/sealed·가독성·함수 설계 | [effective-kotlin](effective-kotlin.md) |
| 컬렉션 파이프라인·`Stream`/`Sequence`·`Optional`·람다·순수함수 | [modern-java-functional](modern-java-functional.md) |
| 엔티티·연관관계·N+1·지연/즉시로딩·영속성 컨텍스트·도메인 모델 | [jpa-domain](jpa-domain.md) |
| `@Transactional`·DI/IoC·AOP·템플릿콜백·빈 가변상태·트랜잭션 경계 | [spring-toby](spring-toby.md) |

## 원칙 문서와의 관계
- 상위 원칙·trade-off는 `../principles.md`(헌법). KB는 그 원칙의 **카탈로그/항목 근거**.
- 충돌 시 **프로젝트 규약 > Effective Kotlin·공식 문서(KB) > 책**. principles는 통찰을 보탠다.

## 갱신
- 각 파일 `last_fetched`·`versions` 기준. Effective Kotlin은 gitbook(jihunparkme) 요약이 `source`,
  원전은 Marcin Moskała, *Effective Kotlin*. 인용 전 항목 번호·내용을 재확인 권장.

## 비고
- 기존 `kotlin-spring-reviewer` 번들(`code-review/`)은 **결함 탐지·게이트키핑**용이다.
  본 번들은 **행위 보존 구조 개선(리팩터링)**용 — 역할이 다르므로 KB도 설계·패턴·카탈로그 중심이다.
