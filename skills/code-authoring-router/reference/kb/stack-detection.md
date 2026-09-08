---
title: Repository stack detection for implementation routing
source: ../../../../STANDARD.md
last_fetched: 2026-08-25
skills: [code-authoring-router]
---

# Repository stack detection for implementation routing

Route from observed repository facts, not technology words in the request. Build dependencies establish available technologies; changed files and nearby callers establish which technologies the feature actually touches.

- Kotlin routing requires actual Kotlin source in the affected module, considered with that module's build settings. Gradle Kotlin DSL, `buildSrc`, convention plugins, installed bundles, and evaluation fixtures do not establish Kotlin application usage. Spring guidance additionally requires module-local Spring usage; Java/Spring follows Java conventions. Route mixed modules per changed source/test language.
- PostgreSQL evidence includes the configured driver/dialect plus an affected query, repository, schema, migration, or PostgreSQL-specific type/operator.
- Microsoft SQL Server evidence includes a SqlClient, mssql-jdbc, mssql, or tedious dependency/connection dialect plus an affected T-SQL query, stored procedure, schema, index, or migration. Record engine/compatibility uncertainty for legacy targets.
- OpenSearch evidence includes its client/dependency plus an affected mapping, query builder, pipeline, index setting, or search call path.
- Presence alone is insufficient for unrelated lanes: a repository may contain PostgreSQL and OpenSearch while a pure presentation change touches neither.
- A cross-stack feature may require several authoring skills. Keep the evidence and selected skill IDs in the implementation handoff.

## 리뷰 훅

- [ ] The request was classified as implementation rather than review-only work.
- [ ] Each selected skill has both repository stack evidence and affected-lane evidence.
- [ ] Each implementation child receives and loads its `required_authoring_skills` before editing.
- [ ] No unrelated technology was selected merely because it exists somewhere in the repository.
