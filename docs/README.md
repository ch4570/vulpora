# Vulpora documentation

[한국어 시작하기](../README.ko.md) · [English quick start](../README.md)

Start with the bilingual skill and architecture guides, then choose the installation and workflow
details needed for your project.

## Use Vulpora

| Guide | What it answers |
|---|---|
| Skills: [한국어](skills.ko.md) · [English](skills.en.md) | All 62 skill IDs, grouped purposes, exact invocation examples, dependency installation, and external-tool prerequisites |
| Architecture: [한국어](architecture.ko.md) · [English](architecture.en.md) | Folder structure, catalog-to-runtime flow, dependency graph, model routing, MCP boundaries, and extension points |
| [Installation and removal](../INSTALL.md) | Guided/CLI installation, runtime scope, offline packages, updates, MCP setup, and receipts |
| [Catalog guide](catalog-guide.md) | Packs, agents, workflows, runtime paths, project policy, and source layout |
| [Product pack](product-pack.md) | Planning, UX design, independent review, and example prompts |
| [Model routing](review-workflow-model-routing.md) | Cost profiles, explicit runtime selection, escalation, and specialist lanes |
| [Native model-routing boundary](../skills/start-task/reference/kb/model-routing.md) | Executable catalog discovery, configuration preflight, neutral Codex defaults, explicit pins, and requested versus observed child evidence |
| [Start-task orchestration](start-task-orchestration.md) | Lightweight, standard, and audit execution profiles and completion evidence |
| [Visual artifact pipeline](visual-artifact-pipeline.md) | Editable sources, rendering, inspection, and document/diagram QA |
| [NL-to-SQL MCP](../mcp/nl-sql/README.md) | Separate build and configuration for read-only database access |
| [Name and visual identity](naming.md) | Vulpora's fox-inspired name, artwork, and project identifiers |
| [Support](../SUPPORT.md) | Questions, troubleshooting, and bug reports |

## Contribute and evaluate

| Guide | What it answers |
|---|---|
| [Contributing](../CONTRIBUTING.md) | Development setup, checks, and change submissions |
| [Authoring agents and knowledge](agent-authoring-and-kb-guide.md) | Role contracts, bundles, KB routing, provenance, and evaluation cases |
| [STANDARD](../STANDARD.md) | Required source structure and portable authoring conventions |
| [Distribution architecture](architecture.md) | Manifest, typed dependencies, runtime rendering, receipts, and extension points |
| [Agent/MCP design rules](agent-mcp-design-rules.md) | Protocol boundaries, authority, threat modeling, and verification requirements |
| [Evaluation overview](../evals/README.md) | Structural checks and portability |
| [Behavioral evaluation](../evals/behavioral/README.md) | Case contracts, runtime adapters, artifacts, and measurement |
| [Evidence trust boundaries](eval-trust-boundaries.md) | What offline checks, signatures, and the bounded runner do and do not prove |
| [Issue and evidence ledger](issue-resolution.md) | Dated integration checks, prior full-suite snapshots, and recorded native/operator verification gaps |
| [Public release checklist](public-release-checklist.md) | Source rights, provenance, reviewed history, and operational release prerequisites |
| [Security reporting](../SECURITY.md) | Private vulnerability reports |
| [Governance](../GOVERNANCE.md) | Maintainer and contributor responsibilities |

## Architecture research and historical records

These documents contain proposals, assessments, and point-in-time evidence. Their existence does
not mean every proposal is implemented or every runtime is verified. Use the current implementation,
user guides, and relevant tests to establish present behavior.

The 2026-09-07 integration checkpoint recorded real Codex model-list discovery and deterministic
three-profile resolution, with **no model turns**. At that checkpoint, final whole-tree regression
was pending, and the record did not establish live child execution or completed public release.
Use the [issue ledger](issue-resolution.md) and [release checklist](public-release-checklist.md)
for the scope and dates of that evidence.

- [Agent lifecycle assessment and feedback loop](agent-lifecycle-assessment-and-feedback-loop.md)
- [Agent-memory self-learning architecture](agent-memory-self-learning-architecture.md)
- [Agent-memory architecture review](agent-memory-architecture-validation.md)
- [Agent-memory implementation plan](agent-memory-implementation-plan.md)
- [YAML contracts and local knowledge-graph methodology](agent-memory-kg-local-methodology-review.md)
- [Harness architecture comparison](agent-harness-oh-my-series-review.md)
- [Agent-memory coordination agreement](agent-memory-coordination-agreement.md)
- [Test-quality refactoring workflow plan](test-quality-refactoring-workflow-plan.md)
- [Behavioral runtime metrics changes](behavioral-eval-runtime-metrics-changelog.md)
- [Behavioral runtime metrics report](behavioral-eval-runtime-metrics-report.html)
- [Historical SkillSpector report](security/skillspector-report.md)
- [Historical skill scan findings](security/skillspector-skills.md)
- [Interactive architecture diagrams](diagrams/README.md)

Release changes are recorded in [CHANGELOG](../CHANGELOG.md).
