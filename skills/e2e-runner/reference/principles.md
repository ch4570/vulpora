# E2E Runner 핵심 원칙 (Principles)

> 이 문서는 **실행 중인 시스템(running system)** 에 대해 E2E 시나리오 카탈로그를 실행하고
> 구조화된 리포트(JSON + Markdown)를 생성하는 스킬의 판단 기준("헌법")이다.
> KB가 "공식 문서가 말하는 사실·규칙"이라면, 이 문서는 그 사실들을 **실행 전략으로 엮는 통찰**이다.
> 충돌 시 **KB(공식 문서)와 SKILL.md(RUN-n 규칙)가 이 문서보다 우선**한다.
>
> **출처(Sources)**
> - Google Testing Blog, "Flaky Tests at Google and How We Mitigate Them" (testing.googleblog.com, 2016)
> - Martin Fowler, "Eradicating Non-Determinism in Tests" / "Test Pyramid" (martinfowler.com)
> - REST-assured Usage Guide (github.com/rest-assured/rest-assured/wiki/Usage)
> - JetBrains HTTP Client docs (jetbrains.com/help/idea/http-client-in-product-code-editor.html)
> - Awaitility Usage (github.com/awaitility/awaitility/wiki/Usage)
> - Apache Kafka Documentation (kafka.apache.org/documentation)
> - Testcontainers docs (testcontainers.com/getting-started)
> - Docker Compose docs (docs.docker.com/compose)
> - Spring Boot Actuator — Endpoints (docs.spring.io/spring-boot/reference/actuator/endpoints.html)
> - NestJS — Controllers / Lifecycle events (docs.nestjs.com/controllers, docs.nestjs.com/fundamentals/lifecycle-events)
> - GitLab CI/CD docs (docs.gitlab.com/ee/ci)
> - OWASP Logging Cheat Sheet (cheatsheetseries.owasp.org)
>
> E2E는 단위 테스트와 다르다. 단위 테스트는 **격리된 코드의 논리**를 본다. E2E는
> **배포 가능한 시스템 전체의 행동**을 본다. 따라서 "테스트가 통과했는가"보다 "관측된 사실이
> 무엇인가"가 1차 산출물이다.

---

## 0. 대전제: E2E는 "단언(assert)"이 아니라 "관측(observe)"이다

- E2E 러너의 본질은 **실행 중인 시스템에 자극을 주고, 관측된 사실을 증거로 남기는 것**이다.
  통과/실패는 그 관측에서 **파생되는 판정**일 뿐, 산출물의 핵심은 관측 증거다.
- "단언만 있고 증거가 없는" 결과는 신뢰할 수 없다. 상태코드·지연·헤더·본문·로그가 함께
  남아야 사후에 누구든 재판단할 수 있다. → KB `pii-masking-and-evidence`.
- 그래서 러너는 **read-only**(카탈로그 비변경) 이고, **관측을 왜곡할 수 있는 모든 자동 보정
  (auto-retry, 모드 자동 전환)을 금지**한다(SKILL.md `RUN-2`, `RUN-3`, `RUN-8`).

---

## 1. 직렬·결정적(serial & deterministic) 실행 — 동시성은 진실을 오염시킨다

『Test Pyramid』 + SKILL.md `RUN-10`.

1. **E2E는 공유 상태(DB row, 인덱스, 세션, Kafka 오프셋)를 만진다.** 병렬 실행은 그 공유
   상태를 두 시나리오가 동시에 건드리게 해, 한 시나리오의 결과가 다른 시나리오의 부작용에
   오염된다 → 재현 불가능한 결과.
2. 따라서 시나리오는 **카탈로그 순서대로 직렬 실행**한다. 순서가 곧 계약이며, `Depends-on`
   체인은 그 순서를 명시적으로 표현한 것이다(`RUN-11`).
3. **결정성(determinism)은 신뢰성의 전제다.** 같은 입력·같은 환경에서 같은 결과가 나와야
   한다. 결정성을 깨는 요인(시간 의존, 순서 의존, 외부 네트워크)은 플레이키의 근원이다.
   → KB `flaky-tests`.

---

## 2. 한 번만 실행한다(run-once) — 재시도로 진실을 가리지 마라

Google "Flaky Tests" + SKILL.md `RUN-2`.

1. **한 번의 호출당 각 시나리오는 정확히 한 번 실행된다.** 실패한 시나리오를 조용히 다시
   돌려 "통과"로 바꾸는 것은 금지다. 재실행은 사용자가 명시적으로 시작하는 별도 호출이다.
2. **재시도는 플레이키를 치료하지 않고 은폐한다.** 자동 재시도는 "가끔 실패하는" 신호를
   "항상 통과하는" 거짓 신호로 바꿔, 실제 결함(경합·타이밍 버그)을 운영까지 끌고 간다.
3. **단, bounded polling은 재시도가 아니다.** 비동기/최종일관성(eventual consistency)
   시나리오에서 유한한 deadline 안에서 조건이 충족될 때까지 폴링하는 것은, 시나리오 자체가
   "조건이 처음 성립하는 순간을 한 번 관측"하는 단일 관측이다(`RUN-2.1`). → KB
   `async-and-eventual-consistency`.

---

## 3. 관측 전용(observe-only) — 시스템 경계를 넘지 마라

SKILL.md `RUN-1`, `RUN-3`, `RUN-6.2`.

1. 러너는 **카탈로그에 대해 읽기 전용**이다. 카탈로그가 없거나 망가졌으면 멈추고 묻는다;
   카탈로그를 자동 수정하거나 생성하지 않는다.
2. 러너는 **사용자 소유 인프라를 변경하지 않는다.** 시나리오의 `sql` fence는 `SELECT` 계열만,
   `shell` fence는 허용목록(allowlist) 명령만 실행한다. 상태를 바꿔야 하는 시나리오는
   `Mutates:`를 선언하고 teardown으로 원복해야 한다(idempotency).
3. **예외는 "테스트 픽스처"뿐이다.** 테스트 대상 애플리케이션 프로세스의 기동/종료, 또는
   Testcontainers가 띄우는 격리 컨테이너는 단명(ephemeral) 픽스처이므로 러너가 관리한다.
   사용자 인프라(공용 compose 스택)는 절대 만지지 않는다. → KB `test-environment-and-data`.

---

## 4. 환경이 가장 큰 변수다 — 실행 전에 환경을 게이팅하라

Testcontainers / Spring Boot Actuator / NestJS docs + SKILL.md `RUN-7`.

1. **E2E가 실패하는 이유의 대부분은 환경이다.** 그래서 한 owner가 Testcontainers, 초기화, 앱,
   테스트 클라이언트를 끝까지 소유하고 endpoint manifest를 남긴다.
2. Docker CLI 연결과 Testcontainers runtime 연결은 다르다. 실제 컨테이너 시작 증거, mapped endpoint
   주입, Spring Actuator 또는 repository-declared NestJS health/readiness probe가 모두 있어야 환경 게이트를 통과한다.
3. Compose는 capability 근거일 뿐 실행하지 않는다. 공유 앱·고정 포트·원격 endpoint·재사용 인증 상태를
   채택한 결과는 검수 PASS가 아니다.
4. **합성 데이터만 쓴다.** 실데이터·PII를 E2E 픽스처로 끌어오지 않는다(법적·보안 리스크 +
   비결정성). → KB `test-environment-and-data`, `pii-masking-and-evidence`.

---

## 5. 증거가 단언을 이긴다(evidence over assertion-only)

OWASP Logging Cheat Sheet + SKILL.md `RUN-13`, `RUN-14`.

1. 각 시나리오는 **상태코드·지연·응답 헤더·응답 본문**을 증거로 캡처한다. 본문은 head/tail로
   잘라 리포트를 가볍게 유지하되, 전체는 별도 raw 파일로 보존한다.
2. **실패 시에만 로그를 첨부**한다(성공 리포트는 작게). 로그를 못 가져오면 그 사유를
   기록하되 결과를 `FAIL`에서 `SKIPPED`로 바꾸지 않는다 — 로그는 증거이지 전제조건이 아니다.
3. **리포트는 공유 아티팩트다.** 레포 경로/CI 아티팩트에 남으므로 **PII는 기록 시점에
   마스킹**한다(본문·JSON·raw·로그 전부). 디버깅용 비마스킹 본문을 디스크에 남기지 않는다.
   → KB `pii-masking-and-evidence`.

---

## 6. 빌드시스템·플랫폼은 자동감지로 일반화한다

GitLab CI / Spring Boot Actuator / NestJS docs + STANDARD §3.

1. 빌드/기동/테스트 진입점은 **특정 도구에 하드코딩하지 않고 빌드시스템을 자동감지**한다
   (gradle/maven/npm/pnpm/yarn 등). Gradle은 그 후보 중 하나의 예시일 뿐이다.
2. CI에서는 **헬스체크(readiness) 통과 후에만 E2E를 실행**하고, 산출물(JSON/MD/raw/로그)을
   CI 아티팩트로 보존하며, **exit code 규약**으로 결과를 파이프라인에 전달한다. → KB
   `ci-integration`.
3. git 플랫폼은 GitLab(`glab`)을 기본으로 하되 인스턴스/사용자는 하드코딩하지 않고 인증
   컨텍스트를 따른다.

---

## 7. 플레이키는 격리(quarantine)하고 원인을 추적한다

Google "Flaky Tests".

1. **플레이키 테스트는 신뢰를 좀먹는다.** 한 번 "가끔 실패해도 그냥 다시 돌리면 됨"이 되면,
   진짜 실패도 무시하게 된다("늑대가 나타났다" 효과).
2. 러너는 재시도로 플레이키를 가리지 않으므로(원칙 2), 플레이키는 **드러난다.** 드러난
   플레이키는 카탈로그 차원에서 **격리(quarantine)** 하고 원인(타이밍/순서/공유상태/네트워크)을
   추적해 고친다 — 러너는 이를 자동으로 하지 않고 사실만 보고한다. → KB `flaky-tests`.
