# mapper — 핵심 원칙 (principles)

> **출처(Sources)**
> - MapStruct reference guide — https://mapstruct.org/documentation/stable/reference/html/
> - Spring Framework reference: Kotlin support — https://docs.spring.io/spring-framework/reference/languages/kotlin.html
> - Jakarta Persistence 3.2 (entity boundary) — https://jakarta.ee/specifications/persistence/3.2/jakarta-persistence-spec-3.2
> - Kotlin docs — https://kotlinlang.org/docs/home.html

엔티티↔DTO/model 매핑을 작성·리뷰할 때의 원칙. 구체 규칙·스니펫은 `kb/` 참고하며,
원칙과 KB가 충돌하면 **KB(공식 문서 근거)가 우선**한다.

1. **매핑은 계층 경계에서만 한다 (엔티티 누수 방지).**
   JPA 엔티티는 영속 컨텍스트·지연 로딩에 묶여 있다. 엔티티를 서비스 밖(컨트롤러/외부 API/직렬화)으로
   그대로 흘리지 말고, 경계에서 model/DTO로 변환한다. 매핑 책임은 경계 한 곳에 모은다.

2. **생성자 기반 매핑을 우선한다 (불변 우선).**
   불변 객체(`val`)는 setter 주입이 불가능하므로 생성자(또는 빌더)로만 채울 수 있다. 부분 변경이 아니라
   "새 객체 생성"으로 매핑해 부작용을 없앤다. 이 프로젝트의 수동 매퍼는 전부 생성자 기반이다.

3. **null/옵셔널 처리를 명시한다.**
   nullable 필드의 변환 정책(그대로 전달 / 기본값 / 예외)을 매퍼에서 분명히 한다. Kotlin nullable ↔
   Java `Optional`/`null` 경계를 암묵적으로 넘기지 않는다. 필수값은 매핑 시 검증한다.

4. **수동 vs MapStruct 트레이드오프를 인지한다.**
   - MapStruct: 컴파일타임 코드 생성으로 타입안전·보일러플레이트 감소, 그러나 애너테이션 추론에 의존하고
     불변 `val`·Kotlin에서는 kapt/KSP 설정과 생성자/빌더 제약이 따른다.
   - 수동 매퍼: 코드가 투명하고 디버깅이 쉬우며 불변 객체와 자연스럽지만 필드가 많으면 보일러플레이트가 는다.
   이 프로젝트는 불변 모델 때문에 **수동 매퍼**를 택한다. 가변 모델 프로젝트라면 MapStruct도 정당한 선택이다.

5. **단방향 매핑을 분리한다 (`toModel`/`toEntity`).**
   읽기(`toModel`)와 쓰기(`toEntity`)는 변환 규칙이 다를 수 있으므로 별도 함수로 둔다. 양방향을 한 함수에
   섞지 않는다. 컬렉션 변환(`toModels`)도 단건 변환을 재사용한다.

6. **매퍼는 무상태(stateless)다.**
   매퍼는 입력만으로 출력을 결정하는 순수 변환이어야 한다. 가변 상태·외부 I/O·DB 조회를 매퍼 안에 두지
   않는다. `object` 싱글톤으로 두어도 안전한 이유가 이것이다.

7. **깊은 그래프 매핑 시 N+1·순환을 주의한다.**
   연관 엔티티를 매핑하며 지연 로딩을 건드리면 N+1 쿼리가 발생할 수 있다. 양방향 연관은 매핑 중 무한 순환에
   빠질 수 있으므로 매핑 깊이를 제한하거나 한쪽 방향만 매핑한다. 필요한 연관은 미리 fetch 한다.

## KB 우선 규칙
작업 전 `kb/INDEX.md`에서 해당 작업유형의 KB를 먼저 확인한다. 원칙은 방향을 주고, KB는 공식 문서 근거와
리뷰 훅을 준다. 상충하면 KB가 우선한다.
