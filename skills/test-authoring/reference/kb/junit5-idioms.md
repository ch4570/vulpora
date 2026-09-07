---
title: JUnit Platform and Jupiter idioms
source:
  - https://docs.junit.org/current/user-guide/
  - https://docs.junit.org/current/writing-tests/annotations.html
  - https://docs.junit.org/current/writing-tests/test-instance-lifecycle.html
  - https://docs.junit.org/current/writing-tests/parameterized-classes-and-tests.html
  - https://docs.junit.org/current/writing-tests/parallel-execution.html
last_fetched: 2026-08-20
skills: [test-authoring]
---

# KB: JUnit Platform and Jupiter idioms

Use this after detecting JUnit Platform/Jupiter and its version. JUnit Platform launches engines; Jupiter supplies JUnit's programming and extension model. Kotest can also run as a Platform engine, so mixed suites are normal: preserve each engine's native tests and the build's engine filters.

## Jupiter tests

Use the local project's assertion library and conventions. Jupiter commonly uses `@Test`, `@Nested`, `@DisplayName`, and `@ExtendWith`; apply extensions only when the dependency and local configuration support them. Spring test annotations generally carry the appropriate Spring extension—do not add a redundant extension without checking the annotation and nearby tests.

Jupiter's default test-instance lifecycle is `PER_METHOD`, giving each test method a new instance. `@TestInstance(PER_CLASS)` permits non-static `@BeforeAll`/`@AfterAll`, but it also makes instance state shared; keep it immutable or reset it deliberately.

```kotlin
class DiscountTest {
    @ParameterizedTest
    @CsvSource("100, 0", "1000, 10", "5000, 20")
    fun `uses the expected rate`(amount: Int, expected: Int) {
        assertEquals(expected, discountRate(amount))
    }
}
```

Use `@ParameterizedTest` with `@ValueSource`, `@CsvSource`, `@MethodSource`, or `@EnumSource` for independent examples. Use `@RepeatedTest` only when repeating the same behavior is the point; do not hide different scenarios in loops.

## Platform suites and parallel execution

- When `@Suite` or a suite configuration is present, treat it as a launcher for one or more Platform engines, not as a reason to rewrite tests into Jupiter.
- Respect engine include/exclude filters and tags already configured by Gradle, Maven Surefire/Failsafe, or the suite.
- Parallel execution is opt-in and configuration-driven. Before enabling or relying on it, inspect the build and `junit-platform.properties`; tests must not share mutable state, ports, files, database rows, or static/global configuration unless safely isolated.
- `@Disabled` needs an explicit reason and should remain exceptional; prefer fixing or quarantining a known external issue through the repository's established process.

## Repository profile

Use JUnit base classes, extensions, fixtures, and Spring slice annotations only when that repository supplies them. Never require a Kotest base class, `BehaviorSpec`, MockK, or a `module:test-support` module in a JUnit project.

## 리뷰 훅

- [ ] Platform engines, suite/filter configuration, and the detected Jupiter version were checked.
- [ ] Test lifecycle and extensions match local conventions without accidental shared state.
- [ ] Parameterized cases identify their input and assert one behavior per invocation.
- [ ] Parallel safety is explicit when parallel execution is configured.
