# Kotlin + Spring 리뷰 Knowledge Base — 색인 (INDEX)

> Kotlin/Spring **공식 문서** + Martin Fowler/DDD + Clean Code·Effective 계열 서적을 distill한
> 인용 가능한 KB. 각 파일 frontmatter에 `title`·`source`(원문 URL/책명)·`last_fetched`·`skills`.
> **리뷰 시 사용법**: 변경 성격에 맞는 KB를 먼저 읽고 각 파일의 `## 리뷰 훅`으로 점검하며,
> 지적 시 KB의 `source`를 근거로 인용한다(예: "Spring `Transaction Management` 기준 self-invocation은 …").

## 작업 유형 → 읽을 KB

### Pass 1 — 트리아지 (핫스팟 식별, 항상 먼저)
| KB | 다룸 |
|----|------|
| [triage-signals](triage-signals.md) | 변경 `.kt`의 고위험 grep 신호 → 핫스팟 + 레퍼런스 라우팅, 조기 종료 기준 |

### 공식 근거 (1차 — URL 출처)
| KB | 다룸 |
|----|------|
| [official/kotlin-official](official/kotlin-official.md) | Kotlin 컨벤션·널 안정성·코루틴·시퀀스·스코프 함수·관용구 |
| [official/spring-official](official/spring-official.md) | IoC/DI·`@Transactional`·Web MVC 검증·테스트 슬라이스·구성 프로퍼티 |
| [official/oop-principles](official/oop-principles.md) | SOLID·GRASP·Demeter·합성>상속·DDD 전술 패턴 |

### Pass 2 — 심층 (핫스팟 한정, 책 기반 보조)
| 변경 신호 / 경로 | KB |
|---|---|
| 항상 — 변경 파일의 아키텍처 위치/의존성 방향 | [architecture](architecture.md) |
| `domain/`·엔티티·VO·Aggregate·레이어/헥사고날·MSA 경계 | [architecture](architecture.md) |
| `controller`·`@Transactional`·`@Service`·JPA·DI·웹·검증 | [spring](spring.md) |
| `!!`·`var`·sealed·data·코루틴·스코프함수·`as`·제네릭 | [kotlin-idioms](kotlin-idioms.md) |
| 컬렉션 파이프라인·`Optional`→`T?`·날짜시간·불변/순수·병렬 | [functional-jvm](functional-jvm.md) |
| 네이밍·함수크기·주석·SRP·중복·디미터 등 일반 품질 | [clean-code](clean-code.md) |
| 최종 점검 / 심각도 판정 / 차원별 통합 체크리스트 | [checklist-and-severity](checklist-and-severity.md) |

## 원칙 문서와의 관계
- 상위 원칙·trade-off·우선순위는 `../principles.md`(헌법). KB는 그 원칙의 **공식 문서/Fowler 근거·세부 규칙**.
- 충돌 시 **프로젝트 규약 > 공식 문서(KB) > 책/블로그**. principles는 통찰을 보탠다.

## 갱신
- 각 파일 `last_fetched` 기준. Kotlin/Spring 메이저 업그레이드 시 `source` URL을 다시 fetch해 갱신.
- TODO(차기 KB 후보): Spring Security 심화, WebFlux/`Flow` 리액티브, 캐싱 추상화, 관측성(로깅/메트릭/트레이싱).
