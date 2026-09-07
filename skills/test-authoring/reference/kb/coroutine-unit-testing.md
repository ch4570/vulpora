---
title: Kotlin coroutine unit testing
source:
  - https://kotlinlang.org/api/kotlinx.coroutines/kotlinx-coroutines-test/
last_fetched: 2026-09-02
skills: [test-authoring]
---

# KB: Kotlin coroutine unit testing

Use this only after detecting `kotlinx-coroutines-test` or an equivalent repository utility. Preserve the detected
version and local test rule; do not add a dependency or replace a local abstraction just to use these examples.

## Test entrypoint and dispatchers

- Use `runTest` for a `suspend` subject. It skips delays on test dispatchers, surfaces uncaught child-coroutine
  failures, and provides a `TestScope` with virtual time.
- Prefer injecting a `CoroutineDispatcher` or project dispatcher provider into the subject. A hard-coded
  `Dispatchers.IO` or `Dispatchers.Default` does not share `runTest`'s virtual scheduler, so its real delay is not
  skipped.
- Use `StandardTestDispatcher(testScheduler)` by default when the test needs to control queued work. Use
  `UnconfinedTestDispatcher(testScheduler)` only when eager entry is meaningful to the scenario; it can conceal
  scheduling assumptions.
- If several dispatchers are needed, construct each one with the same `testScheduler`. A scheduler per dispatcher
  makes one unit test observe unrelated virtual clocks.

```kotlin
@Test
fun `retries after the configured delay`() = runTest {
    val dispatcher = StandardTestDispatcher(testScheduler)
    val gateway = FailingThenSuccessfulGateway()
    val sut = RetryingClient(gateway, dispatcher)

    val response = async { sut.fetch() }

    runCurrent()
    assertThat(gateway.calls).isEqualTo(1)
    advanceTimeBy(1.seconds)
    advanceUntilIdle()

    assertThat(response.await()).isEqualTo(expectedResponse)
    assertThat(gateway.calls).isEqualTo(2)
}
```

## Scheduling, cancellation, and global Main

- `runCurrent()` runs work scheduled at the present virtual time. `advanceTimeBy(...)` progresses a specific delay;
  `advanceUntilIdle()` drains finite queued work. Use the narrowest operation that exposes the observable contract.
- Do not use `Thread.sleep`, arbitrary polling, or `runBlocking` to wait for a coroutine in a unit test.
- Assert cancellation, propagated failure, or supervisor behavior only when callers can observe it. For intentionally
  non-terminating work, launch it in `backgroundScope`; the test framework cancels that scope at test completion.
- `Dispatchers.setMain(...)` changes global state. Prefer injected dispatchers. When a subject cannot avoid `Main`,
  use the repository's reset-safe test rule and always pair it with `Dispatchers.resetMain()`.

## MockK coroutines

If MockK is already present, use `coEvery` and `coVerify` for suspend collaborators. Keep the same boundary rule as
ordinary mocks: verify an interaction only if it is contractual, and assert observable output/state as well.

## 리뷰 훅

- [ ] The coroutine-test dependency, version, and local dispatcher rule were discovered first.
- [ ] Every injected test dispatcher shares `testScheduler` with `runTest`.
- [ ] The test uses virtual time, never a real delay or production dispatcher for synchronization.
- [ ] Any `Dispatchers.Main` override is reset, and long-lived test work is in `backgroundScope`.
- [ ] Cancellation and child failure are asserted only where they are observable contract behavior.
