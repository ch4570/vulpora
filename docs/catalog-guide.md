# Vulpora catalog guide

[한국어 시작하기](../README.ko.md) · [English quick start](../README.md) · [Documentation index](README.md)

Vulpora packages roles, procedures, and their supporting knowledge. Choose a pack for a task,
or select individual asset IDs. The installer resolves their declared dependencies from the
[manifest](../install/manifest.txt); packs are curated entry points into that same graph.

| Start here | 한국어 | English |
|---|---|---|
| All 63 skills with invocation examples and prerequisites | [스킬 사용 가이드](skills.ko.md) | [Skill handbook](skills.en.md) |
| Folder structure, installation flow, and runtime architecture | [아키텍처 가이드](architecture.ko.md) | [Architecture guide](architecture.en.md) |

The primary command is `vulpora`; `vulpora` remains a compatibility alias. Existing skill IDs,
configuration filenames, environment variables, and MCP names retain their `vulpora` identifiers.

## Pack catalog

| Pack | Use it for |
|---|---|
| `core` | Repository discovery and evidence-based implementation routing |
| `product` | Product planning, UX specification, and independent design review |
| `orchestration` | Requirement clarification, task decomposition, and bounded execution |
| `jvm-spring` | Kotlin/Java/Spring authoring, review, and test guidance |
| `jvm-spring-postgres-opinionated` | Optional JPA, layered Spring, and PostgreSQL Flyway house patterns |
| `postgres` | PostgreSQL queries, schemas, migrations, and operational review |
| `mssql` | Version-aware T-SQL and SQL Server migration authoring |
| `opensearch` | Queries, mappings, performance, migrations, and review |
| `jvm-quality` | JVM architecture, backend/security review, and test-only refactoring |
| `qa-e2e` | Scenario design, API/async and browser E2E workflows |
| `visual` | Product UI, diagrams, document formatting, rendering, and visual QA |
| `product-discovery-ko` | Korean requirements dialogue and product requirement artifacts |
| `knowledge` | Evaluation, knowledge audit, learning candidates, and reviewed skill updates |
| `notion` | Read-only, provenance-aware Notion context; MCP setup is separate |

The [pack registry](../install/packs.txt) contains the exact roots. Capability packs currently
contain agent/skill roots only. Hosted MCP packs, buildable MCP servers, memory contracts, and eval
assets use separate explicit selectors and setup paths.

From a source checkout, with an existing target directory:

```sh
./vulpora list
./vulpora setup --runtime codex --scope project --target /absolute/project pack:core pack:product
./vulpora doctor --runtime codex --scope project --target /absolute/project pack:core pack:product
./vulpora uninstall --runtime codex --scope project --target /absolute/project pack:product
```

Use `--runtime claude-code` for Claude Code. `all-agents` and `all-skills` remain available for a
full catalog installation. Removal preserves modified files and conservatively retains shared
dependencies needed by other installed packs or retained standalone assets.

## Agent catalog

Agent definitions describe inputs, authority, output, completion, and verification. Judgment-based
roles have a bundle containing `SOUL.md`, principles, an INDEX, and task-specific KB topics. The
definition-to-bundle mapping is in the manifest; bundle names need not equal agent IDs.

| Area | Agents |
|---|---|
| Product and design | [product-planner](../agents/product-planner.md), [ux-designer](../agents/ux-designer.md), [design-reviewer](../agents/design-reviewer.md) |
| Requirements and orchestration | [requirement-dialogue](../agents/requirement-dialogue.md), [task-splitter](../agents/task-splitter.md), [task-orchestrator](../agents/task-orchestrator.md) |
| Application and domain architecture | [architecture-reviewer](../agents/architecture-reviewer.md), [application-architect](../agents/application-architect.md), [domain-driven-design-reviewer](../agents/domain-driven-design-reviewer.md), [data-modeling-reviewer](../agents/data-modeling-reviewer.md) |
| Code and security review | [java-reviewer](../agents/java-reviewer.md), [kotlin-spring-reviewer](../agents/kotlin-spring-reviewer.md), [code-refactor-agent](../agents/code-refactor-agent.md), [security-auditor](../agents/security-auditor.md) |
| Database and search | [postgres-dba](../agents/postgres-dba.md), [opensearch-expert](../agents/opensearch-expert.md), [search-relevance-evaluator](../agents/search-relevance-evaluator.md), [index-migration-architect](../agents/index-migration-architect.md), [nl-sql-guardian](../agents/nl-sql-guardian.md) |
| Tests and QA | [qa-test-designer](../agents/qa-test-designer.md), [e2e-test-runner](../agents/e2e-test-runner.md), [test-runner](../agents/test-runner.md), [backend-test-author](../agents/backend-test-author.md) |
| Documentation and context | [code-cartographer](../agents/code-cartographer.md), [schema-cartographer](../agents/schema-cartographer.md), [documentation-comment-author](../agents/documentation-comment-author.md), [notion-domain-researcher](../agents/notion-domain-researcher.md) |
| Agent evaluation | [agent-evaluator](../agents/agent-evaluator.md) |

`test-runner` is a tool-oriented standalone agent and does not have a judgment KB bundle.
The [product pack guide](product-pack.md) explains planning/design handoffs and their write boundaries.

## Skills and workflows

Skills are runtime-discovered `SKILL.md` procedures. A workflow can declare other skills and agents
as typed dependencies. Codex uses `$<skill-id>`; Claude Code uses `/<skill-id>`. The following table
uses stable IDs without implying the same invocation syntax in both runtimes.

| Skill or workflow | Responsibility |
|---|---|
| [vulpora-init](../skills/vulpora-init/SKILL.md) | Inspect stack evidence and update the managed routing section in `AGENTS.md` |
| [code-authoring-router](../skills/code-authoring-router/SKILL.md) | Select installed construction guidance for a feature, fix, or refactor |
| [start-task](../skills/start-task/SKILL.md) | Select lightweight, standard, or audit execution and carry a bounded task to verification |
| [java-spring-review-workflow](../skills/java-spring-review-workflow/SKILL.md) | Java/Spring correctness, OOP, and design-pattern review lanes |
| [kotlin-spring-review-workflow](../skills/kotlin-spring-review-workflow/SKILL.md) | Integrated Kotlin/Spring review |
| [backend-code-review-workflow](../skills/backend-code-review-workflow/SKILL.md) | Backend correctness, design, refactoring, and security review |
| [security-scan-workflow](../skills/security-scan-workflow/SKILL.md) | Read-only credential, XSS, CSRF, SQL injection, and destructive shared DB/Redis review |
| [architecture-review-workflow](../skills/architecture-review-workflow/SKILL.md) | Evidence-linked architecture review across specialist views |
| [postgres-review-workflow](../skills/postgres-review-workflow/SKILL.md) | PostgreSQL query, schema, migration, and concurrency review |
| [opensearch-review-workflow](../skills/opensearch-review-workflow/SKILL.md) | Query, mapping, performance, and operational review |
| [test-quality-refactoring-workflow](../skills/test-quality-refactoring-workflow/SKILL.md) | Audit tests, select findings, and make scoped test-only improvements |
| [e2e-test-workflow](../skills/e2e-test-workflow/SKILL.md) | Catalog, API/async, browser, cleanup, and optional report lifecycle |
| [product-ui-design](../skills/product-ui-design/SKILL.md) | Product-context design, implementation, review, and rendered-quality checks |
| [visual-artifact-router](../skills/visual-artifact-router/SKILL.md) | Route document, diagram, and rendering work while preserving editable sources |
| [notion-domain-context](../skills/notion-domain-context/SKILL.md) | Read-only context with source provenance from an explicitly configured Notion MCP |
| [mssql-code-authoring](../skills/mssql-code-authoring/SKILL.md) | T-SQL and migration work grounded in the installed SQL Server version |
| [git-flow](../skills/git-flow/SKILL.md) | Optional GitLab-oriented branch and publication workflow, only when requested and applicable |

For all 63 skill IDs and invocation examples, see the [Korean](skills.ko.md) or
[English](skills.en.md) handbook. Use `./vulpora list` to inspect the source catalog.
The catalog includes `codex-agent-runtime`, a disabled compatibility contract that returns
`AGENT_RUNTIME_ERROR:project_execution_disabled`; it does not execute agents.
Review lane profiles and explicit model selection are documented in
[model routing](review-workflow-model-routing.md); scheduling and audit evidence are in
[start-task orchestration](start-task-orchestration.md).

## Project policy and runtime paths

The optional project-root `vulpora.config.json` controls generated repository guidance:
`locale`, `vcs.provider`, `vcs.baseBranch`, and `vcs.prepareBranch`. Omitted settings preserve the
current branch/worktree and follow user/repository conventions. See the
[example](../vulpora.config.example.json) and [schema](../install/project-config.schema.json).
It does not grant sandbox, network, credential, or publication permissions.

Installed Codex adapters omit `model` and `model_reasoning_effort` by default. Explicit host routing
can then select both without a conflicting agent-file default. Direct invocation without a route
uses host defaults; the compatibility model placeholder in source templates is not installed.

`VULPORA_CODEX_MODEL` and `VULPORA_CODEX_REASONING_EFFORT` independently pin those fields during
setup. Use a model and effort actually available in the target runtime. `doctor` preserves installed
presence/absence regardless of ambient setup variables. Re-running setup without either override
removes installer-owned pins, subject to receipt protection for user edits. Check explicit pins
against a task's route before dispatch; syntax validation does not establish model availability.

| Runtime/scope | Agent definitions and bundles | Skills |
|---|---|---|
| Codex user | `~/.codex/agents` | `~/.agents/skills` |
| Codex project | `<project>/.codex/agents` | `<project>/.agents/skills` |
| Claude Code user | `~/.claude/agents` | `~/.claude/skills` |
| Claude Code project | `<project>/.claude/agents` | `<project>/.claude/skills` |
| OpenCode project, experimental | `<project>/.opencode/agents` | `<project>/.opencode/skills` |

OpenCode uses the low-level `install/install.sh --runtime opencode` renderer. The top-level CLI
does not offer it as a stable target. Rendering is not native execution evidence.
Detailed setup, update, offline packaging, terminal controls, marketplace use, and removal are in
[INSTALL](../INSTALL.md).

## MCP connections and servers

Hosted connections use a separate catalog and explicit commands:

```sh
./vulpora mcp list
./vulpora mcp install --runtime claude-code --scope project notion
./vulpora mcp status --runtime claude-code --scope project notion
./vulpora mcp login --runtime claude-code --scope project notion
./vulpora mcp remove --runtime claude-code --scope project notion
```

| Hosted pack | Endpoint | Authentication |
|---|---|---|
| `notion` | `https://mcp.notion.com/mcp` | Runtime-managed OAuth |
| `openai-docs` | `https://developers.openai.com/mcp` | None |

Connections use `vulpora-<pack>` names. A conflicting endpoint is preserved and reported.
Installation defers authentication; trust/OAuth is handled explicitly through the host runtime.
The Codex Notion configuration limits exposed tools to the declared read-only search/fetch aliases.
Unavailable tools, authentication failure, and an empty search result are distinct outcomes.
For research through Claude Code, also install the `notion-domain-context` skill and exact
`notion-domain-researcher` agent. The [skill handbook](skills.en.md#set-up-notion-and-authenticate-on-first-use)
provides the complete installation and first-use sequence.

The [NL-to-SQL MCP](../mcp/nl-sql/README.md) is a separate TypeScript source package for read-only
PostgreSQL, MySQL, or SQL Server access. It needs its own build, database configuration, allowed
schemas, runtime setup, and verification; installing a capability pack does not provision a DB.

## Memory and evaluation

The [memory catalog](../memory/) defines portable schemas and policies for writing, retrieval,
quarantine, promotion, and supersession. These are authoring contracts, not a deployed memory
backend or proof that an agent learns safely.

| Evaluation area | Question represented in the fixtures |
|---|---|
| Memory recall | Is relevant memory admitted while unrelated memory is rejected? |
| Retrieval gate | Do scope, trust, and provenance matter beyond similarity? |
| Memory poisoning | Are embedded instructions quarantined rather than promoted? |
| Stale memory | Does current evidence take precedence over outdated material? |
| Skill replay | Is a procedure applicable to the current task? |

`bash evals/run-evals.sh` checks structural consistency. Behavioral cases and their actual execution
are separate; `bash evals/behavioral/run-behavioral-evals.sh --validate` validates case contracts
without invoking a model. See [evaluation](../evals/README.md),
[behavioral evaluation](../evals/behavioral/README.md), and
[evidence trust boundaries](eval-trust-boundaries.md).

The [agent-eval skill](../skills/agent-eval/SKILL.md) includes a pinned SkillEvaluator wrapper for
additional checks. Security scanning, semantic comparison, and live model lift need their own
explicit prerequisites. Historical scanner findings are available in the [documentation index](README.md).

## Source layout and versioning

| Path | Purpose |
|---|---|
| [vulpora](../vulpora) | Public CLI entry point; the legacy [vulpora](../vulpora) entry remains available |
| [agents](../agents/) | Canonical role definitions, knowledge bundles, and adapter templates |
| [skills](../skills/) | Reusable procedures and integrated workflows |
| [install](../install/) | Catalogs, dependency resolver, runtime rendering, receipts, and tests |
| [mcp](../mcp/) | Buildable MCP source packages |
| [memory](../memory/) | Portable memory schemas and policies |
| [evals](../evals/) | Fixtures, structural checks, behavioral harness, and adapters |
| [templates](../templates/) | Explicitly selected commands, Git hooks, and helper scripts |
| [docs](./) | User guides, architecture, standards, research, and historical assessments |

The [Korean](architecture.ko.md) and [English](architecture.en.md) architecture guides explain how
these directories connect during installation and runtime execution.

Repository `VERSION` uses `MAJOR.MINOR.PATCH.MICRO`; package and plugin manifests use the first
three SemVer components. Changes to plugin content need at least a PATCH bump so runtime caches
can distinguish them. User-visible changes and verification scope belong in [CHANGELOG](../CHANGELOG.md).

To extend the catalog, follow the [authoring guide](agent-authoring-and-kb-guide.md),
[STANDARD](../STANDARD.md), and [distribution architecture](architecture.md).
