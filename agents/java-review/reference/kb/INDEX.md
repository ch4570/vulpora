# Java Knowledge Base — 색인 (INDEX)

> Java **공식 문서/표준**(JLS·Oracle docs/API·OWASP)과 『Effective Java 3rd』를 distill한 인용 가능한 KB.
> 각 파일은 frontmatter에 `title`·`source`(원문 URL/책 항목)·`last_fetched`·`skills`를 담는다.
> **리뷰 시 사용법**: 작업 유형에 맞는 KB 파일을 먼저 읽고, 그 "리뷰 훅"으로 점검하며,
> 지적할 때 KB의 `source`(공식 문서 URL 또는 EJ Item)를 근거로 인용한다.

## 작업 유형 → 읽을 KB

| 변경 성격 / 위험 신호 | 읽을 KB | 다룸 |
|---|---|---|
| equals/hashCode/compareTo, 빌더·정적팩토리, enum/싱글톤, 제네릭, Optional, record/sealed | [language-idioms](language-idioms.md) | Effective Java 핵심 관용구·객체 규약·현대 Java |
| `synchronized`/`volatile`/`atomic`, static 가변 필드, Executor, 스레드 공유 상태, 레이스/데드락 | [concurrency](concurrency.md) | Java Memory Model, java.util.concurrent, 불변·thread confinement |
| `try`/`catch`/`finally`, checked vs unchecked, `close()`, 리소스 누수, 예외 변환/삼킴 | [exceptions-resources](exceptions-resources.md) | 예외 설계, try-with-resources, 리소스 안전 |
| Collection 선택, `Stream`/`parallel`, equals 기반 컬렉션, 불변 컬렉션, 부작용 | [collections-streams](collections-streams.md) | 컬렉션 계약·선택, 스트림 함정 |
| 역직렬화, SQL/명령 인젝션, `Random`/암호, 경로 조작, 외부 입력 검증 | [security](security.md) | OWASP 기반 Java 보안 취약점 |
| `@Component`/`@Service`, DI, bean scope, `@Transactional`, proxy/self-invocation, propagation/rollback | [spring-beans-transactions](spring-beans-transactions.md) | Spring bean·AOP proxy·transaction 경계 |
| `JpaRepository`, entity id/version, `save`, persist/merge, persistence lifecycle | [spring-data-jpa](spring-data-jpa.md) | Spring Data JPA entity state와 저장 계약 |
| `@RestController`, `@Valid`, `@ControllerAdvice`, error response, `@SpringBootTest`, test slice | [spring-web-testing](spring-web-testing.md) | MVC 입력/오류 계약과 focused test evidence |

## 원칙 문서와의 관계
- 상위 원칙·판단 기준은 `../principles.md`(헌법, 책 기반 통찰). KB는 그 원칙의 **공식 문서/표준 근거·세부 규칙**.
- 충돌 시 **KB(공식 문서/표준)가 우선**하며, principles는 책 기반 통찰을 보탠다.

## 갱신
- 각 파일 `last_fetched` 기준. JDK 메이저 업그레이드(LTS) 시 `source` URL을 다시 확인해 갱신.
- TODO(차기 KB 후보): JVM 성능·GC/JIT 기초, I/O·NIO, java.time(날짜·시간) 함정, 모듈 시스템(JPMS),
  직렬화 대안(레코드·JSON), 로깅·관찰성.
