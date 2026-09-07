# Java 리뷰 원칙 (헌법)

> KB가 "사실·규칙"이라면 이 문서는 "통찰·판단 기준"이다. 충돌 시 **KB(공식 문서/표준)가 이 문서보다 우선**한다.

## Sources (근거)
- **Effective Java, 3rd ed.** — Joshua Bloch (Addison-Wesley). 항목 번호(Item N)로 인용.
- **Java Language Specification (JLS)** — https://docs.oracle.com/javase/specs/ (특히 §17 Memory Model).
- **Oracle Java 공식 문서/튜토리얼/API** — https://docs.oracle.com/en/java/ , https://docs.oracle.com/javase/tutorial/
- **Spring Framework·Spring Boot·Spring Data JPA 공식 문서** — https://docs.spring.io/spring-framework/reference/ ,
  https://docs.spring.io/spring-boot/reference/ , https://docs.spring.io/spring-data/jpa/reference/
- **OWASP** — https://owasp.org/www-project-top-ten/ (보안 분류 근거).

## 원칙

1. **근거 기반 — 규약으로 짚는다.** 모든 지적은 EJ Item·JLS·Oracle docs·OWASP 중 하나에 근거한다.
   "관례상"·"보통"이 아니라 **명시된 규약/표준**으로 인용한다. 근거 없는 단정은 하지 않는다.

2. **측정 우선 — 성능은 측정으로.** 성능 판단은 마이크로벤치(JMH)·프로파일·명시적 복잡도(Big-O)로만.
   "이게 더 빠릅니다"식 직관 단정 금지. 조기 최적화보다 정확성·명료성이 먼저다(EJ Item 67).

3. **불변을 선호.** 가변 클래스보다 불변 클래스를 우선한다(EJ Item 17). 불변 객체는 본질적으로
   스레드 안전하고, 공유·캐싱이 자유롭다. 가변이 필요하면 **변경 범위를 최소화**한다.

4. **캡슐화·정보 은닉.** 접근성을 최소화한다(EJ Item 15). 가변 필드 `public` 노출 금지, 가변 컴포넌트는
   방어적 복사(EJ Item 50). 공개 API는 좁고 명확하게, 한 번 공개하면 영원히 지원해야 함을 전제한다.

5. **객체 규약 일관성.** `equals`를 재정의하면 `hashCode`도 재정의한다(EJ Item 10·11). `equals`는
   반사·대칭·추이·일관·non-null 규약을 지킨다. `Comparable.compareTo`는 `equals`와 일관되게(EJ Item 14).
   `toString`은 유용한 정보를 담되 포맷을 계약으로 고정하지 않는다(EJ Item 12).

6. **예외·리소스 안전.** 복구 가능 조건엔 checked, 프로그래밍 오류엔 런타임 예외(EJ Item 70). 예외를
   삼키지 않는다(EJ Item 77) — 빈 catch 금지. 리소스는 `try-with-resources`로 닫는다(EJ Item 9).
   추상화 수준에 맞게 예외를 변환하되 원인을 연쇄(chaining)로 보존한다(EJ Item 73).

7. **null 대신 명확한 부재 표현.** 컬렉션/배열은 null 대신 빈 것을 반환한다(EJ Item 54). 반환 부재는
   `Optional`을 고려하되 남용 금지(EJ Item 55) — 컬렉션·박싱 타입·성능 민감 경로엔 부적절.

8. **동시성 — 가시성·원자성을 분리해 본다.** 공유 가변 데이터 접근은 동기화로 **상호배제와 가시성**을
   함께 보장한다(EJ Item 78). `volatile`은 가시성만(복합연산 원자성 아님). 과도한 동기화를 피하고
   (EJ Item 79), `wait/notify`보다 `java.util.concurrent` 고수준 유틸을 선호한다(EJ Item 81).

9. **제네릭 — 타입 안전.** raw 타입 금지(EJ Item 26), 비검사 경고 제거(EJ Item 27). API 유연성을 위해
   **PECS**(producer-extends, consumer-super) 한정 와일드카드를 쓴다(EJ Item 31). 제네릭은 무공변임을
   인지한다(`List<Object>`는 `List<String>`의 상위 타입이 아니다).

10. **컬렉션·스트림 — 부작용 없이.** 스트림은 부작용 없는 함수로(EJ Item 46), 가독성을 해치면 쓰지
    않는다(EJ Item 45). 컬렉션은 계약(equals 기반 동등성·순서·null 허용)에 맞게 선택한다.

11. **보안 — 신뢰 경계 입력 검증.** 모든 외부 입력은 경계에서 검증한다(EJ Item 49·90). 역직렬화를
    신뢰 입력에 쓰지 않고(EJ Item 85), SQL/명령은 파라미터화하며, 난수는 용도에 맞게
    (`SecureRandom` for 보안). OWASP Top 10을 기준 분류로 삼는다.

12. **리뷰어 자세 — 표면 회피 금지.** 스멜 나열에서 멈추지 않고 설계·규약·동시성·리소스 수명까지
    진단한다. 사실 전제는 grep/Read로 확인하고, 미확인 가정은 심각도 상한(MEDIUM)을 둔다.
    코드를 작성하지 않고 **진단·근거·방향**을 제시한다.

13. **Spring은 annotation이 아니라 runtime 계약으로 본다.** 생성자 DI와 bean scope, AOP proxy 진입,
    transaction manager·propagation·rollback, MVC validation/exception mapping, JPA entity state와 test
    context를 실제 wiring·호출부·설정으로 확인한다. `@Transactional`이 보인다는 이유만으로 적용 또는
    미적용을 단정하지 않는다.

14. **트랜잭션과 persistence는 경계를 함께 본다.** 외부 I/O를 포함한 긴 transaction, self-invocation,
    잘못된 rollback 전제, 식별자/version에 따른 `persist`/`merge` 선택, singleton bean의 공유 가변 상태는
    production correctness 위험이다. CRITICAL/HIGH는 실제 호출 경로·상태 전제를 확인한 뒤에만 부여한다.

15. **가장 작은 Spring test로 증명한다.** 순수 로직은 Spring 없이 unit test하고, MVC/JPA/bean wiring은
    필요한 slice 또는 좁은 context test를 사용한다. 전체 context만으로 모든 위험을 검증했다고 보지 않고,
    test context cache·profile·property 차이가 증거를 바꾸는지 확인한다.
