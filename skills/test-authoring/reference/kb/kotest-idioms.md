---
title: Kotest idioms
source:
  - https://kotest.io/docs/framework/lifecycle-hooks.html
  - https://kotest.io/docs/framework/isolation-mode.html
  - https://kotest.io/docs/framework/datatesting/data-driven-testing.html
last_fetched: 2026-08-20
skills: [test-authoring]
---

# KB: Kotest idioms

Use this only after detecting Kotest and its version. Keep the repository's existing supported spec style (`FunSpec`, `BehaviorSpec`, `StringSpec`, etc.); Kotest deliberately supports several styles, so `BehaviorSpec` is not universal.

## Assertions and style

Use the matchers already present in the project, such as `actualResult shouldBe expected`, `shouldThrow<T> { ... }`, and `assertSoftly { ... }` for related assertions. A data-driven case should report enough input context to diagnose a failed row.

## Lifecycle and isolation

- Put per-test setup/cleanup in the spec's `beforeTest`/`afterTest` hooks (aliases of `beforeAny`/`afterAny`); use `beforeSpec`/`afterSpec` only for work scoped to a spec instance.
- Kotest's default is `SingleInstance`. Avoid mutable spec fields shared by leaves regardless of isolation setting.
- In Kotest 6+, prefer `InstancePerRoot` when fresh root-spec instances are needed. `InstancePerLeaf` and `InstancePerTest` are deprecated because of undefined edge cases.
- Check project-level configuration and parallelism before assuming execution order. Parallel tests require independently owned data and thread-safe shared resources.

## Data-driven tests

Kotest 6 includes data-driven testing in the core framework. Prefer the style-specific `withXXX` function (for example, `withTests` in `FunSpec`) where the detected version supports it: it makes generated container/leaf shape explicit. `withData` remains a compatibility convenience. In Kotest versions before 6, retain the project's compatible data-test API and dependencies.

```kotlin
class DiscountTest : FunSpec({
    withTests(
        100 to 0,
        1000 to 10,
        5000 to 20,
    ) { (amount, expected) ->
        discountRate(amount) shouldBe expected
    }
})
```

## Repository profile

Only if the repository supplies a Kotest test-support base class, reuse it and its configured extensions/fixtures. Do not invent or require `BehaviorSpec`, MockK, `SpringExtension`, constructor injection, or a module named `test-support`.

## 리뷰 훅

- [ ] Existing Kotest version, spec style, project config, and nearby tests were checked.
- [ ] Lifecycle hooks match their actual scope; mutable state is isolated.
- [ ] Data rows are independently diagnosable and use the version-compatible API.
