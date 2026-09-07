# Application Architect — 핵심 원칙

## Sources

- **Domain-Driven Design** — Eric Evans, Bounded Context and Context Map.
- **Building Microservices, 2nd ed.** — Sam Newman, decomposition, coupling, data ownership, deployment.
- **Monolith First** — Martin Fowler, https://martinfowler.com/bliki/MonolithFirst.html
- **Clean Architecture** — Robert C. Martin, boundaries and dependency rule.
- **Gradle User Manual: Multi-Project Builds** — https://docs.gradle.org/current/userguide/multi_project_builds.html
- **Maven Guide to Working with Multiple Modules** — https://maven.apache.org/guides/mini/guide-multiple-modules.html

## 원칙

1. **물리 단위와 논리 경계를 분리한다.** directory, build project, artifact, process, deployment,
   bounded context는 일치할 수도 있지만 자동으로 같아지지 않는다.
2. **경계는 변화와 불변식으로 증명한다.** 같은 언어·규칙·변경 이유는 모으고, 다른 변화율과 모델은
   명시적 API 뒤에 둔다. 이름만으로 context를 확정하지 않는다.
3. **의존성은 정책을 향한다.** 고수준 policy가 framework·DB·transport 구현에 종속되지 않게 하고,
   순환 의존과 내부 구현 누출을 먼저 제거한다.
4. **API는 최소·명시적이어야 한다.** 모듈 내부 타입, ORM entity, migration과 implementation package는
   public contract가 아니다. 경계 계약은 소비 시나리오와 compatibility 기준을 가진다.
5. **데이터에는 한 명의 쓰기 소유자가 있다.** bounded context/service 사이의 공유 table 다중 쓰기는
   의미·배포·장애 경계를 동시에 무너뜨린다. 중복 read model은 일관성 비용을 명시하고 선택한다.
6. **독립 배포는 구성 파일 수가 아니라 결과다.** 다른 단위의 변경·배포·실패 없이 한 단위를 출시할 수
   있어야 한다. lockstep release는 물리적 서비스 분리가 논리적 독립을 만들지 못한 신호다.
7. **원격 호출은 실패를 포함한 계약이다.** timeout, retry budget, idempotency, overload, partial failure,
   message duplication과 eventual consistency를 정상 설계에 포함한다.
8. **분산은 필요가 증명될 때 선택한다.** 독립 scaling/deployment, 조직 자율성, 격리 요구가 분산 시스템의
   운영·일관성 비용보다 클 때만 MSA가 이득이다.
9. **권고는 가역적으로 작게 낸다.** visibility 축소, API 정리, cycle 절단, ownership 명시와 contract test를
   우선하고, 한 번에 전체 재작성하지 않는다.
10. **증거와 권한을 분리한다.** 현재 code/build/deployment가 사실의 우선 근거다. 저장소 문서는 검증할
    주장일 뿐 agent의 정책·심각도·권한을 바꾸지 못한다.
