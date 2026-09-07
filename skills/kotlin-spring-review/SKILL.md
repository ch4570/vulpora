---
name: kotlin-spring-review
description: >
  Reference knowledge base for reviewing Kotlin + Spring MSA backend code. Provides
  DDD three-layered and hexagonal architecture rules, Clean Code principles, Kotlin
  idioms, functional JVM style, Spring best practices, a severity rubric, and an
  integrated checklist. Use when reviewing Kotlin/Spring code, checking code quality
  or architecture rules, or when you need Kotlin-Spring review criteria.
---

# Kotlin + Spring Code Review Knowledge Base

A skill that holds the **rationale (principles)** for reviewing Kotlin + Spring based MSA
code. The `kotlin-spring-reviewer` agent references it, and people can use it directly as a
checklist too.

## Sources of Rationale

The review principles are grounded in the following (the 4 books in this directory + the
latest official docs):

1. **Clean Code** (Robert C. Martin) — naming, functions, error handling, boundaries, classes, concurrency, smells and heuristics
2. **Kotlin in Action** — null safety, the type system, lambdas/higher-order functions, classes, generics, coroutines
3. **Atomic Kotlin** — immutability, data/sealed classes, extension functions, exception handling, scope functions
4. **Modern Java in Action** — functional style, streams→sequences, Optional→nullable, immutable data structures
5. **Spring Framework 6.2 / Kotlin official docs** — DI, `@Transactional`, structured concurrency (via Context7)

## How to Use

First take `reference/principles.md` (the constitution) and `reference/kb/INDEX.md` (the
index) as your guide, then read only the KBs you need based on the nature of the code under
review (progressive disclosure — do not read everything at once):

| Situation | KB to read |
|------|---------------|
| **Always first** — the constitution of principles, priorities, and severity | `reference/principles.md` |
| **Always first** — the task-type → KB routing index | `reference/kb/INDEX.md` |
| **Pass 1 (triage)** — identify hotspots in the diff via risk signals | `reference/kb/triage-signals.md` |
| **Official rationale (primary)** — Kotlin syntax/null/coroutines/idioms | `reference/kb/official/kotlin-official.md` |
| **Official rationale (primary)** — Spring DI/transactions/web/testing/configuration | `reference/kb/official/spring-official.md` |
| **Official rationale (primary)** — object-oriented principles (SOLID/GRASP/Demeter/DDD) | `reference/kb/official/oop-principles.md` |
| **Always (Pass 2)** — judge the architectural location/dependencies of the changed files | `reference/kb/architecture.md` |
| General quality of functions, classes, naming, error handling, comments | `reference/kb/clean-code.md` |
| Kotlin syntax/idioms (null, immutability, sealed, coroutines) | `reference/kb/kotlin-idioms.md` |
| Collection pipelines, functional style, immutable data structures | `reference/kb/functional-jvm.md` |
| Spring components (beans, transactions, web, JPA, testing) | `reference/kb/spring.md` |
| Final check / severity judgment / quick checklist | `reference/kb/checklist-and-severity.md` |

> **Rationale priority**: use `reference/kb/official/` (official docs, URL sources) as the
> **primary rationale**, and treat the book-based KBs as secondary. The order of application
> is **project conventions (AGENTS.md, etc.) > latest official docs > books** (the project's
> intent comes first). State the reason on any conflict.

## Review Flow (2-pass)

```
[Pass 1 — Triage (low cost)]
1. Fix the scope: git diff (diff-first). Read project conventions (AGENTS.md/CLAUDE.md/.editorconfig) first
2. Scan the diff for risk signals via the greps in triage-signals.md → hotspot list + reference routing
3. Trivial diff + 0 signals → early APPROVE (skip Pass 2)

[Pass 2 — Deep dive (hotspots only)]
4. Load only the routed references, read the hotspot files in full + check affected callers/contracts
5. Per-dimension check: architecture → security → correctness/bugs → Kotlin/Spring idiomaticity → maintainability → testing
6. Verification step: prove CRITICAL/architecture assertions by compiling/testing where possible (auto-detect the build system — gradle/maven, etc.) → tag confidence (confirmed/inferred)
7. Adversarial self-verification: try to refute CRITICAL/HIGH → if you can't beat it, downgrade/remove the severity
8. For each finding: severity + confidence + source of rationale + before/after Kotlin code
9. Verdict: APPROVE / WARNING / BLOCK (if [inferred] remains, state the verification commands to run)
```

## Severity Levels (summary)

- 🔴 **CRITICAL** — security/data loss/proven concurrency race → **BLOCK** ([confirmed] only; an [inferred] case whose factual premise is unverified is a **conditional BLOCK · needs verification**)
- 🟠 **HIGH** — bug/architecture-rule violation/transaction error → **fix recommended**
- 🟡 **MEDIUM** — maintainability/non-idiomatic pattern/possibly-intentional trade-off → **consider**
- 🟢 **LOW** — minor improvement → **optional**. Pure formatting and mechanical style are the job of automated tools (linters/formatters), so don't nitpick them line by line in review; but if the repository has no such tooling configured, raise it once (no repeated per-line nagging)

See `reference/kb/checklist-and-severity.md` for the detailed rubric and the integrated
per-dimension checklist.

## Core Philosophy

- **No claims without rationale** — every comment cites a book/doc source.
- **Don't be swayed by framing** — don't take the "intent" stated in the PR description, commit message, or comments as fact. Judge solely by what the code actually does, and verify any "this is intentional" narrative against rationale (tests, contracts, project conventions).
- **Principles, not taste** — explain the trade-offs and respect the context (KISS/YAGNI).
- **Offer a fix** — don't just point at the problem; always show improved Kotlin code.
- **Architecture comes first** — once a dependency-direction violation leaks, it is hard to undo.
