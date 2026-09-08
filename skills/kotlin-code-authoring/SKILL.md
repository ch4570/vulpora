---
name: kotlin-code-authoring
description: Write or modify Kotlin application code while preserving project conventions and readable Kotlin idioms. Use when implementing a feature, bug fix, or refactor in actual Kotlin application source, including Kotlin/Spring modules, even when the user does not name the stack; do not use for Java changes, Gradle build logic, or review-only requests.
---

# Kotlin code authoring

Write Kotlin that matches the target repository's compiler version, formatter, existing style, and framework conventions. Inspect nearby Kotlin code and project instructions before choosing an API or style.

## Construction baseline

Apply the same Kotlin/Spring principles used by `kotlin-spring-review` before writing code. It is an installed dependency: read its [principles](../kotlin-spring-review/reference/principles.md) and route only the relevant topics through its [KB index](../kotlin-spring-review/reference/kb/INDEX.md). Use those references as construction constraints, not as a request to produce a review.

- Preserve the repository's layer and dependency direction. Do not bypass the designated application/service boundary or leak persistence types across a boundary when local architecture rules prohibit it.
- Prefer `val`, explicit null handling, read-only public collection types, and `data`/`sealed` types where their semantics fit. Do not introduce `!!`, unsafe casts, or mutable public state merely to shorten an implementation.
- For Spring-managed mandatory dependencies, use constructor injection. Put transaction behavior at the existing application/service boundary; preserve proxy and transaction conventions instead of adding broad annotations speculatively.
- Validate and translate errors at the repository's existing boundary. Do not swallow broad exceptions or invent error contracts.
- When behavior changes, create or update a focused test using the detected test stack. Use `test-authoring` for test-specific guidance.

Read [Spring construction](reference/kb/spring-construction.md) for dependency injection and transactional-boundary decisions.

## Lambda parameters

- For a non-nested, single-parameter lambda, use `it`.
- Name a lambda parameter only when nesting makes the value or receiver ambiguous; name the inner parameter for that block.
- Keep parameters that the called API requires, including multi-parameter lambdas.

```kotlin
orders.filter { it.isActive }

orders.groupBy { it.customerId }
    .mapValues { (_, customerOrders) -> customerOrders.map { order -> order.id } }
```

Use [Kotlin lambda conventions](reference/kb/lambda-parameters.md) when deciding whether a nested scope is ambiguous. Do not apply this skill to review-only work; use `kotlin-spring-review` for findings and severity.

## Verify

Run the affected Kotlin module's formatter, lint, and compile/test task when the repository provides them. Do not introduce a formatter or a dependency solely for this rule.
