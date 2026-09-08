---
name: code-authoring-router
description: Route generic feature, bug-fix, refactor, and implementation requests to installed code-authoring skills after detecting repository stack evidence. Use even when the user only names the desired behavior and does not mention Kotlin, Spring, PostgreSQL, Microsoft SQL Server, or OpenSearch; do not use for review-only requests.
---

# Code authoring router

Before editing, preserve the repository's current VCS state and inspect repository facts to select the construction
guidance that matches the affected code. A generic request such as “결제 기능 추가해줘” is an implementation
signal, not proof of a technology stack.

## Resolve project policy

If root `vulpora.config.json` exists, validate and apply its `locale` and `vcs` policy. Otherwise use the portable
defaults: follow the user and repository language, auto-detect the hosted VCS and default branch only when needed,
and preserve the current branch and worktree.

Do not create, switch, fetch, fast-forward, push, or open a change request merely because implementation was
requested. Prepare a child branch only when the user/repository requires it or `vcs.prepareBranch` is `true`. In
that opt-in path, use the configured provider and base branch (`auto` means the remote default, never an assumed
`develop`), and preserve dirty or diverged work. The GitLab-specific `git-flow` skill may be used only when GitLab
is proven and its house style matches the project policy.

Record the resolved policy and any branch action with the routing evidence.

## Detect and route

1. Inspect project instructions, build files, dependency catalogs, source extensions, migration directories, mappings, query builders, and nearby tests.
2. Record the evidence paths and choose every installed, applicable authoring skill:

| Repository and task evidence | Load before editing |
|---|---|
| Actual Kotlin source in the affected module, supported by its build settings; the change edits Kotlin code | `kotlin-code-authoring` |
| Java source in the affected module, including Java/Spring | Repository-local Java authoring and test conventions; `java-spring-review-workflow` for Spring review if installed |
| PostgreSQL driver/dialect plus affected SQL, repository query, schema, or migration | `postgres-code-authoring` |
| SQL Server driver/dialect plus affected T-SQL, stored procedure, schema, index, or migration | `mssql-code-authoring` |
| OpenSearch client/dependency plus affected mapping, Query DSL, pipeline, index setting, or search behavior | `opensearch-code-authoring` |

3. Multiple skills may apply to one feature. Load each selected skill before the first edit in its lane and use only the relevant KB topics. If a matching skill is not installed, report the recommendation and continue with repository-local guidance rather than inventing a dependency.
4. Put `base_branch`, `work_branch`, `required_authoring_skills`, and evidence paths in plans or implementation handoffs so delegated agents apply the same constraints.

Do not select a technology from the feature wording alone. If no supported stack has repository evidence, continue with repository-local conventions without inventing an authoring skill.

Gradle Kotlin DSL, `buildSrc`, and convention plugins do not establish Kotlin application usage. Exclude installed
skill/agent bundles and evaluation fixtures from service-stack evidence. In mixed modules, route each affected file
by its implementation/test language; Kotlin-only test skills must not be applied to Java work.

Read [stack detection](reference/kb/stack-detection.md) when evidence is mixed or the feature crosses multiple persistence/search boundaries.

## Verify

Before completion, confirm that the configured VCS policy was preserved, every changed implementation lane used
its available routed authoring skill, and the repository-provided formatter, lint, compile, and focused tests ran
where applicable.
