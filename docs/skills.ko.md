# Vulpora 스킬 사용 가이드

한국어 · [English](skills.en.md) · [README](../README.ko.md)

설치 매니페스트에 등록된 **64개 스킬**의 용도와 호출 예제를 정리합니다. 이 중
`codex-agent-runtime`은 실행 기능이 비활성화된 호환성 항목입니다. 각 스킬 이름을 누르면 실제
`SKILL.md`의 입력, 절차, 출력 계약을 확인할 수 있습니다.

목록의 기준은 [설치 매니페스트](../install/manifest.txt)와
[설치 화면 카탈로그](../install/skill-catalog.txt)입니다. 설치에는 `vulpora` CLI를,
프로젝트 라우팅 초기화에는 `vulpora-init`을 사용합니다. 공개 버전의 식별자는 Vulpora로 통일합니다.

## 설치 명령과 스킬 호출

**터미널에서는 자산을 설치하고, Codex 또는 Claude Code 대화창에서는 스킬을 호출합니다.**
아래 터미널 명령은 이 저장소를 clone한 디렉터리에서 실행합니다. `/absolute/project`는
실제로 존재하는 작업 프로젝트의 절대 경로로 바꿉니다. macOS/Linux, Bash 3.2+, Git,
Node.js 18.18+와 사용할 런타임 CLI가 필요합니다.

```sh
# 설치 가능한 pack, agent, skill 확인
./vulpora list

# 필요한 pack과 스킬을 골라 설치: 먼저 변경 내용 확인
./vulpora setup --runtime codex --scope project --target /absolute/project --dry-run pack:core start-task kotlin-spring-review-workflow
./vulpora setup --runtime codex --scope project --target /absolute/project pack:core start-task kotlin-spring-review-workflow
./vulpora doctor --runtime codex --scope project --target /absolute/project pack:core start-task kotlin-spring-review-workflow

# Claude Code에 설치할 때
./vulpora setup --runtime claude-code --scope project --target /absolute/project pack:core start-task kotlin-spring-review-workflow

# 전체 스킬을 명시적으로 선택할 때
./vulpora setup --runtime codex --scope project --target /absolute/project all-skills

# 선택 제거: 설치 후 직접 수정한 파일은 보존
./vulpora uninstall --runtime codex --scope project --target /absolute/project kotlin-spring-review-workflow
```

`pack:<id>`는 관련 자산 묶음이고, `start-task` 같은 개별 ID도 선택할 수 있습니다. 설치기는
매니페스트의 `skill:`·`agent:` 의존성을 재귀적으로 함께 설치합니다. 예를 들어
`postgres-review-workflow`를 선택하면 PostgreSQL 리뷰 스킬과 `postgres-dba`,
`data-modeling-reviewer`가 함께 설치됩니다. `all-skills`에도 필수 에이전트가 포함될 수 있습니다.
스킬 디렉터리 하나만 수동 복사하면 이런 의존성이 빠질 수 있습니다.

설치 후 런타임을 재시작하고 대상 프로젝트를 열어 초기화합니다.

| 입력 위치 | 초기화 | 작업 요청 |
|---|---|---|
| Codex 대화창 | `$vulpora-init` | `$start-task "검색 실패 처리를 개선하고 관련 테스트를 추가해줘"` |
| Claude Code 대화창 | `/vulpora-init` | `/start-task "검색 실패 처리를 개선하고 관련 테스트를 추가해줘"` |

Codex는 `/skills`에서 설치된 스킬을 선택할 수도 있습니다. 아래 전체 카탈로그는 Codex의
`$스킬-ID` 형식으로 작성했습니다. 직접 설치한 Claude Code 스킬은 앞의 `$`를 `/`로 바꾸면 됩니다.
Claude marketplace plugin으로 설치했다면 런타임 메뉴에 표시된 실제 명령 이름을 선택하세요.
표의 작업 설명과 파일 경로는 예제 입력이며, 쉘 명령이나 고정된 CLI 인자가 아닙니다.

`vulpora-init`은 저장소의 기술 스택을 확인하고 루트 `AGENTS.md`의 라우팅 블록을 갱신합니다.
그다음에는 일반 구현 요청에서도 설치된 작성 스킬로 연결할 수 있습니다. 특정 검토나 결과물이
필요하면 스킬 ID와 대상 파일·모듈·기준 revision·원하는 결과물을 함께 적는 편이 명확합니다.

`start-task`에 명시적으로 지정할 수 있는 프로필은 다음 세 가지입니다. 자동 선택은 프로필 없이 호출합니다.

```text
$start-task --lightweight "버튼의 잘못된 링크를 수정해줘"
$start-task --standard "연결된 모듈의 API 계약과 테스트를 함께 수정해줘"
$start-task --audit "운영 데이터 마이그레이션 계획과 검증 근거를 감사해줘"
```

`--lightweight`, `--standard`, `--audit`는 `start-task` 바로 뒤에 하나만 놓습니다.
다른 스킬에 공통으로 적용되는 옵션은 아닙니다. 프로필과 실제 실행 조건은
[작업 오케스트레이션 가이드](start-task-orchestration.md), 모델 선택과 실행 확인의 차이는
[모델 라우팅 가이드](review-workflow-model-routing.md)를 참고하세요.

## 먼저 고를 스킬

| 하려는 일 | 시작점 | 설치 선택자 |
|---|---|---|
| 저장소 초기화 후 구현하기 | `vulpora-init` → `start-task` | `pack:core pack:orchestration` |
| 아이디어를 요구사항과 화면으로 구체화하기 | `product-requirements` → `product-ui-design` | `pack:product-discovery-ko pack:visual` |
| Kotlin/Java·Spring 코드 작성과 리뷰 | `kotlin-code-authoring`, 해당 언어의 통합 리뷰 | `pack:jvm-spring` |
| 아키텍처·테스트 품질 검토 | 해당 `*-workflow` | `pack:jvm-quality` |
| 보안·공용 리소스 위험 분석과 수정 | `security-scan-workflow` | `security-scan-workflow` |
| PostgreSQL·SQL Server·OpenSearch 작업 | 해당 `*-code-authoring`, `*-review-workflow` | `pack:postgres`, `pack:mssql`, `pack:opensearch` |
| API와 브라우저를 함께 검증하기 | `e2e-test-workflow` | `pack:qa-e2e` |
| 다이어그램·HTML·PDF 문서 만들기 | `visual-artifact-router` | `pack:visual` |
| 재사용 지식을 평가·관리하기 | `agent-eval`, `learn`, `knowledge-audit` | `pack:knowledge` |

14개 pack의 전체 정의는 [packs.txt](../install/packs.txt)에 있습니다. Pack에 없는 스킬도
개별 ID로 설치할 수 있습니다. `jvm-spring-postgres-opinionated`는 JPA 계층 구조와 PostgreSQL
명명 규약을 포함하는 선택 사항이므로 프로젝트 규칙과 맞는지 먼저 확인하세요.

## 전체 카탈로그

### 설치·라우팅·작업 시작 · 5개

| 스킬 | 용도 | 대화창 호출 예제 |
|---|---|---|
| [vulpora-init](../skills/vulpora-init/SKILL.md) | 기술 스택을 감지해 `AGENTS.md` 라우팅 지침 초기화·갱신 | `$vulpora-init` |
| [vulpora-installer](../skills/vulpora-installer/SKILL.md) | 에이전트·스킬·MCP 설치, 갱신, 점검, 제거 | `$vulpora-installer "이 프로젝트의 Codex에 pack:postgres를 설치하고 점검해줘"` |
| [code-authoring-router](../skills/code-authoring-router/SKILL.md) | 구현 요청을 저장소 스택에 맞는 작성 스킬로 연결 | `$code-authoring-router "검색 타임아웃 처리를 구현해줘"` |
| [start-task](../skills/start-task/SKILL.md) | 작업을 명확히 하고 필요한 수준으로 분해·구현·검증 | `$start-task "주문 취소 기능을 구현하고 검증해줘"` |
| [codex-agent-runtime](../skills/codex-agent-runtime/SKILL.md) | **비활성 호환성 항목**. 에이전트 실행 기능 없음 | `$codex-agent-runtime` → `AGENT_RUNTIME_ERROR:project_execution_disabled` |

### 제품 요구사항·UI · 2개

| 스킬 | 용도 | 대화창 호출 예제 |
|---|---|---|
| [product-requirements](../skills/product-requirements/SKILL.md) | 아이디어를 PRD, 인수 기준, 개발 handoff로 구체화 | `$product-requirements "팀 예약 관리 기능의 MVP PRD를 작성해줘"` |
| [product-ui-design](../skills/product-ui-design/SKILL.md) | 기존 디자인 언어에 맞춰 화면·흐름·상태를 설계, 구현, 리뷰 | `$product-ui-design "현재 컴포넌트로 예약 목록 화면을 구현해줘. 빈 상태와 오류 상태도 포함해줘"` |

### Kotlin·Spring 작성 · 10개

`entity`부터 `flyway`까지의 scaffold는 저장소의 기존 모듈·명명·계층 규약을 확인하고 사용합니다.

| 스킬 | 용도 | 대화창 호출 예제 |
|---|---|---|
| [kotlin-code-authoring](../skills/kotlin-code-authoring/SKILL.md) | 프로젝트 규약과 Kotlin 관용구를 반영한 구현·수정 | `$kotlin-code-authoring "OrderService의 취소 정책을 구현해줘"` |
| [entity](../skills/entity/SKILL.md) | schema-qualified JPA 엔티티와 식별자 구조 생성 | `$entity "기존 주문 도메인 규약에 맞춰 OrderItem 엔티티를 추가해줘"` |
| [enum](../skills/enum/SKILL.md) | 알 수 없는 값 fallback이 있는 공유 프로토콜 enum 생성 | `$enum "공유 모듈에 PaymentStatus enum을 추가해줘"` |
| [mapper](../skills/mapper/SKILL.md) | 도메인 모델과 JPA 엔티티 사이의 수동 mapper 작성 | `$mapper "Order와 OrderEntity 간 변환 mapper를 작성해줘"` |
| [repository](../skills/repository/SKILL.md) | Spring Data, JDBC bulk upsert, QueryDSL 접근 계층 생성 | `$repository "OrderEntity의 조회용 repository를 추가해줘"` |
| [request](../skills/request/SKILL.md) | Bean Validation이 적용된 REST 요청 DTO 생성 | `$request "주문 생성 API의 요청 DTO와 검증 규칙을 작성해줘"` |
| [response](../skills/response/SKILL.md) | 변환 factory와 pagination 규약을 따르는 응답 DTO 생성 | `$response "주문 목록 API의 응답 DTO를 작성해줘"` |
| [service](../skills/service/SKILL.md) | transaction 경계와 협력 규칙에 맞는 도메인 service 생성 | `$service "주문 조회와 취소의 도메인 service를 작성해줘"` |
| [flyway](../skills/flyway/SKILL.md) | 엔티티 변경과 함께 PostgreSQL Flyway migration 작성 | `$flyway "Order 엔티티 변경에 맞는 migration SQL을 작성해줘"` |
| [test-authoring](../skills/test-authoring/SKILL.md) | 계약·결정성·격리를 검증하는 Kotlin 단위·좁은 통합 테스트 작성 | `$test-authoring "OrderService의 취소 경계 조건을 테스트해줘"` |

### 보안·공유 데이터 안전성 · 1개

설치 시 필수 읽기 전용 `security-auditor`가 포함됩니다. 검토 요청은 읽기 전용으로 처리하고,
수정 요청은 소스 수정, 안전성을 확인한 오프라인 회귀 테스트와 독립 재검토까지 수행합니다.
인가·테넌트, 주입, SSRF, 파일, 설정·의존성, 자원 고갈과 DB·캐시·검색·큐·객체 저장소의
공유 영향 경로를 분석합니다. 취약점을 증명하려고 공유 서비스에 접속하지 않으며,
확인하지 못한 범위는 별도로 표시합니다.

| 스킬 | 용도 | 대화창 호출 예제 |
|---|---|---|
| [security-scan-workflow](../skills/security-scan-workflow/SKILL.md) | 다양한 취약점과 공용 리소스 영향 분석, 요청 시 수정·검증 | `$security-scan-workflow "다양한 보안 취약점을 분석하고 공용 리소스 위험 코드를 수정·검증해줘"` |

### 코드·설계·테스트 품질 리뷰 · 12개

통합 리뷰에는 대상 파일·모듈 또는 diff 범위와 비교 기준을 전달합니다. 리뷰만 요청하면
코드를 수정하지 않습니다. 전문 에이전트를 실행하는 workflow는 런타임에서 해당 에이전트와
명시적인 모델 경로를 사용할 수 있어야 합니다.

| 스킬 | 용도 | 대화창 호출 예제 |
|---|---|---|
| [architecture-review-workflow](../skills/architecture-review-workflow/SKILL.md) | 시스템·애플리케이션·DDD·코드 의존성을 통합 검토 | `$architecture-review-workflow "api와 domain 모듈의 경계 및 데이터 소유권을 검토해줘"` |
| [backend-code-review-workflow](../skills/backend-code-review-workflow/SKILL.md) | Kotlin/Spring·리팩터링·패턴·OOP·보안 리뷰 취합 | `$backend-code-review-workflow "main 대비 현재 브랜치의 백엔드 변경을 리뷰해줘"` |
| [java-spring-review-workflow](../skills/java-spring-review-workflow/SKILL.md) | Java/Spring·OOP·디자인 패턴의 병렬 리뷰와 판정 | `$java-spring-review-workflow "결제 모듈의 Java 변경을 main 기준으로 리뷰해줘"` |
| [kotlin-spring-review-workflow](../skills/kotlin-spring-review-workflow/SKILL.md) | Kotlin/Spring·OOP·패턴·리팩터링 관점의 통합 리뷰 | `$kotlin-spring-review-workflow "주문 모듈의 현재 diff를 리뷰해줘"` |
| [kotlin-spring-review](../skills/kotlin-spring-review/SKILL.md) | Kotlin/Spring 정확성, 구조, transaction, JPA 규칙 검토 | `$kotlin-spring-review "OrderService.kt의 transaction 경계를 리뷰해줘"` |
| [oop-design-review](../skills/oop-design-review/SKILL.md) | SOLID·GRASP·응집도·캡슐화 검토 | `$oop-design-review "결제 정책 클래스들의 책임 분배를 검토해줘"` |
| [design-pattern-apply](../skills/design-pattern-apply/SKILL.md) | 실제 변경 축에 맞는 패턴의 필요성과 적용 방법 판단 | `$design-pattern-apply "배송 정책 분기에 Strategy가 필요한지 판단해줘"` |
| [refactoring-catalog](../skills/refactoring-catalog/SKILL.md) | 코드 냄새에 맞는 리팩터링 기법·순서·검증 제안 | `$refactoring-catalog "OrderService의 중복 분기를 줄일 절차를 제안해줘"` |
| [explore-dead-code](../skills/explore-dead-code/SKILL.md) | 미참조 코드 후보를 묶음 검색해 근거·신뢰도로 보고하며 간접 등록·외부 API는 추가 확인 대상으로 유지, 삭제 없음 | `$explore-dead-code "src에서 참조가 없는 코드 후보를 빠르게 찾고 삭제 없이 근거와 신뢰도를 보고해줘"` |
| [test-quality-review](../skills/test-quality-review/SKILL.md) | 기존 테스트의 oracle·경계·격리·결함 탐지력 감사 | `$test-quality-review "OrderServiceTest의 실제 결함 탐지력을 리뷰해줘"` |
| [test-refactoring](../skills/test-refactoring/SKILL.md) | 검증된 finding에 한해 Kotlin/JVM 테스트·fixture 개선 | `$test-refactoring "첨부한 품질 finding을 OrderServiceTest와 fixture 범위에서 수정해줘"` |
| [test-quality-refactoring-workflow](../skills/test-quality-refactoring-workflow/SKILL.md) | 품질 감사부터 테스트 개선·결함 탐지·실행 근거 재검증까지 조정 | `$test-quality-refactoring-workflow "주문 모듈의 Kotlin 테스트 품질을 검토하고 test와 fixture 범위에서 개선해줘"` |

### 데이터베이스·검색 · 12개

SQL·mapping 작성과 리뷰는 제공된 코드·스키마·실행 계획을 사용할 수 있습니다. 데이터베이스에
접속해 실제 조회 결과를 얻는 `nl-sql-query`에는 아래 별도 MCP 설정이 필요합니다.

| 스킬 | 용도 | 대화창 호출 예제 |
|---|---|---|
| [postgres-code-authoring](../skills/postgres-code-authoring/SKILL.md) | 검증 계획과 운영 위험을 포함한 PostgreSQL query·schema·migration 작성 | `$postgres-code-authoring "주문 목록의 keyset pagination SQL을 작성해줘"` |
| [postgres-query-review](../skills/postgres-query-review/SKILL.md) | 실행 계획·인덱스·join·pagination 검토 | `$postgres-query-review "이 SQL과 EXPLAIN 결과에서 느린 지점을 찾아줘"` |
| [postgres-schema-design](../skills/postgres-schema-design/SKILL.md) | 무결성·제약조건·이력·명명 규칙에 맞는 스키마 설계 | `$postgres-schema-design "예약 중복을 막는 제약조건과 테이블을 설계해줘"` |
| [postgres-risk-check](../skills/postgres-risk-check/SKILL.md) | lock·동시성·운영 migration 위험 점검 | `$postgres-risk-check "첨부한 migration의 lock과 배포 위험을 점검해줘"` |
| [postgres-review-workflow](../skills/postgres-review-workflow/SKILL.md) | query·schema·변경 위험·DBA·데이터 모델 리뷰 취합 | `$postgres-review-workflow "이번 주문 스키마 변경과 관련 SQL을 통합 리뷰해줘"` |
| [mssql-code-authoring](../skills/mssql-code-authoring/SKILL.md) | 실제 SQL Server 버전·호환성 수준에 맞는 T-SQL·migration 작성 | `$mssql-code-authoring "저장소의 SQL Server 버전과 호환성 수준을 확인하고 페이지 조회 SQL을 작성해줘"` |
| [opensearch-code-authoring](../skills/opensearch-code-authoring/SKILL.md) | mapping·Query DSL·vector/hybrid·reindex 전환 작성 | `$opensearch-code-authoring "상품 검색의 mapping과 hybrid 검색 쿼리를 작성해줘"` |
| [opensearch-query-review](../skills/opensearch-query-review/SKILL.md) | Query DSL 정확성·비용·관련성·pagination 위험 검토 | `$opensearch-query-review "첨부한 상품 검색 DSL을 리뷰해줘"` |
| [opensearch-schema-review](../skills/opensearch-schema-review/SKILL.md) | mapping·analyzer·dynamic field·vector schema 검토 | `$opensearch-schema-review "상품 index mapping의 analyzer와 필드 확장 위험을 검토해줘"` |
| [opensearch-optimization](../skills/opensearch-optimization/SKILL.md) | shard·refresh·cache·vector 설정의 성능 개선안 | `$opensearch-optimization "첨부한 index 설정과 지연 측정값으로 개선안을 제안해줘"` |
| [opensearch-review-workflow](../skills/opensearch-review-workflow/SKILL.md) | 쿼리·스키마·최적화 관점의 통합 검색 리뷰 | `$opensearch-review-workflow "상품 검색의 DSL, mapping, index 설정을 함께 리뷰해줘"` |
| [nl-sql-query](../skills/nl-sql-query/SKILL.md) | 연결된 PostgreSQL/MySQL/SQL Server에 읽기 전용 자연어 SQL 조회 | `$nl-sql-query "지난 7일 주문 수를 상태별로 조회하고 사용한 SQL도 보여줘"` |

### QA·E2E · 5개

| 스킬 | 용도 | 대화창 호출 예제 |
|---|---|---|
| [e2e-scenario-author](../skills/e2e-scenario-author/SKILL.md) | Spring JVM·NestJS의 진입점에서 E2E 카탈로그 생성·갱신 | `$e2e-scenario-author "현재 API 변경에 맞춰 E2E 시나리오 카탈로그를 갱신해줘"` |
| [e2e-runner](../skills/e2e-runner/SKILL.md) | 격리된 Testcontainers 환경에서 API·통합 테스트 실행 | `$e2e-runner "주문 취소 통합 테스트를 실행하고 결과를 알려줘"` |
| [playwright-e2e](../skills/playwright-e2e/SKILL.md) | QA 시나리오에 따라 브라우저 실행·데이터 정리·증거 기록 | `$playwright-e2e "첨부한 QA handoff의 TC-CHECKOUT-001을 실행해줘"` |
| [e2e-report-renderer](../skills/e2e-report-renderer/SKILL.md) | 완료된 runner JSON을 단일 실행·추세·비교 HTML로 변환 | `$e2e-report-renderer "완료된 test-report/e2e 실행 두 건을 비교하는 HTML을 만들어줘"` |
| [e2e-test-workflow](../skills/e2e-test-workflow/SKILL.md) | 카탈로그·API·브라우저·HTML 단계를 하나의 환경에서 조정 | `$e2e-test-workflow "주문 시나리오를 갱신하고 API와 QA handoff의 브라우저 케이스를 실행한 뒤 HTML 보고서를 저장해줘"` |

### 문서·다이어그램·시각 산출물 · 9개

| 스킬 | 용도 | 대화창 호출 예제 |
|---|---|---|
| [code-diagram-extract](../skills/code-diagram-extract/SKILL.md) | 실제 파일·라인과 연결된 실행 흐름 Mermaid 추출 | `$code-diagram-extract "주문 생성 진입점부터 결제 호출까지 sequence diagram으로 설명해줘"` |
| [schema-doc-extract](../skills/schema-doc-extract/SKILL.md) | migration·ORM을 정적으로 분석해 ERD와 테이블 명세 생성 | `$schema-doc-extract "Flyway와 엔티티에서 ERD와 테이블 명세를 갱신해줘"` |
| [mermaid-diagrams](../skills/mermaid-diagrams/SKILL.md) | 구조·흐름·sequence·state·ER의 편집 가능한 Mermaid 원본 작성 | `$mermaid-diagrams "주문 상태 전이를 Mermaid 원본으로 작성해줘"` |
| [diagram-styler](../skills/diagram-styler/SKILL.md) | 기존 `.mmd`를 접근성 정보와 manifest를 갖춘 SVG로 렌더링 | `$diagram-styler "docs/order-flow.mmd를 밝은 문서용 SVG로 렌더링해줘"` |
| [document-designer](../skills/document-designer/SKILL.md) | 제공된 내용의 구조·위계·표·캡션을 편집 가능한 Markdown으로 설계 | `$document-designer "docs/decision.md를 의사결정 문서로 읽기 좋게 정리해줘"` |
| [markdown-publisher](../skills/markdown-publisher/SKILL.md) | Markdown을 독립 HTML과 선택적 PDF로 출판 | `$markdown-publisher "docs/decision.md를 technical 테마의 HTML과 PDF로 만들어줘"` |
| [pdf-qa](../skills/pdf-qa/SKILL.md) | PDF 모든 페이지의 렌더 이미지와 시각 검사 근거 검증 | `$pdf-qa "artifacts/decision.pdf의 모든 페이지를 시각 검수해줘. 원본은 docs/decision.md야"` |
| [visual-artifact-router](../skills/visual-artifact-router/SKILL.md) | 문서·다이어그램 요청을 필요한 설계·렌더·QA 스킬로 연결 | `$visual-artifact-router "아키텍처 설명을 편집 가능한 원본과 공유용 HTML로 만들어줘"` |
| [korean-dev-writer](../skills/korean-dev-writer/SKILL.md) | 사실을 유지하며 한국어 기술 문서·PR·리뷰·주석 작성·교정 | `$korean-dev-writer "README의 번역투를 줄이고 기술 설명을 명확하게 다듬어줘"` |

### 평가·지식·회고·협업 · 8개

| 스킬 | 용도 | 대화창 호출 예제 |
|---|---|---|
| [agent-eval](../skills/agent-eval/SKILL.md) | 스킬·에이전트의 품질·보안·반례를 검증하고 평가표 생성 | `$agent-eval "skills/flyway를 평가하고 실제 실행 범위를 밝혀줘"` |
| [skill-updater](../skills/skill-updater/SKILL.md) | portable 스킬 구조·지식 출처·버전 규약에 따라 생성·갱신 | `$skill-updater "skills/postgres-query-review의 발동 조건을 명확히 하고 검증해줘"` |
| [learn](../skills/learn/SKILL.md) | 작업에서 재사용할 교훈을 추출하고 승인된 지식 저장 | `$learn "이번 장애 분석에서 다음 작업에도 쓸 교훈을 정리해줘"` |
| [retro](../skills/retro/SKILL.md) | 완료한 작업을 Keep·Problem·Try로 회고하고 개선안 도출 | `$retro "방금 완료한 검색 개선 작업을 회고해줘"` |
| [knowledge-audit](../skills/knowledge-audit/SKILL.md) | 자동 수집 지식을 현재 코드와 대조해 승격·폐기·보류 | `$knowledge-audit ".claude/knowledge/auto의 후보를 검증하고 정리해줘"` |
| [harness-propose](../skills/harness-propose/SKILL.md) | 최신 자료와 현재 하네스를 비교해 HTML 개선 제안 작성 | `$harness-propose "현재 하네스에서 다음에 개선할 항목을 조사해줘"` |
| [git-flow](../skills/git-flow/SKILL.md) | 작업 branch 준비 또는 커밋·push·GitLab MR 생성 | `$git-flow "현재 기능 변경을 검토해 커밋하고 develop 대상 GitLab MR을 만들어줘"` |
| [notion-domain-context](../skills/notion-domain-context/SKILL.md) | 연결된 사내 Notion의 읽기 전용 출처 기반 조사 | `$notion-domain-context "Notion에서 주문 취소 정책과 담당 조직의 근거를 찾아줘"` |

## 외부 도구가 필요한 스킬

설치기는 스킬과 선언된 자산 의존성을 복사합니다. 데이터베이스 계정, MCP 인증, Docker,
브라우저, 모델 제공자 인증까지 자동으로 준비하지는 않습니다.

| 대상 | 필요한 준비 | 결과를 읽을 때 확인할 점 |
|---|---|---|
| 전문 에이전트가 필요한 통합 리뷰·`start-task` 위임 | 실제 런타임에서 발견된 에이전트와 사용 가능한 모델/effort 경로 | 설치 성공이나 route 계산만으로 작업이 실행된 것은 아닙니다. 필수 실행이 빠지면 `INCOMPLETE`/`BLOCKED`입니다. |
| `nl-sql-query` | 별도 `nl-sql` MCP 빌드·등록, 대상 DB의 읽기 전용 계정, 비어 있지 않은 schema allowlist | PostgreSQL/MySQL/SQL Server 중 서버 인스턴스당 한 dialect를 사용합니다. SQL Server의 `explain_select`는 미지원입니다. |
| `notion-domain-context` | Notion MCP 설정과 OAuth, 허용된 search/fetch 도구. Claude Code는 `notion-domain-researcher`도 필요 | 설정 완료·승인·인증·실제 검색 성공을 구분합니다. |
| `e2e-scenario-author`, `e2e-runner` | 지원되는 Spring Boot/JVM 또는 NestJS 저장소, 실행 시 Docker와 Testcontainers 및 프로젝트 빌드 도구 | 공유 Compose 환경을 재사용하지 않습니다. 일반 실행은 임시 결과를 사용하며, 보고서 저장은 명시적으로 요청합니다. |
| `playwright-e2e` | Playwright dependency·config·browser, Node Testcontainers, QA case ID·seed·cleanup·absence probe | 실행별 임시 앱과 데이터 정리 근거가 필요합니다. 기존 운영/공유 서버의 `baseURL`을 사용하지 않습니다. |
| `e2e-report-renderer` | `.done` 표시가 있는 완료된 `test-report/e2e` runner JSON | 브라우저 E2E의 별도 JSON을 합치는 renderer는 아닙니다. 입력을 바꾸지 않고 HTML을 만듭니다. |
| `diagram-styler` | 미리 설치한 Mermaid CLI `mmdc`와 작동하는 renderer 환경; 필요하면 `MMDC_BIN` 지정 | 스킬은 실행 중 renderer를 다운로드하지 않습니다. `.mmd`, SVG, manifest를 함께 보존합니다. |
| `markdown-publisher`, `pdf-qa` | HTML은 Node.js, PDF 생성은 로컬 Chromium 계열 브라우저, PDF 검수는 Python 3·Poppler·이미지 확인 도구 | `pdfinfo`와 `pdftocairo` 또는 `pdftoppm`이 필요합니다. 렌더 성공 후에도 모든 페이지의 시각 검수가 필요합니다. |
| `agent-eval` | 스킬의 wrapper가 고정한 SkillEvaluator CLI. 보안·상위 tier에는 해당 scanner·provider·dataset·sandbox 추가 | 기본 Tier 1은 keyless 정적 평가입니다. 설치 또는 정적 통과가 실제 모델 성능을 증명하지는 않습니다. |
| `git-flow` | GitLab remote와 인증된 전송 수단, 적절한 작업 branch 및 대상 branch | 기본 target은 `develop`입니다. GitHub PR 생성 스킬로 설명하지 않습니다. |
| `learn`, `retro`, `knowledge-audit`, `harness-propose` | 스킬이 사용하는 `.claude/knowledge/`, `.claude/retro/` 등 프로젝트 지식 구조 | 설치만으로 자동 학습 hook이 켜지지 않습니다. `learn`·회고 개선 반영·하네스 반영은 해당 스킬의 승인 계약을 따릅니다. |

### 자연어 SQL의 별도 MCP 설치

저장소 루트에서 템플릿과 스킬을 선택합니다.

```sh
./vulpora setup --runtime codex --scope project --target /absolute/project nl-sql-mcp nl-sql-query
cd /absolute/project/mcp/nl-sql
npm install
npm run build
cp nl-sql.config.example.json nl-sql.config.json
```

로컬 설정 파일에 실제 DB 접속 정보와 `allowedSchemas`를 입력하고, 사용하는 런타임에
`dist/index.js`를 MCP 서버로 등록합니다. 접속 정보는 커밋하지 않습니다. 실제 테이블은
`schema.table`로 한정하며, SQL Server는 읽기 전용 로그인 권한이 특히 중요합니다.
설정 예제와 Claude `.mcp.json` 등록 방법은 [nl-sql 가이드](../mcp/nl-sql/README.md)에 있습니다.
`nl-sql`은 `vulpora mcp install`의 원격 MCP pack과 별개인 로컬 서버 템플릿입니다.

### Notion 설치와 첫 사용

다음은 Claude Code의 user scope 예제입니다. Codex에서는 `--runtime codex`로 바꿉니다.

```sh
./vulpora setup --runtime claude-code --scope user notion-domain-context notion-domain-researcher
./vulpora mcp install --runtime claude-code --scope user notion
./vulpora mcp status --runtime claude-code --scope user notion
```

설치 시 OAuth는 보류됩니다. 새 세션에서 `notion-domain-context`를 처음 호출하면 필요한
인증 경로로 연결됩니다. 지금 인증하려면 명시적으로 다음 명령을 실행하고 브라우저에서 승인합니다.
Project scope의 Claude MCP가 `Pending approval`이면 해당 세션의 `/mcp` 승인도 필요합니다.

```sh
./vulpora mcp login --runtime claude-code --scope user notion
```

Codex의 `.agents/skills` 또는 Claude의 `.claude/skills`에 파일이 있어도 현재 세션에
자동으로 반영된다고 가정하지 마세요. 스킬이나 도구가 보이지 않으면 설치한 scope와
`doctor` 결과를 확인하고 새 런타임 세션을 시작합니다. 나머지 설치·삭제·MCP 문제 해결은
[설치 가이드](../INSTALL.md)를 참고하세요.
