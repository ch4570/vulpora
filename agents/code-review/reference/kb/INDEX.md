# Kotlin + Spring Knowledge Base — 색인 (INDEX)

> Kotlin/Spring **공식 문서** + **Martin Fowler**(martinfowler.com) + refactoring.com을 distill한
> 인용 가능한 KB. 각 파일 frontmatter에 `source`(원문 URL)·`versions`·`last_fetched`·`skills`.
> **리뷰 시 사용법**: 변경 성격에 맞는 KB를 먼저 읽고 "리뷰 훅"으로 점검하며, 지적 시 KB의
> `source` URL을 근거로 인용한다(예: "Spring `Transaction Management` 기준 self-invocation은 …").
> 책 기반 통찰은 상위 `principles.md`와 이 번들의 KB를 함께 적용한다.

## 변경 성격 → 읽을 KB

| 변경 신호 / 경로 | KB |
|---|---|
| `!!`·`var`·sealed·data·코루틴·스코프함수·`as` | [kotlin-official](kotlin-official.md) |
| `@Transactional`·`@Service`·`@Component`·DI·JPA·웹·검증 | [spring-official](spring-official.md) |
| 긴 함수·큰 클래스·중복·SRP·네이밍·smell | [refactoring-smells](refactoring-smells.md) |
| `domain/`·엔티티·VO·Aggregate·레이어/헥사고날·의존성 방향 | [architecture-ddd](architecture-ddd.md) |
| 분산·외부연동·IoC/DI·CQRS·회복탄력성·메시징 | [architecture-ddd](architecture-ddd.md) |
| 테스트·목·커버리지·테스트 설계 | [testing](testing.md) |

## 원칙 문서와의 관계
- 상위 원칙·trade-off는 `../principles.md`(헌법). KB는 그 원칙의 **공식 문서/Fowler 근거**.
- 충돌 시 **프로젝트 규약 > 공식 문서(KB) > 책/블로그**. principles는 통찰을 보탠다.

## 갱신
- 각 파일 `last_fetched`·`versions` 기준. URL은 canonical 슬러그(인용 전 접속 확인 권장).
- 책 기반 세부 체크리스트는 스킬 내부 `references/`에 그대로 있음(중복 작성하지 않음).
