# 테스트 작성 핵심 원칙 (Principles)

> 이 문서는 테스트 분야의 표준·명저·공식 문서에서 추출한 공통 원리를, **각 도구의 공식
> 문서(Kotest / JUnit5 / MockK / Kover)와 권위 있는 1차 출처**로 검증·보정한 실무 원칙
> 모음이다. `skills/test-authoring`의 규범 규칙(`TST-n`)이 "무엇을 강제하는가"라면, 이
> 문서는 "왜 그렇게 강제하는가"에 대한 판단 기준, 즉 **헌법** 역할을 한다.
> 규칙의 정확한 문구와 번호는 오직 `SKILL.md`의 authoritative rules 표에서 정의한다. 이 문서는
> 번호를 재정의하지 않고 설계 근거만 설명한다.
>
> **출처(Sources)**
> - Martin Fowler, *TestPyramid* — https://martinfowler.com/bliki/TestPyramid.html
> - Martin Fowler, *UnitTest* / *IntegrationTest* — https://martinfowler.com/bliki/UnitTest.html
> - Martin Fowler, *Mocks Aren't Stubs* — https://martinfowler.com/articles/mocksArentStubs.html
> - Gerard Meszaros, *xUnit Test Patterns*(2007) — Test Double 분류, Four-Phase Test
> - Kent Beck, *Test-Driven Development: By Example*(2002) — RED→GREEN→REFACTOR
> - Google Testing Blog, *Just Say No to More End-to-End Tests* / *Flaky Tests* —
>   https://testing.googleblog.com/
> - Kotest 공식 문서 — https://kotest.io/docs/
> - JUnit5 User Guide — https://junit.org/junit5/docs/current/user-guide/
> - MockK 공식 문서 — https://mockk.io/
> - Kotlinx Kover 공식 문서 — https://kotlin.github.io/kotlinx-kover/
> - OpenAI, *Harness engineering* / *How we monitor internal coding agents for misalignment* —
>   https://openai.com/index/harness-engineering/ ·
>   https://openai.com/index/how-we-monitor-internal-coding-agents-misalignment/
>
> 충돌 시 **KB(공식 문서)가 이 원칙(책/권위서)보다 우선**한다. 이 문서는 통찰을 보탠다.

---

## 0. 대전제: "읽기 쉽게, 검증은 완전하게" (simple to read, complete in verification)

> `SKILL.md`의 지도 원칙: *"Simplicity comes from shared setup and structure; completeness
> comes from assertions. They never trade off against each other."*

- 테스트의 **단순함**은 저장소가 제공하는 공유 셋업과 명확한 AAA/BDD 구조에서 온다. 로컬에
  `test-support` 기반 클래스가 있을 때만 재사용한다. 검증을 줄여서 얻는 단순함은 가짜 단순함이다.
- 테스트의 **완전함**은 어서션의 충분함에서 온다. "에러가 안 났다"는 테스트가 아니다(`TST-6`).
- 둘은 트레이드오프가 아니다. 읽기 쉬우면서 동시에 완전하게 검증하는 것이 목표다.

---

## 1. 테스트 피라미드 (어디에 투자할 것인가)

Fowler *TestPyramid* + Google Testing Blog.

1. **피라미드는 비율의 법칙이다.** 빠르고 격리된 **단위 테스트를 가장 많이**, 통합을 그 다음,
   느리고 깨지기 쉬운 **E2E를 가장 적게** 둔다. Google의 경험칙은 70/20/10이다(절대값이 아니라
   "위로 갈수록 적게"라는 형태가 핵심).
2. **상위 계층은 비싸다.** 위로 갈수록 (a) 실행이 느리고 (b) 깨졌을 때 원인 지목이 어렵고
   (c) 플레이키해진다. 같은 버그를 잡을 수 있다면 **가능한 가장 낮은 계층에서** 잡아라.
3. **아이스크림 콘(역피라미드)은 안티패턴이다.** 수동 테스트와 E2E가 비대하고 단위가 빈약하면
   피드백이 느리고 유지보수가 폭증한다.
4. **계층 이름보다 두 가지 질문이 중요하다(Fowler):** 이 테스트는 **얼마나 빠른가**, 그리고
   실패 시 **얼마나 좁게 원인을 짚어주는가**. 이것이 계층 배치의 진짜 기준이다.

프레임워크와 계층을 고르기 전에 빌드 설정과 가까운 테스트를 제한적으로 확인한다(`TST-1`).
그 증거 안에서 같은 동작을 증명할 수 있는 가장 가벼운 계층을 선택한다(`TST-2`).

---

## 2. 무엇을 단위/통합/E2E로 볼 것인가 (경계의 모호함)

Fowler *UnitTest* / *IntegrationTest*.

1. **"단위"의 정의는 합의되어 있지 않다.** 핵심은 단위의 크기가 아니라 **격리(solitary) vs
   협력(sociable)** 관점이다. 어느 쪽이든 "빠르게, 한 동작을, 결정적으로" 검증하면 단위 테스트다.
2. **"통합 테스트"는 모호한 용어다(Fowler).** narrow integration(한 외부 의존성과의 경계만
   검증)과 broad integration(여러 서비스가 다 떠야 하는 검증)을 **반드시 구분**하라. 후자는
   사실상 E2E에 가깝고 비용이 다르다.
3. **도구가 아니라 의도로 분류하라.** Spring slice(`@WebMvcTest`, `@DataJpaTest`)를 쓴다고
   자동으로 "통합"이 아니다. **무엇을 격리하고 무엇을 실제로 띄웠는가**가 분류 기준이다
   (`SKILL.md`의 base class 선택 원칙과 일치).
4. **가장 가벼운 도구를 골라라(`TST-2`).** DB가 필요 없으면 `AbstractDataBaseTest`를, 웹이
   필요 없으면 `AbstractWebMvcTest`를 쓰지 않는다. 무거운 base는 느리고 깨지기 쉽다.
5. **mock 단위 테스트보다 실제 조합을 먼저 검토한다.** 결정적인 mapper·policy·assembler·service를
   전부 mock으로 분리하면 각 테스트가 초록이어도 조립 오류를 놓친다. 실제 in-process 협력자를 함께 쓰고,
   Redis·DB·HTTP·Kafka·OpenSearch 같은 terminal I/O 경계만 격리하는 좁은 통합을 기본 후보로 둔다.
6. **어댑터 계약은 SDK mock만으로 증명되지 않는다.** serializer, mapping, TTL, transaction, binding,
   alias/query semantics처럼 외부 시스템이 해석하는 계약은 격리된 실제 경계 테스트가 최소 하나 필요하다.

---

## 3. 구조와 명명: 테스트는 살아있는 명세다

AAA(Arrange-Act-Assert) / BDD Given-When-Then / Meszaros *Four-Phase Test*.

1. **테스트는 위에서 아래로 한 편의 시나리오처럼 읽혀야 한다(`TST-5`).** 어떤 어서션이
   실행될지 분기/반복으로 결정하지 마라. 테스트 안의 로직은 그 자체가 검증되지 않은 코드다.
2. **한 리프(leaf)에 한 시나리오(`TST-4`).** 서로 다른 동작에 대한 무관한 어서션을 한
   `Then`에 모으지 말고 `Given`/`When` 분기를 나눠라.
3. **이름은 동작을 서술한다(`TST-3`).** 저장소가 `{UnitUnderTest}Test`, `sut`, `actualResult`를
   사용한다면 그대로 유지한다. 어떤 형식이든 "무엇을 테스트하는지"가 아니라 "어떤 조건에서
   무슨 동작을 보장하는지"가 드러나야 한다.
4. **AAA의 세 국면을 시각적으로 분리하라.** Arrange(준비)·Act(실행)·Assert(검증)가 한 덩어리로
   엉키면 무엇이 입력이고 무엇이 기대인지 흐려진다.
5. **리팩터링 내성은 변경 증폭으로 확인한다.** 공개 동작이 같은 내부 class/method 재배치가 여러 spec의
   private helper, fake, `verify` 수정을 요구한다면 테스트가 계약이 아니라 topology에 결합된 것이다.
   결과·durable state·실제 경계 계약 쪽으로 assertion을 옮긴다.
6. **private helper와 fake도 production code와 같은 유지비가 든다.** production interface를 spec마다
   재구현하지 않는다. 실제 객체나 기존 fixture가 더 작은지 먼저 보고, 안정적인 consumer contract가 여러
   테스트에서 재사용될 때만 shared fake를 둔다.

---

## 4. 검증의 완전성: 반환 + 상태 + 상호작용

`SKILL.md` `TST-6`~`TST-9` + Fowler *Mocks Aren't Stubs*(state vs behavior verification).

1. **관측 가능한 결과를 단언하라(`TST-6`).** 예외가 안 났다는 것은 검증이 아니다. 반환값,
   결과 상태, 발행된 상호작용 중 **계약(contract)에 해당하는 것**을 단언한다.
2. **세 가지를 함께 본다(`TST-7`):** ① 반환값(return) ② 결과 상태(state) ③ 상호작용
   (interaction — 협력자가 기대한 횟수/인자로 호출되었는가). 적용 가능한 것을 빠짐없이.
3. **경계·실패·부분실패를 각각의 `Given`으로 덮어라(`TST-8`).** 해피 패스만 검증한 테스트는
   "통과"가 안전을 뜻하지 않는다.
4. **공개 표면으로만 단언하라(`TST-9`).** 리플렉션으로 private 필드를 들여다보는 검증은
   리팩터링에 부서지고 캡슐화를 깬다. 반환·관측 가능한 상태·발행된 상호작용으로 확인한다.

---

## 5. 테스트 더블: 도구가 아니라 의도로 선택한다

Meszaros 5분류 + Fowler *Mocks Aren't Stubs* + MockK.

1. **다섯 가지를 구분하라(Meszaros):** Dummy(자리만), Stub(정해진 응답), Spy(호출 기록),
   Mock(기대를 미리 설정·검증), Fake(동작하는 경량 구현). 이름이 아니라 **역할**로 고른다.
2. **상태 검증 vs 행위 검증(Fowler).** classicist는 실제 객체 + 상태 검증을 선호하고,
   mockist는 mock + 행위 검증을 선호한다. 둘 다 정당하나, **상호작용 자체가 계약일 때만**
   행위 검증을 쓴다.
3. **Fake는 유지비를 줄일 때만 쓴다(`TST-13`).** 실제 객체보다 setup이 작고 하나의 안정적인
   consumer-owned contract를 모델링할 때만 선택한다. production interface를 복제하는 one-off private
   class나 실제 adapter의 retry·TTL·serialization을 재구현하는 fake는 리팩터링 내성을 떨어뜨린다.
4. **과도한 모킹은 금지(`TST-14`).** 값 객체/데이터 클래스를 모킹하지 말고, 우연한
   (incidental) 상호작용을 단언하지 마라. mock이 많을수록 테스트는 구현에 결합되어 깨지기 쉽다.
5. **strict가 기본이다.** suite-wide `relaxed`/`relaxUnitFun`은 새 부수효과를 조용히 허용한다.
   필요한 테스트의 한 협력자에만 명시적으로 완화하고, 계약 인자는 `any()` 대신 정확히 단언한다.
6. **mutation-survival 질문을 한다.** 사이트·ID·scope·payload를 잘못 전달하거나 필수 호출을 하나 더
   추가한 구현이 이 테스트를 통과하는지 점검한다. 통과한다면 assertion이 계약을 잠그지 못한 것이다.

---

## 6. 결정성: 타협 불가 영역

`SKILL.md` `TST-10`~`TST-12` + Google Testing Blog *Flaky Tests*.

1. **결정적이지 않은 테스트는 테스트가 아니다.** 같은 코드에 대해 통과/실패가 갈리는
   플레이키 테스트는 신뢰를 무너뜨리고, 결국 "어차피 가끔 깨지는 것"으로 무시된다.
2. **비결정성의 원천을 주입으로 차단하라(`TST-10`).** 실제 `Thread.sleep`, 벽시계 시간,
   실제 네트워크/클록 금지. Clock·Random을 주입하고 **시드를 명시적으로 고정**한다.
3. **확률적 로직은 분포를 단언한다(`TST-11`).** 한 번 샘플링한 값이 아니라 시드를 고정해
   다수 반복의 통계적 성질을 단언한다.
4. **격리는 필수(`TST-12`).** 테스트는 실행 순서나 공유 가변 상태에 의존하면 안 된다. 케이스마다
   고유 데이터를 생성하고, DB 테스트는 고유 키로 자기 행을 만든다.
5. **공유 인프라 전체를 정리하지 않는다.** shared Redis의 `FLUSHDB`, shared schema의 무제한
   `TRUNCATE`, bucket/topic 전체 삭제는 테스트 격리가 아니라 다른 실행을 파괴하는 동작이다. disposable
   resource나 per-test namespace를 쓰고 자신이 만든 데이터만 지운다.

---

## 7. 커버리지: 지표는 목표가 아니라 신호다

Kover + 일반 커버리지 이론(line/branch/mutation).

1. **커버리지는 "실행된 코드"이지 "검증된 코드"가 아니다.** 어서션 없이 호출만 해도 라인
   커버리지는 오른다. 높은 커버리지가 품질을 보장하지 않는다.
2. **굿하트의 법칙을 경계하라.** 커버리지 숫자가 목표가 되면 의미 없는 테스트가 양산된다.
   숫자는 **테스트되지 않은 위험 영역을 찾는 신호**로 쓴다.
3. **라인보다 브랜치, 브랜치보다 뮤테이션이 강한 신호다.** 분기·예외·경계가 실제로 검증되는지는
   라인 커버리지로 드러나지 않는다.
4. **빌드 게이트는 빌드시스템을 자동 감지해 건다.** Kotlin에서는 Kover가 표준 커버리지 도구지만,
   임계치 게이트 자체는 특정 빌드도구에 묶지 말고 감지된 빌드시스템(gradle/maven 등)에 맞춰
   일반적으로 적용한다.

---

## 8. TDD: 테스트가 설계를 이끈다

Kent Beck *TDD By Example*.

1. **RED → GREEN → REFACTOR.** 실패하는 테스트를 먼저 쓰고(RED), 통과시킬 최소 구현을
   하고(GREEN), 그 다음 정리한다(REFACTOR). 테스트가 통과한 뒤에만 안전하게 리팩터링한다.
2. **테스트하기 어렵다는 것은 설계 냄새다.** 모킹이 과하게 필요하거나 셋업이 비대하면 대상의
   결합도가 높다는 신호다. 테스트가 어려우면 설계를 의심하라.
3. **죽은 테스트를 남기지 마라(`TST-17`).** `xtest`·주석 처리·무단 비활성화 금지. 건너뛰는
   테스트는 명시적 애너테이션과 분명한 사유를 동반한다.

---

## 9. 영속성 및 실행 증거

1. **ORM 계약은 실제 왕복으로 증명한다(`TST-15`).** 적용 가능한 DB slice에서 repository로
   저장하고 영속성 컨텍스트를 비운 뒤 다시 읽어야 mapping 결과를 검증한 것이다. 세부 계약은
   `SKILL.md`의 `PST-1`~`PST-6`을 따른다.
2. **작성 완료와 검증 완료를 구분한다(`TST-16`).** 변경 동작과 테스트를 연결하고, 실제 명령·종료
   코드·실행 수를 남긴다. 선택된 테스트가 실행되지 않았다면 성공이 아니라 `NOT_RUN`이다.
3. **배포 신뢰는 증거 사슬에서 온다.** 순수 규칙은 공개 결과, component 조합은 실제 deterministic
   collaborator, 외부 adapter는 actual-boundary round trip, 희귀 실패는 focused failure injection으로
   증명한다. 테스트 수나 coverage만으로 이 빈칸을 메웠다고 간주하지 않는다.

---

## 10. Agentic coding: 초록 신호 자체를 검증한다

1. **agent는 구현과 oracle을 동시에 바꿀 수 있다.** 따라서 test, fixture, snapshot, coverage, CI diff는
   production diff와 분리해 감사한다. 통과를 위해 신호를 약화하는 변경은 reward hacking과 결과가 같다.
2. **테스트가 결함에서 실패하는 모습을 본다.** RED-before-GREEN 또는 임시 controlled mutation/revert로
   selected test가 plausible fault를 실제로 거부하는지 확인한다(`TST-20`).
3. **같은 가정을 반복한 테스트 수는 신뢰도를 늘리지 않는다.** mock unit test와 별개로 actual boundary,
   real composition, independent reviewer case처럼 failure surface가 다른 증거를 연결한다.
4. **검증은 변경 영향 범위까지 단계적으로 넓힌다.** selected case만 통과한 결과를 module·boundary·required
   checks의 성공으로 일반화하지 않는다. 실행하지 않은 rung은 `NOT_RUN`으로 남긴다.
5. **테스트 안전망도 repository harness다.** agent가 직접 실행하고 결과를 해석할 수 있도록 명령이
   결정적이고 환경이 hermetic해야 하며, 실패 메시지는 어떤 계약이 깨졌는지 좁게 보여야 한다.
