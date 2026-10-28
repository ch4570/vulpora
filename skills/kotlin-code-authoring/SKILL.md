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

Read [Spring construction](reference/kb/spring-construction.md) for dependency injection and transactional-boundary decisions. When the change adds or alters an entity state transition, or the request mentions repeated or concurrent requests, read [state-transition commands](reference/kb/state-transition-commands.md) before coding.

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

Before writing the handover, trace the request clause by clause. For each clause name the changed code and the test that exercises it, or mark it unverified with the reason. When a clause says to match something existing ("same format as the existing API"), cite the file you matched; if no precedent exists, say so and state the shape you chose as an assumption. List every public contract you added (endpoint, response field, error code) and justify each new error code against the existing ones, or reuse them. Add a test for any clause still left without one if the test stack can run it.

Run the affected Kotlin module's formatter, lint, and compile/test task when the repository provides them. Do not introduce a formatter or a dependency solely for this rule.

If the build cannot run (no wrapper, no network, tool missing), do not stop at "not run". Before handing over commands, check each one against the build files and stop when every command and new import is accounted for:

- dependency resolution: a `repositories` block in the build or settings file;
- each task you name: what it needs, e.g. `build`/`bootJar` needs a main class;
- each import in new code and tests: a declared dependency provides it.

Give only commands that pass this check; name each failed check as a blocker. Label unrun claims as unverified.
