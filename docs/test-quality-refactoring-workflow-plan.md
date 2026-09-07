# 테스트 품질 리뷰·리팩터링 워크플로우 구현 계획

상태: **Proposed**
기준 브랜치: `main` / `9c051a1`
작업 브랜치: `feat/test-quality-refactoring-workflow`

## 1. 결론

새 에이전트나 mutation dependency를 먼저 추가하지 않는다. 기존 `test-authoring`의 `TST-1`~`TST-20`,
특히 oracle integrity, refactoring resistance, controlled mutation, fresh execution 규칙을 단일 출처로
유지하고 다음 세 스킬을 추가한다.

| 자산 | 책임 | 변경 권한 |
| --- | --- | --- |
| `test-quality-review` | 현재 테스트가 실제 결함을 탐지하는지 근거 기반으로 감사하고 개선 finding을 만든다. | read-only |
| `test-refactoring` | 선택된 finding만 대상으로 테스트의 탐지력을 보존하거나 강화하는 작은 리팩터링을 수행한다. | test/fixture only |
| `test-quality-refactoring-workflow` | 범위 고정, baseline, 리뷰, 리팩터링, negative proof, 재실행과 최종 판정을 한 owner 아래 조정한다. | 단계별 위임 |

기존 `test-authoring`은 새 동작을 검증할 테스트가 빠진 경우의 작성 규칙, `test-runner`는 독립 실행 증거
수집에 재사용한다. `qa-test-designer`는 요구에서 새 시나리오를 설계해야 할 때만 명시적으로 handoff하며
mandatory dependency로 만들지 않는다. E2E 또는 live-service 검증이 필요하면 기존 `e2e-test-workflow`로
넘기고 이번 workflow에서 실행했다고 주장하지 않는다.

## 2. 현재 기준선과 빈 영역

이미 있는 기반:

- `skills/test-authoring/SKILL.md`: bounded discovery와 테스트 품질 규칙 `TST-1`~`TST-20`.
- `skills/test-authoring/reference/kb/refactoring-resistant-tests.md`: 변경 증폭, 구현 결합, fake/helper 개선 기준.
- `skills/test-authoring/reference/kb/agentic-coding-safety-net.md`: oracle 약화 분류, RED/controlled mutation,
  selected → module → boundary → repository checks 검증 사다리.
- `agents/test-runner.md`: Gradle, Maven, Node, Python, Go, Rust, .NET의 repository-native 명령 선택,
  zero-test/stale evidence false-green 방지, 실행 결과 추적성.
- `agents/backend-test-author.md`: production 변경을 금지한 scenario-first 테스트 작성.
- `skills/e2e-test-workflow/SKILL.md`: exact dependency, phase status, 증거 보존, false-green-safe 집계 패턴.

현재 빠진 것은 다음을 끝까지 소유하는 단일 경로다.

```text
기존 테스트 감사
  -> 결함 가설과 개선 finding
  -> baseline 고정
  -> test-only 리팩터링
  -> 같은 결함을 여전히 탐지하는지 negative proof
  -> 영향 범위 재검증
  -> 과장 없는 최종 판정
```

## 3. 목표와 비목표

### 목표

1. 테스트마다 보호하려는 observable contract와 거부해야 할 plausible fault를 연결한다.
2. 단순 실행/line coverage가 아니라 assertion oracle, 실패·경계, 실제 boundary, 결정성, 격리성,
   리팩터링 내성을 함께 평가한다.
3. 테스트 리팩터링 전후에 탐지력이 같거나 강해졌음을 기계 검증 가능한 증거로 남긴다.
4. production과 test expectation을 같이 바꿔 생기는 false green을 차단한다.
5. 실행하지 못한 검증은 `NOT_RUN`, 일부만 실행한 결과는 `PARTIAL`로 정직하게 보고한다.

### 비목표

- production code, build/dependency, migration, application config, CI, coverage threshold 수정.
- 새 test framework, assertion library, coverage 또는 mutation dependency 추가.
- coverage 숫자를 올리기 위한 무의미한 테스트 추가.
- snapshot/golden 일괄 재생성, matcher 완화, assertion 삭제, skip/quarantine 남발.
- E2E, browser, shared/live infrastructure 실행.
- 한 번에 전체 테스트 디렉터리를 스타일 통일하는 대규모 rewrite.

## 4. 지원 범위

### v1

- 품질 리뷰: `test-runner`가 식별할 수 있는 Gradle/Maven/Node/Python/Go/Rust/.NET 저장소에서
  framework-neutral 감사가 가능하다.
- 자동 리팩터링: 기존 `test-authoring`이 완전한 규칙을 제공하는 Kotlin/JUnit Jupiter/Kotest의 unit 및
  narrow integration 테스트부터 지원한다.
- 다른 스택은 `AUDIT_ONLY`로 finding과 수동 개선안을 제공하고 테스트를 자동 수정하지 않는다.
- mutation proof는 저장소에 이미 설정된 도구를 우선하며, 없으면 안전 조건을 충족할 때만 한 개의
  controlled mutation을 사용한다.

### 후속 확장

실제 eval이 확보된 순서대로 Node, Python, Go, Rust, .NET authoring/refactoring profile을 추가한다.
언어별 profile 없이 범용 규칙만으로 코드를 자동 변환하지 않는다.

## 5. 자산별 설계

### 5.1 `test-quality-review`

경로:

- `skills/test-quality-review/SKILL.md`
- `skills/test-quality-review/scripts/validate-review-report.js`
- `skills/test-quality-review/tests/contract.test.sh`
- `skills/test-quality-review/tests/fixtures/{valid,invalid}/**`
- 선택: `skills/test-quality-review/agents/openai.yaml`

동작:

1. repository root, revision, 파일/모듈/test symbol 범위를 고정한다.
2. build/test config와 최대 8개의 인접 테스트를 읽어 framework, fixture, runner, report 경로를 기록한다.
3. production public contract, callers, 기존 요구/incident/QA case에서 oracle을 독립적으로 도출한다.
4. 아래 차원을 감사한다.

| 차원 | 핵심 질문 |
| --- | --- |
| contract traceability | 어떤 요구/위험/행동을 어느 test symbol이 보호하는가? |
| oracle strength | 구현에서 복사하지 않은 정확한 기대값과 의미 있는 assertion이 있는가? |
| fault detectability | plausible fault를 넣으면 선택 테스트가 실패하는가? |
| boundary fidelity | serializer, persistence, protocol, wiring 위험을 실제 경계에서 검증하는가? |
| failure/boundary coverage | happy path 외에 경계, 실패, 부분 실패가 분리되어 있는가? |
| determinism/isolation | 시간, 랜덤, sleep, 공유 상태, 실행 순서, cleanup 의존이 통제되는가? |
| environment ownership | `FLUSHDB`, truncate/drop, broad cleanup처럼 외부 상태를 파괴할 수 있는 setup이 disposable endpoint·namespace·병렬 실행 정책으로 격리됐는가? |
| refactor resistance | private topology, 과도한 interaction, one-off fake에 결합되어 있지 않은가? |
| execution integrity | selected test가 fresh report에서 1개 이상 실제 실행됐는가? |

출력은 `vulpora.test-quality-review/v1` JSON으로 고정한다. 최소 필드:

```text
scope/revision/framework/baseline
behavior_inventory[]
findings[] {
  id, severity, confidence, rule_ids, path, line,
  observable_contract, plausible_fault, evidence, recommendation
}
coverage_gaps[]
execution_evidence[]
verdict
```

`PASS`는 finding이 없다는 뜻이 아니라, 요청 범위의 필수 contract가 추적되고 fresh execution과 negative
proof가 충분하다는 뜻으로 제한한다. 실행이 없으면 `REVIEWED_WITHOUT_EXECUTION` 또는 `INCONCLUSIVE`이지
`PASS`가 아니다.

### 5.2 `test-refactoring`

경로:

- `skills/test-refactoring/SKILL.md`
- `skills/test-refactoring/scripts/validate-refactoring-report.js`
- `skills/test-refactoring/tests/contract.test.sh`
- `skills/test-refactoring/tests/fixtures/{valid,invalid}/**`
- 선택: `skills/test-refactoring/agents/openai.yaml`

입력은 검증된 review report와 사용자가 요청했거나 workflow가 선택한 finding ID 목록이다. 임의로 범위를
확장하지 않는다.

write allowlist:

- 기존 test source root: `src/test/**`, `test/**`, `tests/**`, `__tests__/**`.
- test 전용 fixture/resource root.
- 요청된 test-quality report 경로.

금지 경로:

- production source, build/dependency, migration, runtime config, CI, shared/live infrastructure.

허용하는 대표 리팩터링:

- vacuous assertion을 observable outcome assertion으로 교체.
- implementation-copied expected value를 독립 계산/명시 사례로 교체.
- private method/field와 내부 call order assertion을 public result 또는 durable state로 이동.
- reflection으로 private field를 읽는 test는 test-owned fake/spy의 명시적 관찰값 또는 public result로 이동.
- relaxed mock, `any()` 남용, incidental interaction 검증을 contract-bearing assertion으로 축소.
- one-off fake 또는 중복 fixture를 실제 deterministic collaborator/기존 fixture로 교체.
- real sleep, wall clock, random, shared mutable data를 기존 repository test utility로 제어.
- 한 test의 복수 독립 행동을 진단 가능한 leaf case로 분리.

수행 규칙:

1. baseline을 먼저 실행하고 결과/해시를 기록한다.
2. 한 번에 하나의 smell/finding만 수정한다.
3. 모든 test-side diff를 `new-behavior-proof`, `intentional-contract-update`,
   `strength-preserving-maintenance` 중 하나로 분류한다.
4. `weakening`은 자동 적용하지 않고 `BLOCKED`로 반환한다.
5. 같은 plausible fault가 변경 전후 모두 잡히거나, 변경 후 더 강한 독립 증거가 있어야 완료한다.
6. 새 dependency가 필요하거나 지원 profile이 없으면 코드를 쓰지 않고 `AUDIT_ONLY`/`BLOCKED`로 끝낸다.

### 5.3 `test-quality-refactoring-workflow`

경로:

- `skills/test-quality-refactoring-workflow/SKILL.md`
- `skills/test-quality-refactoring-workflow/scripts/validate-workflow-report.js`
- `skills/test-quality-refactoring-workflow/tests/contract.test.sh`
- `skills/test-quality-refactoring-workflow/tests/fixtures/{valid,invalid}/**`
- `skills/test-quality-refactoring-workflow/agents/openai.yaml`

exact dependencies:

- `test-quality-review`
- `test-refactoring`
- `test-authoring`
- `agent:test-runner`

manifest dependency closure도 독립 설치를 보장하도록 다음처럼 선언한다.

| 설치 자산 | 직접 dependency |
| --- | --- |
| `test-quality-review` | `test-authoring` |
| `test-refactoring` | `test-authoring` |
| `test-quality-refactoring-workflow` | `test-quality-review`, `test-refactoring`, `agent:test-runner` |

workflow가 `test-authoring`을 다시 직접 나열하는 것은 허용하되 필수는 아니다. 재귀 closure로 같은 release의
`TST-*` 정의가 항상 함께 설치되어야 한다.

workflow:

```text
1. preflight/freeze
2. baseline execution
3. test-quality-review
4. finding classification and edit gate
5. test-authoring for missing behavior OR test-refactoring for existing-test smells
6. negative proof and exact restoration
7. selected -> module -> boundary -> repository-required verification
8. post-review and before/after reconciliation
9. consolidated verdict
```

세부 규칙:

- 하나의 workflow owner가 revision, 범위, report, 최종 판정을 소유한다.
- preflight는 `vulpora.test-quality-workspace-baseline/v1`을 만든다. 이 artifact는 `HEAD`와 index tree,
  staged/unstaged patch hash, rename·delete·file-mode·submodule 변화, 추적되지 않은 파일의 path/byte-hash/mode,
  그리고 실행 전 test-result/report artifact의 path/byte-hash/mtime를 분리해 기록한다.
- workflow는 먼저 `workflow_write_scope[]`를 finding ID와 실제 test/fixture path 단위로 고정한다. baseline에서
  staged·unstaged·untracked user change가 있는 test/fixture path는 read-only audit만 허용하고 자동 edit은
  `BLOCKED: USER_CHANGE_OVERLAP`으로 끝낸다. three-way merge, hunk preservation, stash, reset은 시도하지 않는다.
- postflight validator는 baseline의 user-owned entries가 path, byte hash, mode, rename/delete 상태까지 동일한지,
  workflow-owned path만 allowlist 안에 있는지, production/build/dependency/CI path가 추가되지 않았는지를 각각
  검사한다. binary 또는 submodule entry를 추측해 text diff로 정규화하지 않는다.
- read-only 감사는 모듈별 독립 범위일 때만 병렬화할 수 있다. 겹치는 test/fixture write는 한 owner가 순차 실행한다.
- missing behavior는 `test-authoring`, 이미 있는 테스트의 구조/내성 문제는 `test-refactoring`으로 분리한다.
- 요구가 불명확해 oracle을 독립적으로 만들 수 없으면 테스트가 현재 구현을 승인하도록 추측하지 않는다.
- controlled mutation은 겹치는 사용자 변경이 없는 production 파일에만 적용한다. 원본 byte hash와 diff를
  기록하고 `finally` 경로에서 정확히 복구한 뒤 hash/diff 동일성을 재검증한다. 복구 증거가 없으면 즉시
  `BLOCKED`이며 추가 mutation을 하지 않는다.
- 기존 mutation 도구가 설정되어 있으면 focused target으로 사용한다. 이 workflow를 위해 도구를 설치하지 않는다.
- mutation 도구가 없는 repository에서는 `mutation_unavailable`을 capability 상태로 기록한다. shared 또는 dirty
  production source에는 controlled mutation을 적용하지 않고, 격리된 fixture replica에서 killable mutant를
  실행하거나 `NOT_RUN`으로 남긴다.
- workflow report는 `mutation_capability`을 반드시 기록한다: `configured`, `controlled_allowed`, `replica_only`,
  `unavailable`, `safety_blocked` 중 하나와 tool/target/authority/restoration evidence를 함께 둔다.
- `test-runner`가 fresh report, executed count, exit code를 독립적으로 확인한다.
- filter 기반 실행은 명령 성공만으로 selected-only라고 선언하지 않는다. 시작 시각, filter, fresh XML의
  testcase/class 목록을 비교한다. preflight에서 request→resolved test symbol→expected XML glob을 고정하고,
  post-run에는 fresh XML의 mtime/hash와 requested testcase 존재를 확인한다. expected symbol이 없거나 report가
  시작 시각보다 오래되면 `NOT_RUN`; 예상 밖 spec이 실행되면 selected case는 `PASS`로 보존하되 run scope는
  `AFFECTED_MODULE`로 승격해 보고한다.
- audit-only 요청은 3단계에서 끝나며 파일을 수정하지 않는다.

최종 판정 우선순위:

```text
BLOCKED > INCONCLUSIVE > PARTIAL > PASS
```

`PASS` 조건은 다음을 모두 만족해야 한다.

- 모든 선택 finding이 해결되었거나 근거 있는 `NOT_APPLICABLE`이다.
- workflow가 만든 production/build/dependency/CI 변경이 0이고, 시작 시 존재한 사용자 diff는
  baseline snapshot과 동일하게 보존된다.
- test-side diff에 unexplained weakening이 없다.
- selected test가 plausible fault를 거부하고 복구 후 green이다.
- 적용 가능한 검증 사다리가 fresh execution으로 통과했다.
- post-review에서 동일하거나 더 높은 severity의 새 finding이 생기지 않았다.

## 6. Eval-first 구현 순서

### Phase 0 — 실패 fixture와 계약부터 고정

1. `evals/behavioral/fixtures/repos/sample-test-quality/`를 만든다.
2. 최소 fixture:
   - `assertTrue(true)`/실행 성공만 확인하는 vacuous test.
   - production helper로 expected 값을 계산한 self-confirming oracle.
   - relaxed mock + wildcard matcher + private call order에 결합된 brittle test.
   - real sleep/clock/random/shared state를 쓰는 flaky test.
   - 실제 public outcome과 경계/실패를 잘 검증하는 strong test(no-churn 대조군).
3. review/refactoring/workflow별 positive, negative, adversarial behavioral case를 최소 1개씩 작성한다.
4. validator negative fixture는 missing oracle, missing line evidence, zero executed, stale report, mutation survivor,
   restoration proof 누락, production path 변경, assertion 삭제, matcher 완화, skip/threshold 하향을 포함한다.
5. dirty-worktree adversarial fixture는 staged·unstaged·untracked·rename·binary·file-mode·submodule 변화와
   user-modified test/fixture overlap을 포함한다. validator는 user entry의 byte/mode 보존과
   `USER_CHANGE_OVERLAP` fail-closed 동작을 검증한다.

### Phase 1 — 범용 read-only 리뷰

1. `test-quality-review`의 scope/discovery/report contract를 작성한다.
2. `TST-6`~`TST-20`을 재정의하지 않고 exact ID로 참조한다.
3. report validator를 Node built-in만으로 구현한다.
4. structural contract와 behavioral dry validation을 통과시킨다.

### Phase 2 — Kotlin/JVM test-only 리팩터링

1. `test-refactoring`의 allowlist/forbidden path를 고정한다.
2. Kotlin/JUnit/Kotest profile은 기존 `test-authoring`의 discovery와 idiom KB를 재사용한다.
3. baseline-first, one-finding-at-a-time, TST-19 diff classification, TST-20 proof를 구현한다.
4. strong test가 불필요하게 바뀌지 않는 no-churn case를 필수로 둔다.

### Sample content feed 보정 corpus

v1의 Kotlin/JVM profile은 synthetic fixture만으로 승인하지 않는다. source 수정·integration 실행 없이 읽는
version-pinned corpus manifest를 추가하고, 표본 repository의 revision·경로·line·예상 판정을 기록한다.

| 표본 신호 | 기대 판정 | workflow가 배워야 할 규칙 |
| --- | --- | --- |
| `FeedSessionServiceTest`의 private field reflection | `REFACTOR` | private field rename으로 깨지는 테스트는 observable fake/state 또는 public contract로 옮긴다. |
| `StochasticSamplerTest`의 all-zero fallback | `REFACTOR` | 입력 포함 여부뿐 아니라 결과 원소 distinctness를 단언해 duplicate mutant를 죽인다. |
| Redis integration test의 `FLUSHDB` | `BLOCKED` / `NOT_RUN` | disposable endpoint·namespace·ownership 증거 없이 broad cleanup을 실행하거나 자동 수정하지 않는다. |
| `FeedQueryControllerTest`의 HTTP response + captured request assertion | `NO_CHURN` | public boundary mapping·side-effect absence를 보호하는 interaction assertion은 topology coupling으로 오분류하지 않는다. |

corpus replay는 source를 수정하거나 실제 `sample-content-feed` integration test를 실행하지 않는다. 각 항목은 static
classification과 repository 밖 격리 fixture replica의 controlled mutation으로만 재현한다.

### Phase 3 — 통합 workflow

1. exact dependency와 phase state를 정의한다.
2. audit-only, refactor, missing-test-authoring 세 경로를 분리한다.
3. mutation restoration과 verification ladder를 하나의 report로 묶는다.
4. child/component의 원본 evidence와 dissent를 보존하고 primary가 location/command를 재확인한다.

### Phase 4 — 배포·라우팅·문서

1. `install/manifest.txt`에 세 skill과 typed dependency closure를 등록한다.
2. `install/skill-catalog.txt`에 한글 이름과 trigger 설명을 추가한다.
3. `vulpora-init`의 Kotlin test routing에 작성과 품질 리뷰/리팩터링 경로를 구분해 노출한다.
4. `README.md`, `CHANGELOG.md`, `VERSION`, `.claude-plugin/{plugin,marketplace}.json`의 inventory와 사용법을 갱신한다.
5. `install/check-npm-package.sh`와 package/distribution tests에 세 contract test와 inventory를 연결한다.

### Phase 5 — 언어 profile 확장

v1 behavioral 결과를 기준선으로 고정한 뒤 Node → Python → Go/Rust/.NET 순서는 실제 수요와 fixture 품질로
결정한다. 각 profile은 framework detection, idiom, fixture, mutation/coverage report parser, no-churn case를
갖추기 전까지 자동 edit을 활성화하지 않는다.

## 7. 수용 기준

### 기능

- vacuous test를 `PASS`로 평가하지 않고 observable contract 부재를 finding으로 만든다.
- self-confirming oracle, assertion 제거, matcher 확대, relaxed mock, skip, coverage threshold 하향을 약화로 잡는다.
- private topology/call-order 결합 테스트를 public result/durable state 중심으로 리팩터링한다.
- strong test에는 변경을 만들지 않는다.
- 같은 controlled mutant가 refactor 전후 모두 kill되며 복구 후 테스트가 green이다.
- mutation survivor, zero/stale/cache-only execution, 누락된 boundary rung을 `PASS`로 승격하지 않는다.
- workflow가 만든 production/build/dependency/CI 변경은 0이고, baseline 사용자 변경은 보존된다.

### 안전·이식성

- repository prompt나 fixture가 write scope, network, dependency 권한을 넓히지 못한다.
- shared/live service, user-owned Compose, credential을 사용하지 않는다.
- 지원하지 않는 framework는 추측해 수정하지 않고 `AUDIT_ONLY` 또는 `BLOCKED`를 반환한다.
- raw trace와 source 전문을 영구 저장하지 않고 요약·해시·line evidence만 남긴다.

### 배포

- manifest ↔ source ↔ skill catalog ↔ package inventory가 일치한다.
- Codex와 Claude Code의 설치 경로에서 세 skill과 recursive dependency가 발견된다.
- selective uninstall이 다른 사용자 자산을 제거하지 않는다.

## 8. 검증 명령

구현 중 좁은 검증부터 실행한다.

```bash
bash skills/test-quality-review/tests/contract.test.sh
bash skills/test-refactoring/tests/contract.test.sh
bash skills/test-quality-refactoring-workflow/tests/contract.test.sh
bash skills/test-authoring/tests/routing-contract.test.sh
bash evals/behavioral/run-behavioral-evals.sh --validate
bash evals/behavioral/run-changed.sh --validate origin/main
bash install/check-manifest.sh
bash install/test-qa-runner-contract.sh
bash install/test-claude-skill-port.sh
```

체크포인트 commit으로 worktree를 깨끗하게 만든 뒤 package gate를 실행한다. 현재
`install/check-npm-package.sh`는 미추적 파일까지 없는 clean tree를 요구하므로 기존 `.vulpora/`은 삭제하지
말고 격리 worktree 또는 CI에서 실행한다.

```bash
npm run check
npm test
```

실제 behavioral 평가는 runner adapter가 있을 때만 수행하며, adapter가 없으면 정적 validation과 실제 실행을
같은 PASS로 보고하지 않는다.

## 9. 구현 단위와 커밋 순서

1. **평가 기준을 먼저 잠그기** — fixture, behavioral case, invalid report fixtures.
2. **기존 테스트의 신뢰도를 독립적으로 판정하기** — `test-quality-review` + validator.
3. **탐지력을 잃지 않고 테스트를 개선하기** — `test-refactoring` + Kotlin profile.
4. **false green 없는 한 흐름 만들기** — workflow + independent runner reconciliation.
5. **설치된 사용자도 동일한 경로를 발견하게 하기** — manifest/catalog/init/package/docs/version.

각 커밋은 Lore protocol의 intent-first message와 `Constraint`, `Rejected`, `Confidence`, `Scope-risk`,
`Directive`, `Tested`, `Not-tested` 중 유의미한 trailer를 사용한다.

## 10. 주요 위험과 대응

| 위험 | 대응 |
| --- | --- |
| `test-authoring` 규칙 복제와 drift | `TST-*`는 기존 skill을 SSOT로 유지하고 새 skill은 exact ID만 참조한다. |
| review와 refactor의 자기확증 | immutable review artifact와 별도 `test-runner` evidence를 post-review에서 대조한다. |
| mutation 중 사용자 변경 손상 | clean/비중첩 경로, byte hash, exact restore, final diff gate가 없으면 실행하지 않는다. |
| coverage 수치가 품질 점수로 오용 | coverage는 미실행 경로 탐색 신호로만 쓰고 plausible-fault rejection을 별도 요구한다. |
| 범용화로 framework idiom 훼손 | v1 자동 edit은 Kotlin/JVM으로 제한하고 나머지는 audit-only로 둔다. |
| 불필요한 테스트 churn | strong-test no-churn behavioral case와 finding-ID write gate를 둔다. |
| package count/문서 drift | manifest/catalog/plugin/package count를 같은 커밋에서 갱신하고 package gate로 고정한다. |

## 11. 완료 정의

세 skill이 source와 설치 결과에서 발견되고, valid/invalid report validator와 behavioral case가 통과하며,
vacuous/brittle/flaky/self-confirming 테스트를 올바르게 구분한다. Kotlin/JVM fixture에서 선택된 finding만
test-only로 개선되고, controlled fault가 변경 전후 모두 탐지되며, workflow가 만든
production/build/dependency/CI diff는 0이고 baseline 사용자 diff가 보존되며,
selected/module/boundary/repository checks의 실행 여부가 과장 없이 보고되면 v1을 완료로 본다.
