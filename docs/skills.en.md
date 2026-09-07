# Vulpora skill handbook

[한국어](skills.ko.md) · English · [README](../README.md)

This handbook covers the purpose and invocation of all **62 skills** in the installation manifest.
One entry, `codex-agent-runtime`, is a disabled compatibility contract. Each skill name links to its
actual `SKILL.md`, which defines the inputs, procedure, and expected output.

The inventory comes from the [installation manifest](../install/manifest.txt) and
[installer catalog](../install/skill-catalog.txt). Use the `vulpora` CLI for installation and
`vulpora-init` to initialize project routing. The public release uses one Vulpora namespace.

## Install in a terminal; invoke in a coding session

Run the following shell commands from a clone of this repository. Replace `/absolute/project` with
an existing target project's absolute path. Installation requires macOS/Linux, Bash 3.2+, Git,
Node.js 18.18+, and the CLI for your chosen coding runtime.

```sh
# List available packs, agents, and skills
./vulpora list

# Select a small set, preview the changes, install, and verify
./vulpora setup --runtime codex --scope project --target /absolute/project --dry-run pack:core start-task kotlin-spring-review-workflow
./vulpora setup --runtime codex --scope project --target /absolute/project pack:core start-task kotlin-spring-review-workflow
./vulpora doctor --runtime codex --scope project --target /absolute/project pack:core start-task kotlin-spring-review-workflow

# Install the same selection for Claude Code
./vulpora setup --runtime claude-code --scope project --target /absolute/project pack:core start-task kotlin-spring-review-workflow

# Explicitly select every skill
./vulpora setup --runtime codex --scope project --target /absolute/project all-skills

# Remove a selection; preserve files edited after installation
./vulpora uninstall --runtime codex --scope project --target /absolute/project kotlin-spring-review-workflow
```

`pack:<id>` selects a related group of assets. Individual IDs such as `start-task` also work.
The installer recursively resolves declared `skill:` and `agent:` dependencies. For example,
`postgres-review-workflow` brings its PostgreSQL review skills, `postgres-dba`, and
`data-modeling-reviewer`. Selecting `all-skills` can therefore also install required agents.
Copying a single skill directory manually can leave these dependencies missing.

Restart the runtime after installation, open the target project, and initialize routing.

| Input surface | Initialize | Request work |
|---|---|---|
| Codex conversation | `$vulpora-init` | `$start-task "Improve search failure handling and add relevant tests"` |
| Claude Code conversation | `/vulpora-init` | `/start-task "Improve search failure handling and add relevant tests"` |

In Codex, you can also select an installed skill from `/skills`. The catalog below uses Codex's
`$skill-id` notation. For directly installed Claude Code skills, replace the leading `$` with `/`.
For a Claude marketplace plugin installation, select the actual command name shown in the runtime
menu. Task descriptions and file paths in the examples are prompt input, not shell commands or a
fixed argument parser.

`vulpora-init` detects repository stack evidence and updates its routing block in the root
`AGENTS.md`. Ordinary implementation requests can then route to installed authoring skills.
For a specific review or artifact, name the skill and supply the relevant files, module, baseline
revision, and desired output.

`start-task` also accepts three explicit execution profiles. Omit the profile for automatic selection.

```text
$start-task --lightweight "Fix the button's incorrect link"
$start-task --standard "Update this API contract and tests across the coupled modules"
$start-task --audit "Audit the production data migration plan and verification evidence"
```

Place exactly one of `--lightweight`, `--standard`, or `--audit` immediately after `start-task`.
These are not shared options for other skills. See [task orchestration](start-task-orchestration.md)
for execution profiles and [model routing](review-workflow-model-routing.md) for the distinction
between choosing a model and proving that a task actually ran with it.

## Pick a starting point

| Work | Start with | Install selectors |
|---|---|---|
| Initialize a repository and implement a change | `vulpora-init` → `start-task` | `pack:core pack:orchestration` |
| Turn an idea into requirements and an interface | `product-requirements` → `product-ui-design` | `pack:product-discovery-ko pack:visual` |
| Write and review Kotlin/Java with Spring | `kotlin-code-authoring`, the language's review workflow | `pack:jvm-spring` |
| Review architecture, security, or test quality | The corresponding `*-workflow` | `pack:jvm-quality` |
| Work on PostgreSQL, SQL Server, or OpenSearch | The corresponding authoring/review skills | `pack:postgres`, `pack:mssql`, `pack:opensearch` |
| Verify APIs and browser flows together | `e2e-test-workflow` | `pack:qa-e2e` |
| Produce diagrams, HTML, and PDF documents | `visual-artifact-router` | `pack:visual` |
| Evaluate and maintain reusable knowledge | `agent-eval`, `learn`, `knowledge-audit` | `pack:knowledge` |

All 14 packs are defined in [packs.txt](../install/packs.txt). Skills outside a pack can still be
installed by their individual IDs. `jvm-spring-postgres-opinionated` is an optional collection of
JPA layering and PostgreSQL naming conventions; review them against your project's rules before adoption.

## Complete catalog

### Installation, routing, and task entry · 5

| Skill | Purpose | Conversation example |
|---|---|---|
| [vulpora-init](../skills/vulpora-init/SKILL.md) | Detect the stack and initialize or refresh routing guidance in `AGENTS.md` | `$vulpora-init` |
| [vulpora-installer](../skills/vulpora-installer/SKILL.md) | Install, update, verify, or remove agents, skills, and MCP packs | `$vulpora-installer "Install and verify pack:postgres for Codex in this project"` |
| [code-authoring-router](../skills/code-authoring-router/SKILL.md) | Route implementation work to authoring skills supported by repository evidence | `$code-authoring-router "Implement search timeout handling"` |
| [start-task](../skills/start-task/SKILL.md) | Clarify, coordinate, implement, and verify work with an appropriate execution profile | `$start-task "Implement order cancellation and verify the behavior"` |
| [codex-agent-runtime](../skills/codex-agent-runtime/SKILL.md) | **Disabled compatibility entry**; does not execute agents | `$codex-agent-runtime` → `AGENT_RUNTIME_ERROR:project_execution_disabled` |

### Product requirements and UI · 2

| Skill | Purpose | Conversation example |
|---|---|---|
| [product-requirements](../skills/product-requirements/SKILL.md) | Develop an idea into a PRD, acceptance criteria, and implementation handoff | `$product-requirements "Write an MVP PRD for team reservation management"` |
| [product-ui-design](../skills/product-ui-design/SKILL.md) | Design, implement, or review interfaces, flows, and states using the existing design language | `$product-ui-design "Implement the reservation list with existing components, including empty and error states"` |

### Kotlin and Spring authoring · 10

Use the scaffold skills from `entity` through `flyway` after checking the repository's actual modules,
naming conventions, and architectural rules.

| Skill | Purpose | Conversation example |
|---|---|---|
| [kotlin-code-authoring](../skills/kotlin-code-authoring/SKILL.md) | Implement or modify Kotlin using project conventions and readable idioms | `$kotlin-code-authoring "Implement the cancellation policy in OrderService"` |
| [entity](../skills/entity/SKILL.md) | Scaffold schema-qualified JPA entities and identifier structures | `$entity "Add an OrderItem entity following the existing order domain conventions"` |
| [enum](../skills/enum/SKILL.md) | Scaffold a shared protocol enum with an unknown-value fallback | `$enum "Add PaymentStatus to the shared module"` |
| [mapper](../skills/mapper/SKILL.md) | Write manual Kotlin mapping between domain models and JPA entities | `$mapper "Write the mapper between Order and OrderEntity"` |
| [repository](../skills/repository/SKILL.md) | Scaffold Spring Data, JDBC bulk-upsert, or QueryDSL persistence access | `$repository "Add a query repository for OrderEntity"` |
| [request](../skills/request/SKILL.md) | Scaffold REST request DTOs with Bean Validation | `$request "Write the create-order request DTO and validation rules"` |
| [response](../skills/response/SKILL.md) | Scaffold response DTOs with conversion factories and pagination conventions | `$response "Write the order-list response DTO"` |
| [service](../skills/service/SKILL.md) | Scaffold domain services with transaction and collaboration boundaries | `$service "Write the domain service for reading and cancelling orders"` |
| [flyway](../skills/flyway/SKILL.md) | Author a PostgreSQL Flyway migration alongside the entity change | `$flyway "Write the migration SQL for this Order entity change"` |
| [test-authoring](../skills/test-authoring/SKILL.md) | Write deterministic, isolated Kotlin unit and narrow integration tests against real contracts | `$test-authoring "Test OrderService cancellation boundary cases"` |

### Code, design, and test quality review · 11

Supply target files, modules, or a diff range and baseline for consolidated reviews. Review-only
requests do not authorize code changes. Workflows that dispatch specialists require those agents
and an explicit model route to be available in the current runtime.

| Skill | Purpose | Conversation example |
|---|---|---|
| [architecture-review-workflow](../skills/architecture-review-workflow/SKILL.md) | Combine system, application, DDD, and code-dependency evidence | `$architecture-review-workflow "Review the api/domain boundaries and data ownership"` |
| [backend-code-review-workflow](../skills/backend-code-review-workflow/SKILL.md) | Reconcile Kotlin/Spring, refactoring, patterns, OOP, and security reviews | `$backend-code-review-workflow "Review this branch's backend changes against main"` |
| [java-spring-review-workflow](../skills/java-spring-review-workflow/SKILL.md) | Run and reconcile Java/Spring, OOP, and design-pattern review passes | `$java-spring-review-workflow "Review the payment module's Java changes against main"` |
| [kotlin-spring-review-workflow](../skills/kotlin-spring-review-workflow/SKILL.md) | Consolidate Kotlin/Spring, OOP, pattern, and refactoring findings | `$kotlin-spring-review-workflow "Review the current order-module diff"` |
| [kotlin-spring-review](../skills/kotlin-spring-review/SKILL.md) | Review Kotlin/Spring correctness, structure, transactions, and JPA usage | `$kotlin-spring-review "Review the transaction boundaries in OrderService.kt"` |
| [oop-design-review](../skills/oop-design-review/SKILL.md) | Assess SOLID, GRASP, cohesion, and encapsulation | `$oop-design-review "Review responsibility allocation across the payment policy classes"` |
| [design-pattern-apply](../skills/design-pattern-apply/SKILL.md) | Assess whether a pattern fits a real axis of change and how to apply it | `$design-pattern-apply "Assess whether these shipping policy branches need Strategy"` |
| [refactoring-catalog](../skills/refactoring-catalog/SKILL.md) | Select behavior-preserving refactoring steps and verification for code smells | `$refactoring-catalog "Propose steps to reduce duplicate branches in OrderService"` |
| [test-quality-review](../skills/test-quality-review/SKILL.md) | Audit test oracles, boundaries, isolation, and fault detection | `$test-quality-review "Review whether OrderServiceTest detects plausible defects"` |
| [test-refactoring](../skills/test-refactoring/SKILL.md) | Improve Kotlin/JVM tests and fixtures only for validated quality findings | `$test-refactoring "Fix the attached findings within OrderServiceTest and its fixtures"` |
| [test-quality-refactoring-workflow](../skills/test-quality-refactoring-workflow/SKILL.md) | Coordinate quality auditing, test-side improvements, negative proof, and fresh execution | `$test-quality-refactoring-workflow "Review and improve the order module's Kotlin tests, limiting edits to tests and fixtures"` |

### Databases and search · 12

Authoring and review skills can work from supplied source, schemas, and execution plans. Obtaining
live query results through `nl-sql-query` requires the separate MCP setup below.

| Skill | Purpose | Conversation example |
|---|---|---|
| [postgres-code-authoring](../skills/postgres-code-authoring/SKILL.md) | Author PostgreSQL queries, schemas, and migrations with risk and verification plans | `$postgres-code-authoring "Write keyset pagination SQL for the order list"` |
| [postgres-query-review](../skills/postgres-query-review/SKILL.md) | Review execution plans, indexes, joins, and pagination | `$postgres-query-review "Find bottlenecks in this SQL and its EXPLAIN output"` |
| [postgres-schema-design](../skills/postgres-schema-design/SKILL.md) | Design schemas with explicit integrity, constraints, history, and naming | `$postgres-schema-design "Design reservation tables and constraints preventing duplicate bookings"` |
| [postgres-risk-check](../skills/postgres-risk-check/SKILL.md) | Assess locks, concurrency, and operational migration risk | `$postgres-risk-check "Check the attached migration for lock and deployment risks"` |
| [postgres-review-workflow](../skills/postgres-review-workflow/SKILL.md) | Reconcile query, schema, risk, DBA, and data-model reviews | `$postgres-review-workflow "Review the order schema change and its related SQL together"` |
| [mssql-code-authoring](../skills/mssql-code-authoring/SKILL.md) | Author T-SQL and migrations for the verified SQL Server version and compatibility level | `$mssql-code-authoring "Check the repository's SQL Server version and compatibility level, then write the paginated query"` |
| [opensearch-code-authoring](../skills/opensearch-code-authoring/SKILL.md) | Author mappings, Query DSL, vector/hybrid settings, and reindex transitions | `$opensearch-code-authoring "Write a product index mapping and hybrid search query"` |
| [opensearch-query-review](../skills/opensearch-query-review/SKILL.md) | Review DSL correctness, cost, relevance, and pagination risk | `$opensearch-query-review "Review the attached product-search DSL"` |
| [opensearch-schema-review](../skills/opensearch-schema-review/SKILL.md) | Review mappings, analyzers, dynamic fields, and vector schemas | `$opensearch-schema-review "Review analyzers and field-growth risk in the product mapping"` |
| [opensearch-optimization](../skills/opensearch-optimization/SKILL.md) | Propose shard, refresh, cache, and vector performance improvements | `$opensearch-optimization "Propose improvements from these index settings and latency measurements"` |
| [opensearch-review-workflow](../skills/opensearch-review-workflow/SKILL.md) | Consolidate query, schema, and optimization reviews | `$opensearch-review-workflow "Review the product DSL, mapping, and index settings together"` |
| [nl-sql-query](../skills/nl-sql-query/SKILL.md) | Query a connected PostgreSQL/MySQL/SQL Server database in natural language, read-only | `$nl-sql-query "Show order counts by status for the last 7 days and include the SQL used"` |

### QA and E2E · 5

| Skill | Purpose | Conversation example |
|---|---|---|
| [e2e-scenario-author](../skills/e2e-scenario-author/SKILL.md) | Generate or refresh a scenario catalog from Spring JVM or NestJS entry points | `$e2e-scenario-author "Refresh the E2E scenario catalog for the current API changes"` |
| [e2e-runner](../skills/e2e-runner/SKILL.md) | Run API or integration tests in an isolated Testcontainers environment | `$e2e-runner "Run the order-cancellation integration tests and report the result"` |
| [playwright-e2e](../skills/playwright-e2e/SKILL.md) | Execute QA browser scenarios with owned data, cleanup, and evidence | `$playwright-e2e "Execute TC-CHECKOUT-001 from the attached QA handoff"` |
| [e2e-report-renderer](../skills/e2e-report-renderer/SKILL.md) | Render completed runner JSON as single-run, trend, or comparison HTML | `$e2e-report-renderer "Create comparison HTML for two completed runs in test-report/e2e"` |
| [e2e-test-workflow](../skills/e2e-test-workflow/SKILL.md) | Coordinate catalog, API, browser, and HTML stages under one environment owner | `$e2e-test-workflow "Refresh order scenarios, run the API cases and QA browser handoff, and save an HTML report"` |

### Documents, diagrams, and visual artifacts · 9

| Skill | Purpose | Conversation example |
|---|---|---|
| [code-diagram-extract](../skills/code-diagram-extract/SKILL.md) | Extract a behavior diagram with real source-file and line anchors | `$code-diagram-extract "Explain order creation through the payment call as a sequence diagram"` |
| [schema-doc-extract](../skills/schema-doc-extract/SKILL.md) | Statically extract an ERD and table specifications from migrations and ORM code | `$schema-doc-extract "Refresh the ERD and table specifications from Flyway and entities"` |
| [mermaid-diagrams](../skills/mermaid-diagrams/SKILL.md) | Author editable Mermaid structure, flow, sequence, state, and ER diagrams | `$mermaid-diagrams "Write Mermaid source for the order state transitions"` |
| [diagram-styler](../skills/diagram-styler/SKILL.md) | Render existing `.mmd` as accessible SVG with a provenance manifest | `$diagram-styler "Render docs/order-flow.mmd as a light SVG for a document"` |
| [document-designer](../skills/document-designer/SKILL.md) | Structure supplied content as editable Markdown with clear hierarchy, tables, and captions | `$document-designer "Improve docs/decision.md as a readable decision document"` |
| [markdown-publisher](../skills/markdown-publisher/SKILL.md) | Publish Markdown as standalone HTML and optional PDF | `$markdown-publisher "Publish docs/decision.md as technical-theme HTML and PDF"` |
| [pdf-qa](../skills/pdf-qa/SKILL.md) | Validate rendered images and visual-inspection evidence for every PDF page | `$pdf-qa "Visually inspect every page of artifacts/decision.pdf; its source is docs/decision.md"` |
| [visual-artifact-router](../skills/visual-artifact-router/SKILL.md) | Route artifact requests through the appropriate design, rendering, and QA skills | `$visual-artifact-router "Turn the architecture explanation into editable source and shareable HTML"` |
| [korean-dev-writer](../skills/korean-dev-writer/SKILL.md) | Write or revise natural Korean technical documents, PRs, reviews, and comments while preserving facts | `$korean-dev-writer "Revise the Korean README for clear, natural technical prose"` |

### Evaluation, knowledge, retrospectives, and collaboration · 8

| Skill | Purpose | Conversation example |
|---|---|---|
| [agent-eval](../skills/agent-eval/SKILL.md) | Evaluate skill/agent quality, security, and counterexamples with an evidence-based scorecard | `$agent-eval "Evaluate skills/flyway and disclose what actually ran"` |
| [skill-updater](../skills/skill-updater/SKILL.md) | Create or update portable skills with source, structure, and version contracts | `$skill-updater "Clarify and validate the trigger for skills/postgres-query-review"` |
| [learn](../skills/learn/SKILL.md) | Extract reusable lessons and persist approved knowledge | `$learn "Extract reusable lessons from this incident investigation"` |
| [retro](../skills/retro/SKILL.md) | Review completed work as Keep, Problem, and Try, then propose improvements | `$retro "Review the search improvement task we just completed"` |
| [knowledge-audit](../skills/knowledge-audit/SKILL.md) | Verify auto-collected knowledge against current code, then promote, discard, or defer it | `$knowledge-audit "Verify and curate the candidates in .claude/knowledge/auto"` |
| [harness-propose](../skills/harness-propose/SKILL.md) | Compare current harness capabilities with recent research and write an HTML proposal | `$harness-propose "Research the next useful improvements for this harness"` |
| [git-flow](../skills/git-flow/SKILL.md) | Prepare a work branch or commit, push, and create a GitLab merge request | `$git-flow "Review and commit this feature change, then open a GitLab MR targeting develop"` |
| [notion-domain-context](../skills/notion-domain-context/SKILL.md) | Search a connected private Notion workspace for cited read-only evidence | `$notion-domain-context "Find Notion evidence for order cancellation policy and the owning team"` |

## Skills that need external tools

The installer copies skills and their declared asset dependencies. Database accounts, MCP
authentication, Docker, browsers, and model-provider authentication require separate preparation.

| Capability | Prerequisites | How to interpret the result |
|---|---|---|
| Specialist review workflows and delegated `start-task` work | Agents discovered by the actual runtime and an available explicit model/effort route | Installation or route resolution alone does not execute work. Missing mandatory execution yields `INCOMPLETE`/`BLOCKED`. |
| `nl-sql-query` | Build and register the separate `nl-sql` MCP; use a read-only DB account and non-empty schema allowlist | One server instance selects one PostgreSQL/MySQL/SQL Server dialect. SQL Server does not support `explain_select`. |
| `notion-domain-context` | Notion MCP configuration, OAuth, and allowed search/fetch tools; Claude Code also needs `notion-domain-researcher` | Configuration, approval, authentication, and successful live research are separate states. |
| `e2e-scenario-author`, `e2e-runner` | A supported Spring Boot/JVM or NestJS repository; execution also needs Docker, Testcontainers, and project build tools | Shared Compose environments are not reused. Ordinary runs are ephemeral; request persistent reports explicitly. |
| `playwright-e2e` | Playwright dependency, configuration, and browser; Node Testcontainers; QA case IDs, seed/cleanup owners, and absence probes | The application must be ephemeral and owned by the run. An existing production/shared `baseURL` is not accepted. |
| `e2e-report-renderer` | Completed runner JSON in `test-report/e2e` with its `.done` marker | The renderer writes HTML without editing its inputs; it does not merge the separate browser E2E JSON format. |
| `diagram-styler` | Preinstalled Mermaid CLI `mmdc` and a working renderer environment; optionally set `MMDC_BIN` | The skill does not download renderers during execution. Preserve the `.mmd`, SVG, and manifest together. |
| `markdown-publisher`, `pdf-qa` | Node.js for HTML; a local Chromium-family browser for PDF; Python 3, Poppler, and image inspection for PDF QA | QA requires `pdfinfo` and either `pdftocairo` or `pdftoppm`. Successful rendering still requires visual inspection of every page. |
| `agent-eval` | The SkillEvaluator CLI revision pinned by the wrapper; additional scanners, providers, datasets, and sandbox prerequisites for other tiers | Default Tier 1 is keyless static evidence. Installation or static success does not establish live model performance. |
| `git-flow` | GitLab remote, authenticated transport, and suitable work/target branches | The default target is `develop`. This skill implements GitLab MR workflows, not GitHub PR creation. |
| `learn`, `retro`, `knowledge-audit`, `harness-propose` | The project knowledge structure named by the skill, including `.claude/knowledge/` and `.claude/retro/` where applicable | Installing skills does not enable automatic learning hooks. Knowledge persistence and accepted improvements follow each skill's approval contract. |

### Set up the local SQL MCP

Select the template and skill from the source checkout:

```sh
./vulpora setup --runtime codex --scope project --target /absolute/project nl-sql-mcp nl-sql-query
cd /absolute/project/mcp/nl-sql
npm install
npm run build
cp nl-sql.config.example.json nl-sql.config.json
```

Set the actual connection details and `allowedSchemas` in the local configuration, then register
`dist/index.js` as an MCP server in your runtime. Do not commit credentials. Physical tables must
be qualified as `schema.table`; a read-only login is particularly important for SQL Server.
The [nl-sql guide](../mcp/nl-sql/README.md) contains configuration examples and Claude `.mcp.json`
registration. This local server template is separate from the remote packs managed by
`vulpora mcp install`.

### Set up Notion and authenticate on first use

This example uses Claude Code user scope. For Codex, change the runtime to `--runtime codex`.

```sh
./vulpora setup --runtime claude-code --scope user notion-domain-context notion-domain-researcher
./vulpora mcp install --runtime claude-code --scope user notion
./vulpora mcp status --runtime claude-code --scope user notion
```

Installation defers OAuth. Invoke `notion-domain-context` in a new session to enter the required
first-use authentication path. To authenticate explicitly now, run the following command and
approve in the browser. A Claude project MCP marked `Pending approval` also needs approval through
that session's `/mcp` menu.

```sh
./vulpora mcp login --runtime claude-code --scope user notion
```

Files in Codex's `.agents/skills` or Claude's `.claude/skills` do not establish discovery in an
already running session. If a skill or tool is missing, check the selected scope and `doctor`
result, then start a new runtime session. See the [installation guide](../INSTALL.md) for additional
installation, removal, and MCP troubleshooting.
