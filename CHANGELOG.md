# Changelog

Vulpora의 사용자 관점 변경 사항을 기록합니다.

## Next release

- `harness-propose`가 Codex·Claude·공존 설치와 호스트 목록을 구분해 수집하고,
  기존 보고서가 없는 프로젝트에서도 독립 제안서를 작성하도록 보완했습니다.
  호스트 ID의 namespace를 보존하며 정책 파일을 임의로 생성하지 않습니다.
- 명시적 lightweight 프로필은 작업 lane 수와 관계없이 주 담당자만 실행하도록
  선택기를 수정했습니다. 자동 standard 위임과 고위험 audit 전환은 유지합니다.
- 세션 실행 기록 게시가 실패하면 실행 전임이 확인된 예약만 회수합니다. 취소 이력으로
  중복 환급을 막고, 이미 게시된 기록이나 사용량 불명 실행의 예약은 유지합니다.
- `explore-dead-code`를 추가했습니다. 저장소 참조를 묶음 검색해 미참조 코드 후보를
  근거·신뢰도와 함께 빠르게 보고합니다. 간접 등록과 외부 API의 불확실성은 추가 확인
  대상으로 남기며 코드를 삭제하지 않습니다.
- `security-scan-workflow`를 추가했습니다. 인증·인가/테넌트, 비밀 노출, XSS·CSRF,
  SQL·명령 주입, SSRF, 파일, 설정·의존성, 자원 고갈과 공유 리소스 영향 경로를 분석합니다.
  검토 요청은 읽기 전용을 유지하고, 수정 요청은 소스 수정·격리 회귀 검증·독립 재검토까지
  수행합니다. DB·Redis뿐 아니라 검색·큐·객체 저장소·인프라의 삭제·설정·가용성 영향을
  점검하며, 실제 공유 서비스 작업과 비밀값 출력은 금지합니다.
- `security-scan-workflow` 선택 설치 시 필수 `security-auditor`를 함께 설치하며,
  현재 스킬 카탈로그는 64개입니다.
- NL-to-SQL의 SQL Server 트랜잭션·관리 제어문 우회와 MySQL 실행 시간 제한 설정 실패 후
  조회가 계속되는 경로를 차단했습니다. 제한을 지원하지 않는 MySQL 호환 서버에서는
  조회를 거부합니다. 읽기 전용 DB 권한과 실제 엔진 검증은 여전히 별도입니다.

## [1.0.1] - 2026-09-08

- OpenSearch·PostgreSQL 리뷰의 필수 의존성과 설치 목록을 구분해 추가 작성 스킬로 인한
  `INVENTORY_MISMATCH` 오중단을 수정하고 필수 리뷰의 완전성 검사는 유지합니다.
- `vulpora-init`이 Gradle Kotlin DSL과 빌드 보조 코드를 애플리케이션 Kotlin 근거에서 제외하고,
  실제 소스·모듈 빌드 설정에 따라 Java/Kotlin 작성·테스트·리뷰 경로를 선택합니다.
- Codex user 설치의 개인 홈 경로를 이식 가능한 참조로 바꾸고 project scope와 권한 설정을 보존합니다.
- 난이도별 Luna 라우팅, 공유 세션 예산, 제한된 편집 제안, 출력 schema 사전 검증과 실패 처리를 보강합니다.
- 반복 사용할 릴리즈 노트 템플릿과 업데이트 절차를 추가했습니다.
- 전체 변경과 검증 범위는 [v1.0.1 릴리즈 노트](docs/releases/v1.0.1.md)에 기록합니다.

## [1.0.0] - 2026-09-07 — first public Vulpora release

- Unified package, CLI, skills, configuration, schemas, receipts, plugins, and documentation under Vulpora.
- Added English and Korean README, full 62-skill handbooks, architecture guides, and the fox banner.
- Reduced conditional skill context and added reproducible tokenizer-based load measurements and budgets.
- Added task/difficulty/risk model routing and fresh Codex session delegation with compact candidate results,
  explicit model/effort, observed usage, stale-input protection, deadlines, and bounded output.
- Corrected behavioral adapter skill loading and distinguished provider usage from byte-based estimates.
- Added an opt-in bounded edit-proposal session mode, deterministic application, and per-session round-trip
  diagnostics. Preserved unsuccessful context experiments and matched production-transport evidence.
- Integrated dependency update PRs and strengthened evaluation trust boundaries without claiming operational trust.

Earlier entries below document private development snapshots, not prior public Vulpora releases.

## [Unreleased]

### Branding and documentation

- 공개 이름과 npm package를 **Vulpora**로 정하고 여우를 상징으로 한 README 배너를 추가했습니다.
- 새 `vulpora` CLI는 기존 `vulpora` 실행 경로와 호환됩니다. 스킬 ID, 환경변수, 설정·receipt·플러그인 ID는 유지합니다.
- 한국어·영어 README, 전체 62개 스킬별 사용 예시, 14개 pack 선택 안내, 폴더·아키텍처 가이드를 정리했습니다.
- 아직 완료하지 않은 npm registry 배포를 명시하고 현재 Git/checkout 실행 방법을 우선 안내합니다.
- 비활성화된 `codex-agent-runtime`의 상태를 설치 카탈로그와 사용 안내에 바로잡았습니다.

## [2.0.0] - 2026-09-07

### Distribution

- npm 설치 안내를 `npx --yes vulpora@2.0.0`으로 고정하고 전역 설치와 GitHub 개발 채널을 구분했습니다.
- 공개 npm registry를 배포 설정에 명시하고 한국어·영어 설치 안내를 release gate에서 함께 검증합니다.

### Added

- Behavioral catalog coverage reaches all 28 manifest agents with 163 cases. Offline CI
  enforces structural checks, behavioral contracts, dry validation, and strict coverage
  across the required shell/awk matrix without invoking an LLM runtime.
- Paired multi-trial baseline summaries carry reproducibility digests and fail closed on
  incomplete, incomparable, or regressing evidence; improvement records use the same
  strict promotion gate. Operator-owned live evidence remains a separate requirement.
- `pack:product`: `product-planner`, `ux-designer`, `design-reviewer`와 독립 지식 번들,
  positive/negative/injection 평가를 추가했습니다. 카탈로그는 agent 28종, bundle 27종, skill 62종,
  capability pack 14종입니다. 실제 모델 및 시각 검증은 별도입니다.
- 영어 quick start, product pack 안내와 평가 evidence 신뢰 경계 문서를 추가했습니다.
- #25의 일부로 독립 Ed25519 producer/approver 서명, 명시 check inventory, 반복 baseline,
  freshness·aggregate budget·redacted trace 검증과 bounded local runner를 추가했습니다.
  운영 sandbox·불변 저장소·유료 live 반복 평가가 없는 결과는 승격을 차단합니다.

### Fixed

- NL-to-SQL MCP의 SQL Server 연결 문자열을 올바르게 파싱하고 연결 방식과 관계없이 timeout·pool 제한을 적용합니다.
- MySQL 값 바인딩을 서버 준비문으로 처리하고 연결 문자열 사용 시에도 명시한 TLS 검증·pool 제한을 유지합니다.
- MySQL 연결 URL의 사용자 CA·인증서·키와 SSL 프로필을 보존하고 기존 인증서 검증을 약화하지 않습니다.
- MySQL 환경변수 예제의 필수 schema allowlist를 보완하고 refactoring 예제를 독자적인 센서 도메인 코드로 교체했습니다.
- #22: hook gate 설치 의존성·누락 시 실패와 behavioral zero-selection NOT_RUN 계약을 보강했습니다.
- #23: 취소·stale checkpoint·false-positive suppression·truncation·우회 LLM route의 공개 합성 회귀 fixture를 추가했습니다.
- #27: system awk/GNU awk/macOS awk 필수 CI matrix와 빠진 도구의 NOT_RUN 계약을 추가했습니다.
- project config의 명시적 null/잘못된 schema type을 기본값으로 덮어 숨기지 않도록 수정했습니다.
- npm tarball의 Git 없는 source gate, pack 공유 의존성 보존, runtime별 skill 경로와
  OpenCode의 canonical shell 금지·환경 파일 읽기 보호를 보강했습니다.

Remote issue closure, publishing and operator-owned release approvals are not implied.

## [2.0.0.0] - 2026-09-06

### Breaking

- 라이선스를 비상업 제한형 source-available 조건에서 OSI 승인 `Apache-2.0`으로 변경했습니다. 공개 전
  contributor·고용관계·지식 번들 원문성에 대한 배포 권리 확인은 별도로 필요합니다.
- npm `postinstall`/`preuninstall` 자동 변경을 제거했습니다. package 설치·제거는 CLI만 배치·제거하며,
  runtime 자산은 `vulpora setup`과 `vulpora uninstall`을 명시적으로 호출할 때만 바뀝니다.
- `vulpora-init`과 `code-authoring-router`의 Kotlin/Spring·DB·검색·GitLab house-style 의존성을
  제거했습니다. 필요한 기술 capability는 pack이나 개별 selector로 설치해야 합니다.

### Added

- `install/packs.txt`에 `core`, orchestration, JVM/Spring, PostgreSQL, SQL Server, OpenSearch, quality,
  QA/E2E, visual, 한국어 product discovery, knowledge, Notion 등 13개 capability pack을 추가했습니다. `pack:<id>` selector는
  install·verify·uninstall에서 지원되며 typed dependency closure는 기존 manifest에서 해소합니다.
- 선택형 `vulpora.config.json`과 JSON Schema를 추가했습니다. locale, GitHub/GitLab/none provider,
  기본 branch, branch 준비 여부를 프로젝트 정책으로 분리하고 기본값은 현재 branch/worktree를 보존합니다.
- `VULPORA_CODEX_MODEL`로 provider별 안전한 Codex model ID를 설치 시 선택할 수 있으며, doctor는
  설치된 model policy를 재현해 검증합니다.
- contribution, governance, support, security, code-of-conduct 문서와 GitHub issue/PR template,
  Dependabot, Linux/macOS CI를 추가했습니다.
- 공개 snapshot에서 내부 식별자의 평문을 노출하지 않고 재유입을 막는 SHA-256 denylist gate를
  추가했습니다.
- NL-to-SQL MCP에 fail-closed schema allowlist, 모든 introspection/SELECT/EXPLAIN 경로의 공통 정책,
  정제된 공개 오류, mock 기반 보안 회귀 테스트를 추가했습니다.
- OpenCode project-scope installer가 canonical agent를 OpenCode Markdown frontmatter와 권한 정책으로
  렌더링하고 package-root token을 실제 bundle 경로로 치환하며, 설치 결과를 rendered catalog와 검증합니다.
- 저작권·지식 provenance·기존 Git history·실 DB integration을 공개 전 소유자가 확인하도록
  `docs/public-release-checklist.md`를 추가했습니다.
- 오프라인 source gate가 인증된 live runtime matrix를 자동 실행하지 않도록 분리했습니다.

- `test-quality-review`, `test-refactoring`, `test-quality-refactoring-workflow`를 추가했습니다. 기존
  테스트의 observable contract·oracle·결함 탐지력·실행 증거를 감사하고, 선택된 finding만 test/fixture
  범위에서 개선한 뒤 negative proof와 재검증을 단일 판정으로 취합합니다. 세 스킬은 `test-authoring`과
  `test-runner`의 재귀 설치 closure로 배포되며 `vulpora-init`은 Kotlin/Spring 저장소에서 새 테스트 작성,
  품질 리뷰, finding 기반 리팩터링 경로를 구분해 안내합니다.

- `agent-eval`이 NVIDIA SkillEvaluator v0.2.1을 선택형 보조 평가기로 사용합니다. 기본 keyless Tier 1은
  Vulpora의 Codex frontmatter와 `reference/` 구조를 보존하면서 schema·PII·license·quality·Unicode·
  script lint를 검사하고, 결과를 저장소 밖에 격리합니다. 전체 보안, 의미 중복, 실제 agent lift는
  scanner/provider/credential/sandbox 선행 조건을 확인하는 명시적 mode로 분리했으며 incomplete 증거는
  PASS로 승격하지 않습니다. 현재 skill catalog는 62종이며, 긴 실행 규약은
  entrypoint에서 필요한 routing·safety 요약만 남기고 on-demand reference contract로 이동했습니다.
  `--catalog skills`는 이후에도 source catalog 전체를 같은 keyless gate로 다시 검사합니다.

- `mssql-code-authoring`이 레거시 Microsoft SQL Server의 engine version, edition, compatibility level,
  collation, isolation, Query Store를 먼저 확인하고 그 feature floor 안에서 T-SQL·stored procedure·index·
  migration을 작성합니다. Microsoft Learn 공식 근거를 query, transaction/locking, schema migration,
  performance, security/support-lifecycle KB로 나눴으며 repository routing도 SqlClient·mssql-jdbc·mssql·
  tedious 증거를 감지합니다.

- `e2e-test-workflow`가 시나리오 작성, API/통합 실행, Playwright 실행, 선택적 HTML 렌더링을 하나의
  run-owned Testcontainers lifecycle로 조정합니다. API와 browser가 같은 환경 manifest를 사용하고,
  cleanup·부재 검증·teardown·orphan audit가 빠지면 assertion이 녹색이어도 PASS로 승격하지 않습니다.

- `playwright-e2e`가 QA가 인계한 UI 핵심 시나리오를 repository-declared Playwright 구성으로 한 번 실행하고,
  run-scoped 합성 데이터를 생성·기록·finally 정리·부재 검증한다. 실패 시 trace·screenshot·video와
  케이스별 데이터 lifecycle을 `test-report/browser-e2e/`에 남기며, Playwright 설치나 broad cleanup은 하지 않는다.

- `vulpora-init`이 설치 직후 repository build/source/persistence/search 증거를 감지해 root `AGENTS.md`의
  marker-bounded routing 지침을 생성·갱신합니다. 수동 지침을 보존하고 Kotlin/Spring, PostgreSQL,
  OpenSearch의 구현·테스트·리뷰 스킬 경로와 evidence를 기록하며 `--check`로 drift를 검증합니다.
- Claude Code가 catalog 전체(에이전트 25종 + 스킬 62종)를 발견할 수 있도록 저장소 루트
  `.claude-plugin/plugin.json`·`marketplace.json`을 추가했습니다. `claude plugin marketplace add`와
  `claude plugin install vulpora@vulpora`이 다시 동작하고 `claude plugin validate`도 통과합니다.
  이 manifest는 README·package.json·기존 테스트가 이미 전제하고 있었지만 저장소에 없어서
  `install/check-npm-package.sh`와 `install/test-plugin-distribution.sh`가 실패하던 상태였습니다.
- `install/test-claude-skill-port.sh`가 skill catalog의 Claude 소비 계약을 강제합니다 — plugin manifest
  정합, 62종 SKILL.md frontmatter(name/description 규칙과 1024자 상한), runtime 미표기 Codex 전용 호출
  표기 잔존 여부, skill 내부 상대 링크 해소. 릴리스 게이트인 `install/check-npm-package.sh`에서 함께
  실행됩니다.
- 설치 시 대상 런타임을 자동으로 감지합니다. `vulpora setup|doctor|uninstall|mcp`의
  `--runtime` 기본값이 `auto`가 되어, PATH의 Claude Code(`claude`)·Codex(`codex`) CLI를 찾아
  감지된 런타임 전부에 적용합니다. 하나만 있으면 그 런타임만, 둘 다면 둘 다 처리하고, 하나도
  없으면 아무것도 바꾸지 않고 안내와 함께 중단합니다. 감지 로직은 `install/runtime-detect.sh`
  하나에 모여 있습니다.
- `install/test-runtime-autodetect.sh`가 자동 감지 계약을 검증합니다 — 감지 0/1/2개 경우,
  명시 `--runtime`의 감지 결과 우선권, 감지 실패 시 무변경 중단, 비표준 IFS 환경에서의 목록
  순회. 릴리스 게이트 `install/check-npm-package.sh`에서 함께 실행됩니다.
- `korean-dev-writer`가 README, 코드 주석, 기술 설명, PR과 코드 리뷰를 번역투 없이 한국 개발자가
  실제 업무에서 쓰는 문체로 작성하도록 작업별 KB와 36개 Before/After 예시를 제공합니다. 기존
  의미 보존형 윤문 기능도 이 Skill로 통합했습니다.
- `kotlin-spring-review-workflow`가 Kotlin·Spring, 객체지향 설계, 디자인 패턴, 리팩터링 스킬을 같은 고정 범위에서
  실행하고 이견을 보존한 단일 판정으로 취합합니다.
- `kotlin-code-authoring`, `postgres-code-authoring`, `opensearch-code-authoring`이 리뷰 기준을 작성 시점의
  construction contract로 적용합니다. Kotlin/Spring 코드, PostgreSQL query·schema·migration,
  OpenSearch mapping·Query DSL·reindex 계획을 작성할 때 관련 review KB와 안전·검증 기준을 함께 사용합니다.
- `code-authoring-router`가 일반 기능·버그·리팩터링 요청에서도 저장소 증거와 설치된 capability로
  작성 스킬을 선택합니다. 기본값은 현재 branch/worktree를 보존하며 branch 준비나 publish는
  repository 정책 또는 사용자의 명시적 요청이 있을 때만 수행합니다.
- `java-spring-review-workflow`가 강화된 `java-reviewer`, `oop-design-review`,
  `design-pattern-apply` 세 pass를 한 frozen scope에서 동시에 실행하고 이견과 route 증거를 보존합니다.
- Vulpora의 중립 visual token을 적용한 start-task lifecycle, model routing, DAG scheduling standalone HTML/SVG
  다이어그램 3종을 추가했습니다.

### Changed

- `e2e-runner`가 Compose를 실행 경로에서 제거하고 run-owned Testcontainers 환경만 검수 PASS 대상으로
  인정합니다. Docker CLI 연결과 실제 Testcontainers 기동을 분리해 검증하고, fresh XML·실행 class·0 skip·
  non-Ryuk container start·case cleanup·orphan audit 증거가 없으면 녹색 결과도 `BLOCKED_FALSE_GREEN`으로
  차단합니다. `playwright-e2e`도 같은 환경 owner manifest를 사용하며 기존 server/baseURL/storage state를
  재사용하지 않습니다.
- `e2e-scenario-author`와 `e2e-runner`가 `node-nestjs` profile을 지원합니다. NestJS package evidence,
  global prefix, controller/method route, local guard decorator, ValidationPipe와 class-validator metadata를
  source inventory에 반영하고, runner는 npm/pnpm/yarn의 non-watch start script와 repository-declared
  health endpoint로 대상 앱을 기동·식별합니다. 일반 Node repository는 계속 fail closed 합니다.
- `start-task`가 사용자 입력을 먼저 점수화하고, 명확도 85점 미만이면 한 번에 결정 질문 하나만 묻습니다.
  사용자는 점수가 낮아도 남은 가역적 위험을 기록한 채 현재 작업 명세를 확정할 수 있습니다. 명료화
  `requirement-dialogue`는 고정 turn 수나 전체 실행 시간 대신 ambiguity ledger의 수렴 상태로 계속 여부를
  판정합니다. Runtime이 spawn 불가·disconnect·terminal timeout을 보고하면 wait 횟수로 재시도하거나 일반
  agent로 바꾸지 않고 primary가 같은 점수 함수와 검증 계약으로 이어갑니다. 점수는 모델이 준 0–4 rating을
  합산하지 않고 축별 evidence signal에서 도출하며, persistent session round는 input/output digest와
  heartbeat/host-yield에 결합해 고정 시간 제한 없이도 무진행 상태를 fallback으로 전환합니다.
- `e2e-scenario-author`가 Spring JVM module과 source root를 저장소에서 찾고, 공통 catalog contract와
  validator로 결과를 검사한 뒤에만 교체합니다. 시나리오 ID·정렬·source fingerprint를 결정론적으로
  만들며, 상태를 바꾸는 시나리오는 선언한 resource 또는 capture를 정리하는 teardown을 반드시 둡니다.
  Canonical source inventory와 catalog target·required behavior를 exact-match해 빠진 endpoint/validation
  scenario와 소스에 없는 target을 거부합니다. `e2e-runner`도 고정 module·port 대신 catalog와
  build/config에서 실행 대상을 찾습니다.
- `start-task`가 AC→contract→evidence 지도로 vertical task를 분해하고 vague/horizontal/fake-parallel task를
  ready 전에 거부합니다. Owner role을 먼저 고른 뒤 task별 모델 profile을 독립 보정하며, primary는 모든
  child attempt를 completion matrix에서 실제 diff·scope·fresh AC evidence와 대조해 취합합니다. 가역적
  명확화 질문에는 근거 있는 추천 기본값과 자유 입력 경로를 제공해 추상적인 주관식 질문을 줄였습니다.
- 공개 배포 license를 OSI 승인 `Apache-2.0`으로 설정하고 npm package publish access를 `public`으로
  유지했습니다.
- npm package와 Claude plugin의 작성자·repository metadata를 공개 프로젝트용 값으로 통일하고,
  설치 launcher를 공개 GitHub repository로 전환했습니다. 조직 식별자와 로컬 절대 경로가 다시
  들어오면 실패하는 `install/test-public-release-neutrality.sh`를 릴리스 게이트에 추가했습니다.
- skill 문서의 다른 skill 라우팅 표기를 runtime 중립으로 바꿨습니다. Codex 전용 `$<skill-id>` 대신
  skill 이름을 쓰고(`mermaid-diagrams`, `diagram-styler`, `pdf-qa`, `notion-domain-context`,
  `vulpora-installer`), 실제 호출 예시가 필요한 곳은 Codex `$<id>`와 Claude Code `/<id>`를 함께
  제시합니다. Claude 세션이 실행할 수 없는 호출 문법을 그대로 따라 하던 문제를 없앱니다.
- `visual-artifact-router`의 description trigger를 "Use when Codex must choose ..."에서
  "Use when the agent must choose ..."로 바꿨습니다. Claude Code는 description만 보고 skill을
  선택하므로 특정 runtime을 주어로 쓰면 선택 신호가 약해집니다.
- `vulpora-installer` 스킬에 Claude Code `--runtime claude-code` 실행 예시를 추가했습니다.
- `STANDARD.md`에 `skills/<skill-id>/SKILL.md` 파일 규약(frontmatter 한계, runtime 중립 호출 표기,
  상대 링크의 안/바깥 경계, runtime별 discovery 경로)을 추가했습니다.
- 대화형 설치기가 런타임을 더 이상 묻지 않습니다. 설치 대상은 사용자의 취향이 아니라 이 머신에
  무엇이 설치돼 있는지의 사실 문제여서, 고르게 하면 없는 런타임을 골라 실패하거나 있는 런타임을
  빠뜨리게 됩니다. 감지 결과를 화면에 표시하고 진행하며, TUI 단계는 6단계에서 5단계로 줄었습니다.
  특정 런타임만 원하면 `VULPORA_RUNTIME=claude-code|codex|all`로 지정합니다.
- npm 설치·제거 lifecycle에서 runtime을 자동 변경하던 동작을 제거했습니다. 전역/비전역 설치 모두
  CLI만 준비하며 `setup --runtime ... --scope ...` 또는 대화형 적용을 명시해야 catalog가 설치됩니다.
- `vulpora mcp` 작업도 `--runtime` 없이 실행할 수 있습니다. MCP manager는 여전히 런타임 하나만
  다루고, CLI가 감지된 런타임 수만큼 호출을 펼칩니다.
- `start-task`가 commit된 clarified spec과 task DAG를 해시가 포함된 파일로 동결하고, 독립 실행 작업을
  runtime slot·dependency readiness·write-scope 독립성·상위 policy로 계산한 native 세션에 라우팅합니다.
- `start-task`의 canonical invocation을 `$start-task "<task description>"`으로 명시하고, 입력을 shell로
  평가하지 않는 1~4096 UTF-8 byte 문자열 계약으로 고정했습니다.
- `start-task`는 구현 전 현재 명확도와 모호성, 가장 중요한 미결정 영역을 보여주고 사용자가 더
  명확히 할지 현재 상태로 구현할지 결정하게 합니다. 한 사용자 턴당 주관식 질문 하나를 유지하지만
  run당 고정 질문 상한은 제거했습니다. 안전한 저장소 관찰과 가역적 기본값으로 먼저 해소합니다.
- `needs_input` 응답은 점수, 덜 검증된 부분, 안전할 때 현재 상태로 구현할 수 있다는 안내를 자연스러운
  대화로 표시합니다. 사용자가 `현재 내용으로 바로 구현해`, `그래도 구현해`처럼 명시하면 가역적
  unknown을 가정·위험으로 기록하고 숫자 threshold만 우회합니다. 안전·권한 blocker와 commit·split
  순서는 유지합니다. 모든 질문은
  `korean-dev-writer`로 윤문하고 의미가 보존됐는지 다시 확인합니다.
- 질문 frame의 점수를 canonical projection에 결합하고, 중복 점수·추가 명령문·복합 질문·정중한 안전
  우회 표현을 거부합니다. 숫자 threshold 우회는 점수 표시 뒤의 answer digest와 설명 있는 가역 risk에만
  허용하며, answer는 사전 offer의 점수·unknown 집합·질문·run에 결합합니다. Accepted risk는 DAG 처리에
  연결하고 active split 전 및 resume 시 projection 의미와 runtime-owned validator ledger를 재검증합니다.
- 구현 요청을 실행 의도로 인정해 범용 명세 확인 질문을 제거했습니다. Spec은 task-input 또는 blocker
  답변 digest에 한 번만 commit되며, 실행 시작 뒤에는 질문·같은 run의 spec/DAG 변경·이전 phase 복귀가
  금지됩니다. 호환되는 세부 조정은 additive directive로, 규범적 변경은 successor revision으로 처리합니다.
- 각 상태 전이는 canonical `run-control-NNNN.json`과 ledger의 이전 file digest/head/count에 결합됩니다.
  질문 이력·spec hash/revision·task/AC inventory·evidence를 다음 호출에서 초기화할 수 없고, normative
  변경의 successor revision과 `supersedes_sha256`도 validator가 확인합니다.
- Frozen task DAG는 canonical JSON(YAML 1.2 valid)으로 정규화합니다. Dependency·cycle·wave membership/order,
  병렬 write-scope, bidirectional task↔AC coverage, readiness·provenance를 dependency-free validator로 검사합니다.
- `complete`는 frozen DAG의 정확한 task inventory와 모든 acceptance criterion이 recorder가 관찰한 성공
  evidence에 연결될 때만 허용합니다. `partial`은 질문 없는 `ready_to_resume` terminal checkpoint이며,
  재개 시 successor run이 재검증된 evidence만 가져옵니다.
- `start-task` 실행은 phase·task·artifact·command 이벤트를 run-local SHA-256 hash-chain ledger에 append한
  뒤 사용자에게 `작업 로그:`로 표시합니다. 자기보고는 관찰된 성공 증거로 승격하지 않으며, 외부 anchor가
  없는 로컬 ledger는 절대 불변이 아니라 변조 탐지 가능 수준으로 명시합니다. Ledger provenance가 새 필수
  필드이므로 terminal report schema는 호환성을 숨기지 않고 `vulpora.orchestration-report/v3`로 올렸습니다.
  Clarity validator 입력도 inherited stdin으로 받지 않고 canonical projection file의 SHA-256을 argv·spec·
  report와 결합해, 무관한 통과용 JSON으로 gate evidence를 바꾸지 못하게 했습니다. Final clarified spec은
  canonical JSON/YAML 1.2인 `vulpora.clarified-task-spec/v2`로 올리고 projection을 유일한 gate 표현으로
  만들어 top-level 중복값과의 모순도 제거했습니다.
- `start-task`의 `partial` 결과는 pending 검증과 frozen artifact hash를 보존하는 재개 checkpoint입니다.
- `start-task` execution child가 primary 모델을 암묵 상속하지 않도록 portable profile을 현재 runtime의
  구체 모델·추론 강도로 dispatch 직전에 해소하고 `fork_turns: none`, `model`, `reasoning_effort`를 native
  spawn에 필수로 전달합니다. Handoff·runtime event·terminal report가 이 route와
  `inheritance_used: false`를 서로 검증하며, DAG 분해·동적 scheduling·fallback·ledger 동작을
  `docs/start-task-orchestration.md`에 정리했습니다.
- `java-reviewer`가 순수 Java 규약에 더해 Spring DI·bean scope·proxy/self-invocation·transaction,
  Spring Data JPA entity state, MVC validation/error contract와 focused test evidence까지 검토합니다.
- Java/Kotlin/backend/architecture/OpenSearch/PostgreSQL 통합 리뷰 workflow가 specialist별
  `frugal|standard|frontier` profile을 dispatch 시점의 host model로 해소하고 `fork_turns: none`과 exact
  model/reasoning override를 강제합니다. 비싼 primary 모델의 암묵 상속과 route mismatch는 실패로 처리하며
  workflow별 기본 route와 escalation 조건을 `docs/review-workflow-model-routing.md`에 정리했습니다.
- `git-flow`가 별도 override가 없으면 `target=develop`, `assignee=@me`, `reviewer=@me`를 적용해 질문 없이
  commit→push→MR을 진행하며, 큰 multi-theme diff는 atomic commit과 staged push로 나눕니다.
- `postgres-dba`와 `opensearch-expert`가 작성 요청을 받으면 각 code-authoring skill을 먼저 로드하는
  authoring mode를 사용하며, 작성 결과와 검증·rollback/전환 계획을 제공하되 외부 DB·cluster 변경은
  별도 권한 없이 실행하지 않습니다.

### Fixed

- `e2e-scenario-author`의 catalog validator가 새 `node-nestjs` inventory를 계속 거부하던 profile
  allowlist 누락을 수정했습니다. 실제 NestJS detector output으로 inventory-bound catalog validation과
  missing-coverage·unknown-profile 거부를 회귀 테스트합니다.
- Codex agent adapter가 canonical Markdown의 PostgreSQL 메타 명령 `\d`를 TOML escape로 잘못 해석해
  `postgres-dba.toml` discovery가 실패하던 문제를 수정했습니다.

## [1.3.0.0] - 2026-08-18

### Added

- 백엔드, OpenSearch, PostgreSQL, 애플리케이션 아키텍처를 전문 스킬·에이전트와 함께 실행하는
  통합 리뷰 workflow 4종을 추가했습니다.
- 요구 명확화, 승인, task DAG 분해, native subagent 실행, 통합 검증을 연결하는 `start-task`와
  `requirement-dialogue`, `task-splitter`, `task-orchestrator`를 추가했습니다.
  두 런타임은 같은 `vulpora.start-task/v1` 계약을 사용하며 Codex는 `$start-task` 또는 `/skills`
  선택, Claude Code는 `/start-task`라는 각 런타임 native entrypoint를 사용합니다.
- DDD·애플리케이션 아키텍처·데이터 모델·보안 리뷰, 테스트·문서 주석 작성 에이전트 6종과
  의미를 보존하는 한국어 윤문 스킬을 추가했습니다.

### Changed

- 설치 manifest의 dependency가 기존 bare skill ID와 `skill:<id>`, `agent:<id>` typed reference를
  함께 지원합니다. workflow나 에이전트를 선택하면 필요한 스킬·에이전트 closure가 재귀 설치됩니다.
- 전체 inventory는 에이전트 25개, 스킬 41개입니다.

### Verification

- manifest 정합성, cross-kind dependency closure, Codex adapter, 선택 설치·제거, npm tarball,
  Claude plugin inventory와 behavioral contract를 회귀 검증합니다.

## [1.2.4.0] - 2026-07-21

### Fixed

- 대화형 `전체 제거`가 현재 manifest selector를 넘겨 retired/이름 변경 Vulpora 자산을 receipt에
  남기던 문제를 수정했습니다. 전체 제거는 runtime receipt 전체를 사용해 `.vulpora`까지 정리합니다.
- 소유 자산 제거 후에도 `.claude`, `.codex`, `.agents`와 각 `agents`/`skills` 공용 폴더를 유지해
  기존 사용자·회사 에이전트와 스킬을 보존합니다.
- 에이전트 또는 MCP와 함께 설치할 때 스킬 1개 이상을 강제하던 문제를 수정해 0개 선택을
  허용합니다.

### Changed

- 스킬 35개에 한글 표시 이름과 용도 설명을 추가하고, TTY에서 현재 커서 항목의 설명·의존성을
  목록 아래에 표시합니다.
- 설치 종류에 `에이전트 + MCP`를 추가해 스킬 없는 조합을 명시적으로 선택할 수 있습니다.

### Verification

- plain/TTY 스킬 0개 설치, retired receipt 전체 제거, `.vulpora` 정리, runtime 공용 폴더와
  receipt 미소유 자산 보존을 회귀 테스트로 검증합니다.

## [1.2.3.1] - 2026-07-21

### Documentation

- `README.md`와 `INSTALL.md` 설치 섹션에 로컬 checkout 직접 실행 절차를 추가했습니다.
- 네트워크에 연결된 환경에서 만든 `vulpora-offline.tgz`를 Git host·npm registry에 접근할 수 없는 PC에서 실행하는
  오프라인 설치 절차와 runtime·Notion 네트워크 전제조건을 명시했습니다.

## [1.2.3.0] - 2026-07-20

### Fixed

- Claude Code에서 PATH나 checkout에 `vulpora`이 없으면 Bash와 npx가 있어도 설치 명령을 사용자에게
  돌려보내던 installer skill을 수정했습니다. Git repository npx launcher 뒤에 explicit subcommand를 붙여
  dry-run, 설치, login, status를 직접 실행합니다.
- project `.mcp.json`에 Notion server가 이미 있어도 `Pending approval`을 MCP 미설치로 오판하던 문제를
  수정했습니다. `vulpora mcp status`는 이를 `approval_required`로 보고합니다.

### Changed

- Claude project MCP 설치 후 현재 session의 `/mcp`에서 server trust 승인과 OAuth를 완료해야 한다는
  상태를 대화형 설치기와 문서에 분리해 표시합니다. 설치 중 인증은 제거하고 첫 Notion 호출까지
  `auth_deferred`로 미룹니다.
- launcher 부재·permission 거부 또는 사용자가 대화형 UI 자체를 요청한 경우에만 command handoff를
  사용합니다.
- 설치기의 장시간 작업 화면에 progress bar, 현재 단계, 경과 시간과 최근 작업 로그 5줄을 표시합니다.
- Codex/OMX 첫 Notion 호출에서 미인증 MCP의 도구 inventory가 비어 있어도 installer status로 exact config를
  확인한 뒤 OAuth를 한 번만 시작합니다. tool 부재를 곧바로 재설치 또는 단순 재시작 상태로 낮추지 않습니다.

### Verification

- npx explicit execution과 pending-approval 상태의 skill contract/behavioral 회귀, MCP manager, 전체
  agent/skill/plugin/npm 설치·삭제 회귀를 검증합니다.

## [1.2.2.0] - 2026-07-20

### Fixed

- Codex/OMX collaboration surface에 named `agent_type` selector가 없는데도 `/notion-domain-context`가
  `notion-domain-researcher` 선택을 필수로 요구해 항상 `restart_required`가 되던 실행 불가능한 경로를
  수정했습니다.
- Codex `vulpora-notion` pack이 URL만 등록하던 문제를 수정해 selected-scope config에 search/fetch read
  alias 4개만 server-level `enabled_tools`로 기록합니다. skill은 이 제한된 parent MCP를 직접 사용합니다.

### Changed

- 기존 1.2.1 endpoint-only Codex 설정은 OAuth를 유지한 채 missing policy만 원자적으로 추가합니다. 다른
  endpoint, widened/custom policy, 중복 table, symlink config는 덮어쓰지 않고 충돌로 보존합니다.
- Claude Code 경로는 exact `notion-domain-researcher`와 namespaced tool allowlist를 계속 사용합니다.
- MCP `status`와 `login`도 endpoint뿐 아니라 Codex read-only policy를 검증합니다.

### Verification

- 신규 설치, 무손실 upgrade, 멱등성, policy 확대 거부, malformed/symlink config, runtime 분기와 전체
  agent/skill/MCP/package 회귀를 검증합니다.

## [1.2.1.0] - 2026-07-20

### Fixed

- `notion-domain-context`와 `notion-domain-researcher`가 공식 Notion MCP 설치·OAuth 성공 여부와 무관하게
  고정 `no_evidence`만 반환하던 모순을 수정했습니다.
- 현재 session에서 skill이 restricted researcher를 호출하고, researcher만 `vulpora-notion` search/fetch를
  하드 allowlist로 직접 사용합니다. 도구 부재는 `restart_required`, 인증 필요는 `auth_required`, 실제 검색
  성공 후 빈 결과만 `no_evidence`로 구분합니다.

### Changed

- 사용되지 않는 고정 상태 runner와 auth bootstrap shell을 제거하고, Claude/Codex researcher에 per-agent
  search/fetch allowlist를 적용했습니다. 공식 Notion MCP 연결 전체를 read-only라고 표기하지 않습니다.
- Notion behavioral eval을 cited evidence, 접근 거부, prompt injection, stale conflict, invalid scope,
  MCP 미노출 시나리오로 복원했습니다.

### Verification

- Notion MCP 정적 계약, skill frontmatter, Claude/Codex researcher adapter, 16개 behavioral fixture,
  전체 agent/skill 설치·plugin·npm package 회귀를 검증합니다.

## [1.2.0.0] - 2026-07-20

### Added

- 배포에서 제외됐던 Vulpora 스킬 35개를 다시 복원하고 Claude Code의 `.claude/skills`,
  Codex의 `.agents/skills`에 선택 설치·점검·제거할 수 있게 했습니다.
- 대화형 설치 종류에 `에이전트 + 스킬`, `스킬만`, `전체 카탈로그`를 추가하고 기본 선택을
  `에이전트 + 스킬`로 변경했습니다.
- 대화형 설치기의 미리보기 생성, 설치·삭제 적용, 상태 점검 대기 화면에 ASCII 회전 인디케이터와
  경과 시간을 추가했습니다. 완료되면 별도 입력 없이 다음 화면으로 전환합니다.

### Changed

- 사용자 범위의 비대화형 기본 설치와 전역 npm lifecycle도 에이전트와 스킬 전체를 함께 설치합니다.
- 시간이 걸리는 명령의 상세 출력은 진행 화면과 섞이지 않도록 캡처하고, 실패할 때 원인과 함께
  복원된 터미널에 표시합니다.

### Verification

- Claude/Codex 격리 target에서 스킬 35개 설치·검증·선택 제거와 package tarball 포함 여부를 확인하고,
  TTY 흐름에서 미리보기·적용 인디케이터 및 full-screen erase 미사용 계약을 함께 검증합니다.

## [1.1.5.0] - 2026-07-20

### Changed

- registry나 checkout 없이 실행하는 기본 설치 명령을 한 줄 `npx --package=<GitLab Git URL> -- vulpora`로
  통일했습니다. 런타임, 범위, 에이전트와 MCP는 모두 실행 후 메뉴에서 선택합니다.
- `VULPORA_UI=plain|tui`를 명시한 자동화에서도 무인수 `vulpora`이 대화형 설치기로 진입합니다.
  일반 pipe의 무인수 호출은 기존처럼 도움말을 출력합니다.

### Verification

- 실제 npm tarball을 `npx`로 무인수 실행하고, 대화형 선택 결과가 Claude Code user scope의
  에이전트 16개와 receipt로 반영되는지 격리된 HOME에서 검증합니다.

## [1.1.4.0] - 2026-07-20

### Fixed

- cursor-home 방식으로 짧은 새 행을 덮어쓸 때 이전 frame의 긴 문장 suffix가 남아
  `Codex제거`, `둘 다제거`처럼 보이던 TTY 잔상을 수정했습니다.
- 모든 TUI 행과 빈 행이 `erase-to-end-of-line`으로 끝나도록 렌더링을 중앙화했습니다.
  full-screen erase는 사용하지 않으므로 1.1.3의 깜빡임 개선을 유지합니다.

### Verification

- `작업 선택 → 런타임 선택` frame 전환에서 `Claude Code`, `Codex`, `둘 다`, 선택 상세 행이
  모두 line erase로 종료되고 `ESC[2J`가 출력되지 않는지 회귀 검증했습니다.

## [1.1.3.0] - 2026-07-20

### Changed

- TTY를 Codex/OpenCode 계열의 간결한 레이아웃으로 정리하고, 과도한 bold와 폭이 불안정한
  장식 기호 대신 `>`, `[x]`, `[ ]` 기반 선택 표시를 사용합니다.
- 요약을 byte-width padding 열에서 단순 key/value 목록으로 바꿔 한글 terminal width에 따른
  어긋남을 제거했습니다.

### Fixed

- 키 입력마다 `ESC[2J`로 화면 전체를 지우던 렌더링을 alternate screen의 cursor-home 갱신으로
  교체했습니다. synchronized output 지원 터미널에서는 각 frame을 한 번에 표시합니다.
- 정상 종료, 취소, 오류, signal 경로에서 cursor와 기존 terminal 화면을 복구합니다.

### Verification

- TTY 설치·선택 제거·전체 제거·MCP 키 입력 회귀에서 alternate screen 진입/복귀, cursor 복구,
  synchronized frame, `[x]` 렌더링과 full-screen erase 미출력을 검증했습니다.

## [1.1.2.0] - 2026-07-20

### Changed

- TTY 첫 화면을 `설치 또는 업데이트`, `선택 제거`, `전체 제거`, `상태 점검` 작업 선택으로
  재구성해 삭제 경로를 런타임·범위 선택 뒤에 숨기지 않습니다.
- `전체 제거`는 선택한 런타임과 범위의 Vulpora 에이전트 및 catalog MCP 연결 전체를 한 번에
  미리보고 명시적으로 확인한 뒤 정리합니다.
- 에이전트/MCP 선택 화면의 제목과 설명이 현재 설치·제거 작업을 직접 나타내도록 보정했습니다.

### Fixed

- 제거 중 수정된 에이전트 경로를 안전 보존해 부분 제거 상태가 되더라도 MCP와 다른 런타임의
  나머지 정리를 계속하도록 수정했습니다.

### Verification

- plain 입력 호환, TTY 첫 화면 제거 노출·선택 제거·전체 제거, 수정 파일 보존 뒤 MCP 계속 제거를
  격리된 방향키 입력 스트림과 runtime double로 검증했습니다.

## [1.1.1.0] - 2026-07-20

### Added

- 실제 TTY에서 `↑/↓`, `Space`, `A`, `Enter`로 런타임·범위·에이전트·MCP를 선택하는
  dependency-free ANSI 인터페이스를 추가했습니다.
- 선택 개수, 긴 목록 viewport, 단계 표시, 요약 preview, `D` 세부 dry-run, `Q` 안전 취소를
  추가했습니다.

### Changed

- CI·pipe에서는 기존 번호 입력 plain UI를 유지하고, TTY에서만 새 UI를 자동 활성화합니다.
- `notion-domain-researcher`의 잘못된 `(비활성)` 표시를 제거했습니다.

### Verification

- plain CLI 19건, TTY 에이전트 선택·취소 2건, TTY MCP 선택 1건을 방향키 입력 스트림으로
  검증하고 실제 PTY에서 viewport·키 반응을 확인했습니다.

## [1.1.0.1] - 2026-07-20

### Fixed

- registry package를 전제로 한 직접 실행 안내를 제거했습니다.
- 빠른 설치는 Git repository URL 비전역 실행으로, 전역 CLI는 checkout tarball 설치로
  재작성해 registry 없이 동작하도록 했습니다.

### Verification

- 실제 Git HTTPS package source로 `npm exec ... vulpora version`을 실행해 1.1.0.0 CLI
  해소를 확인했고, 문서 게이트가 registry-only 명령의 재도입을 거부하도록 했습니다.

## [1.1.0.0] - 2026-07-20

### Added

- `vulpora interactive`와 package bin으로 Claude Code·Codex, user·project,
  설치·삭제·상태 점검, 에이전트·MCP를 순서대로 선택하는 대화형 설치기를 추가했습니다.
- 선택한 에이전트만 설치하고 선택한 에이전트만 receipt 기반으로 안전하게 제거하는 사용자 흐름을
  추가했습니다. Claude Code도 marketplace 등록 없이 직접 discovery 경로에 설치합니다.
- hosted MCP pack catalog에 Notion OAuth MCP와 OpenAI developer documentation MCP를 추가했습니다.
  `vulpora mcp install|remove|status|login`으로 대화형과 비대화형 운영을 모두 지원합니다.

### Security

- MCP 설정 이름을 `vulpora-<pack>`으로 격리하고, 같은 이름이 다른 endpoint를 가리키면
  덮어쓰거나 삭제하지 않고 충돌을 보고합니다. OAuth 승인과 토큰 발급은 각 런타임에 위임합니다.

### Verification

- 대화형 선택, Claude/Codex 설치, 선택 제거, MCP 멱등성·충돌 보호·OAuth 위임,
  npm tarball 비전역 `npm exec` 실행을 격리된 회귀 테스트로 검증합니다.

## [1.0.0.0] - 2026-07-20

### Removed

- source와 배포 inventory에서 스킬 35종을 모두 제거했습니다. Codex와 Claude Code의 정상 inventory는
  이제 `Agents (16)`, `Skills (0)`입니다.

### Changed

- 스킬에만 있던 추출·다이어그램·평가 절차 중 계속 필요한 지식은 해당 에이전트 번들로 이동해
  16개 에이전트가 외부 Vulpora 스킬 없이 동작하도록 정리했습니다.
- npm 업데이트는 이전 receipt가 소유한 미수정 Codex 스킬을 먼저 제거한 뒤 에이전트만 설치합니다.
  사용자가 수정한 레거시 경로는 보존합니다.
- behavioral baseline을 `plain-runtime`, `agent-only`, `agent-memory` 3모드로 축소했습니다.

### Verification

- manifest/source 정합성, npm pack·전역 설치·레거시 정리, Claude plugin Agents(16)/Skills(0),
  setup/doctor/uninstall 및 behavioral 구조 검증을 배포 게이트로 확인합니다.

## [0.4.1.0] - 2026-07-20

### Added

- Claude Code marketplace plugin의 `project` scope 설치와 삭제를 실제 CLI로 검증하는 배포 회귀 테스트를
  추가했습니다.

### Changed

- README와 설치 가이드를 `user`와 `project` 중 먼저 범위를 고른 뒤 Codex 또는 Claude Code 명령을 그대로
  실행할 수 있는 설치·삭제 절차로 정리했습니다.

### Fixed

- npm `prepack` 검증 메시지가 `npm pack --silent`의 tarball 경로 출력에 섞여 복사한 설치 명령이 잘못된
  다중 행 경로를 만드는 문제를 수정했습니다.
- 문서의 npm tarball 변수는 마지막 출력 행만 사용해 이전 package에서도 같은 설치 명령이 동작하도록
  보정했습니다.

## [0.4.0.0] - 2026-07-16

### Added

- `npm install -g vulpora`이 Codex 사용자 discovery 경로에 native agent 16개와 skill
  35개를 자동 설치하고 검증하는 lifecycle을 추가했습니다.
- repository root를 Claude Code plugin으로 선언해 marketplace 설치 시 `Agents (16)`, `Skills (35)`가
  자동 discovery되도록 했습니다.
- npm tarball 전역 설치/제거와 Claude marketplace validate/install/inventory/uninstall을 각각 격리
  환경에서 실제 실행하는 배포 회귀 테스트를 추가했습니다.

### Changed

- Codex adapter 설치 시 canonical agent 정의를 native TOML 본문에 주입하고 package-local 경로를 실제
  설치 위치로 렌더링합니다.
- 사용자 scope Codex setup의 기본 selector를 `all-agents all-skills`로 변경했습니다. template, memory,
  eval은 계속 명시적 opt-in입니다.
- 분리돼 있던 최소 `codex-plugin/`, `claude-plugin/` package와 Codex marketplace manifest를 제거하고,
  Codex는 npm, Claude는 root marketplace라는 단일 설치 경로로 정리했습니다.

### Fixed

- 0.3.1의 status-only/zero-copy 배포 때문에 전체 catalog가 runtime에 설치되지 않던 회귀를 수정했습니다.
- npm 제거 시 사용자가 수정하지 않은 receipt-owned Codex 자산만 정리하고, 새 snapshot/anchor 기록은
  검증된 임시 디렉터리를 원자 이동해 첫 설치 시간을 줄였습니다.

## [0.3.1.0] - 2026-07-16

### Added

- Codex용 `codex-plugin/`과 Claude Code용 `claude-plugin/`을 별도 최소 native package로 추가했습니다. 각
  package는 `vulpora-installer`, `notion-domain-context` status-only skill 두 개만 포함하며
  Agents/Scripts/Hooks/MCP inventory는 0입니다.
- 두 marketplace가 repository root가 아니라 각 격리 package를 선택하는지, 모든 runtime/scope의 catalog
  copy가 0인지 검증하는 회귀 gate를 추가했습니다.
- 이전 project/user 복사본을 새 plugin lifecycle과 분리해 inventory하고, 검증된 clean copy만 out-of-band
  운영 절차로 제거하도록 migration 계약을 추가했습니다.

### Changed

- `vulpora-installer`를 실행형 workflow에서 고정 handoff status로 변경했습니다. 설치·업데이트·검증·
  migration·삭제 요청에 PATH, CLI, source resolver, filesystem을 검사하거나 명령을 실행하지 않고
  `VULPORA_OUT_OF_BAND_INSTALL_REQUIRED`를 반환합니다.
- 설치와 provenance 판정을 모델 세션 밖의 승인된 운영 절차로 이동했습니다. npm global, 사용자 공유
  디렉터리, plugin cache, project, source checkout 같은 path shape는 trust 근거로 취급하지 않습니다.
- Codex exact-HOME 예외를 제거했습니다. project/user와 Codex/Claude를 포함한 모든 scope/runtime setup은
  agent, skill, bundle, adapter, extra에 대해 완전한 zero-copy입니다.

### Fixed

- native plugin이 repository의 전체 `agents/`, `skills/`, script, hook, MCP를 재귀 노출할 수 있던 packaging
  경계를 두 개의 격리 package와 정확한 inventory allowlist로 닫았습니다.
- plugin cache, project-local executable, arbitrary checkout, matching content, self-authored receipt가 installer를
  self-authorize할 수 있던 경로를 제거했습니다. installer skill은 source를 찾지 않습니다.
- catalog agent discovery와 task execution을 모든 runtime에서 비활성화했습니다. repository의
  `codex-agent-runtime`은 native plugin에 포함되지 않는 negative-contract source로만 남습니다.
- Notion OAuth·MCP·live research를 비활성화했습니다. auth/status/research surface는 CLI·MCP·network를 호출하지
  않고 고정 `no_evidence` 또는 `secure_research_unavailable`을 반환합니다.
- legacy project/user copy를 내용 일치만으로 adopt·overwrite·delete하지 않고, 승인된 외부 provenance와
  snapshot을 독립 검증하지 못하면 보존하도록 했습니다.

### Security

- native plugin 설치·업데이트·삭제는 승인된 사람 또는 배포 자동화의 out-of-band change-control로만 수행합니다.
  status-only skill은 환경·source·filesystem을 읽거나 변경하지 않습니다.
- 모든 setup 경로에서 catalog copy가 0인지, 두 plugin이 각각 Skills(2)와 Agents/Scripts/Hooks/MCP(0)인지
  검증합니다.
- Notion 경로는 live Evidence Packet을 만들지 않습니다. 고정 `no_evidence` packet만 반환하고 OAuth, CLI,
  MCP, search/fetch, credential, live marker 접근이 0회인지 회귀 테스트로 검증합니다.

## [0.3.0.0] - 2026-07-15

> 이 버전에서 도입한 native agent 실행·OAuth onboarding 계약은 0.3.1.0에서 제거되었습니다. 현재 native
> integration은 두 runtime별 최소 status-only plugin과 모든 scope/runtime zero-copy 계약만 지원합니다.

### Added

- 공식 hosted Notion MCP에서 사내 도메인 근거를 읽기 전용으로 수집하는 `notion-domain-researcher`와
  `notion-domain-context` 스킬을 추가했습니다.
- Codex native custom agent TOML adapter, Claude Code 정의, provenance-rich Evidence Packet 계약,
  prompt-injection/stale/access-denied/invalid-scope 합성 eval을 추가했습니다.
- 최초 호출에서 Codex process-local MCP profile 또는 Claude inline agent MCP의 OAuth를 한 번 시작하는 멱등
  bootstrap과 mock CLI 회귀 테스트를 추가했습니다. OAuth 승인·SSO·MFA는 사용자가 완료합니다.
- 설치 → 최초 OAuth → discovery → live smoke → 업데이트와 copied → authenticated → live verified 판정을
  `notion-domain-context`의 단일 온보딩 가이드로 통합했습니다.
- “노션 에이전트 설치·설정·온보딩” 요청을 catalog installer로 라우팅하고 지식 검색 요청과 분리하는
  `vulpora-installer` 스킬, 최초 1회 bootstrap 문서, positive/negative skill replay를 추가했습니다.

### Changed

- 설치기가 명시적 `<agent>.codex.toml` adapter를 canonical `.md`·지식 번들·연계 스킬과 함께 설치하고
  누락을 검증합니다. adapter가 없는 기존 agent의 경로 동작은 유지됩니다.
- 설치 catalog에 선택적 onboarding runtime·hook·준비 자산을 선언하고, `--apply --onboard` 한 명령으로
  패키지 복사·구조 검증·최초 OAuth를 실행할 수 있게 했습니다. 일반 `--apply`는 인증을 호출하지 않습니다.
- Notion skill/agent description에 명시·암묵 호출과 비호출 경계를 넣고, OAuth bootstrap과 Codex adapter
  검증을 Bash 3.2+·표준 Unix 도구만으로 실행하도록 만들어 Python이 없는 환경도 같은 설치 경로를 지원합니다.
- 설치 전용 스킬이 `--apply --onboard notion-domain-researcher`를 선택하고, CI/headless·파일-only 요청에는
  `--apply`와 `--verify`만 선택하도록 trigger와 실행 분기를 명시했습니다.
- `INSTALL.md`에 Codex/Claude Code 60초 Quick Start와 문서별 정본 범위를 추가하고, README와 Notion
  온보딩 가이드의 중복 명령을 정리했습니다. target이 필요한 실행 모드는 `-t` 누락 시 복사 계획을 출력하기
  전에 정확한 오류로 종료합니다.

### Security

- `notion-domain-research` Codex process-local profile과 Codex/Claude agent tool surface를 search/fetch
  capability로 제한하고(OpenAI client naming alias 포함), URL/transport/header/bearer/allowlist 충돌을
  덮어쓰지 않도록 fail closed했습니다. Codex는 main config에 server를 쓰지 않고, 기존 profile이 활성화돼
  있으면 OAuth 전에 중단합니다. Claude도 inline subagent MCP만 사용해 main/project registry에 Notion을
  등록하지 않습니다.
- token·OAuth state·원문 전체·identity를 출력하지 않고, Notion 본문의 instruction을 untrusted data로
  격리하도록 계약과 적대적 eval을 추가했습니다.
- Codex adapter는 legacy `sandbox_mode`와 permission profile을 혼용하지 않고 workspace deny profile만
  사용하며, Claude agent frontmatter는 symlink·hook·추가 stdio MCP를 허용하지 않는 strict allowlist로
  검증합니다.
- onboarding 전 검증은 researcher 정의·Codex adapter·hook을 source catalog와 byte-for-byte로 대조하고,
  대상 프로젝트 밖의 symlink path나 구조적으로 유효한 prompt 본문 변조도 실행 전에 거부합니다.

## [0.2.0.0] - 2026-07-14

### Added

- Agent, skill, MCP의 경계·권한·보안·릴리스 게이트를 정한 canonical 설계 규칙을 추가했습니다.
- 현재 성숙도와 agent 생성 → 설계 → 설치 → 평가 → 운영 → 개선의 폐루프를 문서화했습니다.
- agent/skill 선택, 10개 필드 계약, KB routing·provenance·평가 증거를 다루는 구축 가이드를 추가했습니다.

### Changed

- 247개 topic KB와 32개 skill의 progressive-disclosure 경로를 감사하고, 모든 skill이 principles와 KB INDEX를 명시적으로 거치도록 정리했습니다.
- 기존 v1 `SOUL → principles → INDEX → topic KB` 구조는 유지하되 검증자·소유자·신뢰 상태 metadata와 canonical ownership을 다음 집행 단계로 정의했습니다.

### Fixed

- 21개 KB topic 표기를 클릭 가능한 링크로 바꾸고, 8개 리뷰 훅 제목과 Kotlin reviewer의 설치 경로를 정규화했습니다.
- 독립 실행형 `test-runner`가 지식 번들 예외인 이유를 표준과 정의 문서에 일치시켰습니다.
- `skill-updater`의 낡은 `.claude/skills`·필수 KO 번역본 규칙을 실제 source package·manifest·다중 runtime 설치 계약과 일치시켰습니다.

## [0.1.0.0] - 2026-07-14

### Added

- Codex 프로젝트와 개인 환경에 스킬을 공식 `.agents/skills/` 경로로 설치하고 실제 Codex CLI 탐색까지 검증할 수 있습니다.
- 스킬 간 의존성을 재귀적으로 설치·검증하고, 격리된 임시 환경에서 전체 설치 흐름을 회귀 테스트할 수 있습니다.
- Codex와 Claude Code의 clone, 프로젝트/개인 설치, 업데이트, 검증 절차를 한 문서에서 확인할 수 있습니다.

### Changed

- 스킬 매니페스트가 Codex 호환 frontmatter와 의존성 정합성을 외부 런타임 의존성 없이 검사합니다.

### Fixed

- 공식 validator를 막던 일부 스킬 frontmatter와 내부 reference 경로를 바로잡았습니다.
