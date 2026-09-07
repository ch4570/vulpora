# sample-test-quality

Portable Kotlin/Kotest-like fixture corpus for the test-quality-review,
test-refactoring, and test-quality-refactoring-workflow behavioral evaluations.
It includes a wrapper-free, dependency-free Gradle JVM harness (`gradle
fixtureContracts` where Gradle is already installed) and an equivalent local-JDK
fallback (`bash scripts/run-fixture-contracts.sh`). The fallback is the supported
execution evidence in environments that have `javac`/`java` but no Gradle.

The Kotlin/Kotest sources are inspection targets; this corpus deliberately does
not download Kotlin, Kotest, MockK, Gradle, or any plugin. An adapter must therefore
record the Java harness as fixture-contract evidence only. It must not call that
evidence a selected Kotest execution, a full Kotlin auto-refactor, or a workflow
`PASS`.

The corpus contains deliberately weak tests (vacuous, self-confirming, reflection,
relaxed-mock/order coupling, and flaky state) alongside one protected boundary test.
`workspace-state/dirty-worktree-manifest.yaml` is a declarative preflight snapshot,
not an instruction to mutate Git state. It represents user-owned changes that must
remain read-only during workflow evaluation.

All names, values, endpoints, and test doubles are generic. No service credentials,
shared services, or real repositories are required.
