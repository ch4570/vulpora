#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
SKILL="$ROOT/SKILL.md"
DETECTOR="$ROOT/scripts/detect-test-profile.js"
RESULT_VALIDATOR="$ROOT/scripts/validate-container-test-result.js"
RESULT_SUMMARIZER="$ROOT/scripts/summarize-test-results.js"
VERDICT_EVALUATOR="$ROOT/scripts/evaluate-run-verdict.js"
VERDICT_CONTRACT="$ROOT/tests/verdict-contract.test.js"
ARTIFACT_MANAGER="$ROOT/scripts/manage-test-artifacts.js"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/vulpora-e2e-profile.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT HUP INT TERM

test -s "$SKILL"
test -f "$DETECTOR"
test -f "$RESULT_VALIDATOR"
test -f "$RESULT_SUMMARIZER"
test -f "$VERDICT_EVALUATOR"
test -f "$VERDICT_CONTRACT"
test -f "$ARTIFACT_MANAGER"
grep -Fq 'RUN-6.3 (Bounded test-profile discovery)' "$SKILL"
grep -Fq 'RUN-16.4 (Framework evidence)' "$SKILL"
grep -Fq 'RUN-6.4 (Infrastructure and existing-suite discovery)' "$SKILL"
grep -Fq 'RUN-16.5 (Infrastructure evidence)' "$SKILL"
grep -Fq 'RUN-7.0 (One environment owner)' "$SKILL"
grep -Fq 'RUN-7.3 (Two-level cleanup)' "$SKILL"
grep -Fq 'RUN-7.4 (Ephemeral framework artifacts)' "$SKILL"
grep -Fq 'RUN-8 (Positive proof; no fallback)' "$SKILL"
grep -Fq 'RUN-16.6 (Bootstrap evidence)' "$SKILL"
grep -Fq 'Testcontainers only; no user-owned Compose mutation' "$SKILL"
grep -Fq 'validate-container-test-result.js' "$SKILL"
grep -Fq 'at most 12 nearby test files' "$SKILL"
grep -Fq 'RUN-17.2 (Actionable non-PASS remediation)' "$SKILL"
grep -Fq 'RUN-18.1 (False-green-safe exit matrix)' "$SKILL"
grep -Fq 'RUN-18.2 (Diagnostic-only exception)' "$SKILL"
grep -Fq 'node scripts/evaluate-run-verdict.js' "$SKILL"
grep -Fq 'Do not create `test-report/e2e` in ephemeral mode' "$SKILL"

mkdir -p "$WORK/kotest/src/test/kotlin/example" "$WORK/kotest/local"
touch "$WORK/kotest/gradlew"
cat > "$WORK/kotest/build.gradle.kts" <<'GRADLE'
dependencies {
  testImplementation("io.kotest:kotest-runner-junit5:5.9.1")
  testImplementation("org.testcontainers:postgresql:1.20.0")
}
tasks.test { useJUnitPlatform() }
GRADLE
cat > "$WORK/kotest/local/docker-compose.yml" <<'YAML'
services:
  postgres:
    image: postgres:16
volumes:
  postgres-data:
YAML
cat > "$WORK/kotest/src/test/kotlin/example/RepositorySpec.kt" <<'KOTLIN'
import io.kotest.core.spec.style.FunSpec
import org.testcontainers.containers.PostgreSQLContainer

class RepositorySpec : FunSpec({ }) {
  val postgres = PostgreSQLContainer("postgres:16.4")
}
KOTLIN
cat > "$WORK/kotest/src/test/kotlin/example/RepositoryIntegrationTest.kt" <<'KOTLIN'
package example

import org.testcontainers.containers.PostgreSQLContainer
import org.springframework.test.context.DynamicPropertySource
import io.kotest.core.spec.style.FunSpec

class RepositoryIntegrationTest : FunSpec({ }) {
  val postgres = PostgreSQLContainer("postgres:16.4")
  @DynamicPropertySource fun properties() = Unit
}
KOTLIN
cat > "$WORK/kotest/src/test/kotlin/example/ConditionalContainerIntegrationTest.kt" <<'KOTLIN'
package example
import org.testcontainers.containers.PostgreSQLContainer
class ConditionalContainerIntegrationTest {
  val postgres = PostgreSQLContainer("postgres:16.4")
  fun properties() = DynamicPropertySource
  fun test() { if (DockerAvailableCondition.isDockerAvailable()) { check(true) } }
}
KOTLIN
mkdir -p "$WORK/kotest/redis-local/src/test/kotlin/example"
cat > "$WORK/kotest/redis-local/build.gradle.kts" <<'GRADLE'
dependencies { testImplementation("io.kotest:kotest-runner-junit5:5.9.1") }
GRADLE
cat > "$WORK/kotest/redis-local/src/test/kotlin/example/LocalRedisIntegrationTest.kt" <<'KOTLIN'
package example
class LocalRedisIntegrationTest { fun cleanup() = redis.flushDb() }
KOTLIN
node "$DETECTOR" "$WORK/kotest" > "$WORK/kotest.json"
node - "$WORK/kotest.json" <<'NODE'
const result = require(process.argv[2]);
if (result.primaryFramework !== 'kotest') process.exit(1);
if (!result.testcontainers.declaredFixture) process.exit(1);
if (result.infrastructure.compose[0].services.length !== 1) process.exit(1);
if (result.infrastructure.compose[0].services[0].name !== 'postgres') process.exit(1);
if (result.infrastructure.compose[0].services[0].image !== 'postgres:16') process.exit(1);
const repositoryCandidate = result.infrastructure.repositorySuiteCandidates.find((candidate) => candidate.className === 'example.RepositoryIntegrationTest');
if (!repositoryCandidate || repositoryCandidate.execution.argv[0] !== '--no-daemon') process.exit(1);
if (!repositoryCandidate.execution.argv.includes('-Dkotest.filter.specs=*RepositoryIntegrationTest')) process.exit(1);
if (repositoryCandidate.execution.argv.includes('--tests')) process.exit(1);
if (!repositoryCandidate.command.includes("'-Dkotest.filter.specs=*RepositoryIntegrationTest'")) process.exit(1);
if (result.infrastructure.fullSuiteExecution.argv.join(' ') !== '--no-daemon test --rerun-tasks --continue') process.exit(1);
if (result.infrastructure.fullSuiteExecution.artifactMode !== 'ephemeral') process.exit(1);
if (result.infrastructure.repositorySuiteCandidates.some((candidate) => candidate.className.includes('LocalRedis'))) process.exit(1);
if (!result.infrastructure.repositorySuiteCandidates.some((candidate) => candidate.conditionalInfrastructureBypass)) process.exit(1);
if (result.readBudget.testFilesRead > result.readBudget.testFileLimit) process.exit(1);
NODE

if ! grep -Fq 'Host Docker installation via `sudo`, Homebrew, apt, or Docker Desktop installers' "$SKILL"; then
  echo 'host-runtime bootstrap boundary is missing' >&2
  exit 1
fi

mkdir -p "$WORK/junit/src/test/java/example"
cat > "$WORK/junit/pom.xml" <<'POM'
<project><dependencies><dependency><groupId>org.junit.jupiter</groupId><artifactId>junit-jupiter</artifactId><version>5.11.0</version></dependency></dependencies></project>
POM
cat > "$WORK/junit/src/test/java/example/ServiceTest.java" <<'JAVA'
import org.junit.jupiter.api.Test;
class ServiceTest { @Test void works() {} }
JAVA
node "$DETECTOR" "$WORK/junit" > "$WORK/junit.json"
node - "$WORK/junit.json" <<'NODE'
if (require(process.argv[2]).primaryFramework !== 'junit-jupiter') process.exit(1);
NODE

mkdir -p "$WORK/mixed/src/test/kotlin/example"
cat > "$WORK/mixed/build.gradle.kts" <<'GRADLE'
dependencies {
  testImplementation("io.kotest:kotest-runner-junit5:5.9.1")
  testImplementation("org.junit.jupiter:junit-jupiter:5.11.0")
}
GRADLE
cat > "$WORK/mixed/src/test/kotlin/example/MixedTest.kt" <<'KOTLIN'
import io.kotest.core.spec.style.StringSpec
import org.junit.jupiter.api.Test
class MixedTest : StringSpec({ }) { @Test fun works() {} }
KOTLIN
node "$DETECTOR" "$WORK/mixed" > "$WORK/mixed.json"
node - "$WORK/mixed.json" <<'NODE'
if (require(process.argv[2]).primaryFramework !== 'mixed') process.exit(1);
NODE

cat > "$WORK/false-green.xml" <<'XML'
<testsuite tests="4" skipped="0" failures="0" errors="0"><testcase classname="example.RepositoryIntegrationTest"/><system-out>Could not find a valid Docker environment. NoSuchFileException (/var/run/docker.sock)</system-out></testsuite>
XML
if node "$RESULT_VALIDATOR" "$WORK/false-green.xml" example.RepositoryIntegrationTest >/dev/null 2>&1; then
  echo 'false-green Testcontainers result was accepted' >&2
  exit 1
fi
cat > "$WORK/proven.xml" <<'XML'
<testsuite tests="1" skipped="0" failures="0" errors="0"><testcase classname="example.RepositoryIntegrationTest"/><system-out>Container abc is starting: postgres:16
Container abc started in PT1S</system-out></testsuite>
XML
node "$RESULT_VALIDATOR" "$WORK/proven.xml" example.RepositoryIntegrationTest >/dev/null

mkdir -p "$WORK/artifact-repo/module/build/test-results/test" "$WORK/artifact-repo/module/build/reports/tests" \
  "$WORK/artifact-repo/build/test-results/test" "$WORK/artifact-repo/target/surefire-reports" \
  "$WORK/artifact-repo/module/build/reports/problems"
touch "$WORK/artifact-repo/build.gradle.kts"
printf 'original-xml\n' > "$WORK/artifact-repo/module/build/test-results/test/original.xml"
printf 'original-html\n' > "$WORK/artifact-repo/module/build/reports/tests/index.html"
printf 'root-xml\n' > "$WORK/artifact-repo/build/test-results/test/root.xml"
printf 'maven-xml\n' > "$WORK/artifact-repo/target/surefire-reports/TEST-root.xml"
printf 'problems\n' > "$WORK/artifact-repo/module/build/reports/problems/problems.html"
node "$ARTIFACT_MANAGER" snapshot "$WORK/artifact-repo" "$WORK/artifact-snapshot" >/dev/null
test ! -e "$WORK/artifact-repo/module/build/test-results"
mkdir -p "$WORK/artifact-repo/module/build/test-results/test" "$WORK/artifact-repo/new/build/reports/tests"
printf 'generated\n' > "$WORK/artifact-repo/module/build/test-results/test/generated.xml"
printf 'generated\n' > "$WORK/artifact-repo/new/build/reports/tests/index.html"
node "$ARTIFACT_MANAGER" restore "$WORK/artifact-repo" "$WORK/artifact-snapshot" >/dev/null
grep -Fq 'original-xml' "$WORK/artifact-repo/module/build/test-results/test/original.xml"
grep -Fq 'original-html' "$WORK/artifact-repo/module/build/reports/tests/index.html"
grep -Fq 'root-xml' "$WORK/artifact-repo/build/test-results/test/root.xml"
grep -Fq 'maven-xml' "$WORK/artifact-repo/target/surefire-reports/TEST-root.xml"
grep -Fq 'problems' "$WORK/artifact-repo/module/build/reports/problems/problems.html"
test ! -e "$WORK/artifact-repo/module/build/test-results/test/generated.xml"
test ! -e "$WORK/artifact-repo/new/build/reports/tests"

mkdir -p "$WORK/artifact-safe/module/build/test-results/test"
touch "$WORK/artifact-safe/build.gradle.kts"
printf 'original\n' > "$WORK/artifact-safe/module/build/test-results/test/original.xml"
node "$ARTIFACT_MANAGER" snapshot "$WORK/artifact-safe" "$WORK/artifact-safe-snapshot" >/dev/null
mkdir -p "$WORK/artifact-safe/module/build/test-results/test"
printf 'generated\n' > "$WORK/artifact-safe/module/build/test-results/test/generated.xml"
node - "$WORK/artifact-safe-snapshot/manifest.json" <<'NODE'
const fs = require('node:fs');
const file = process.argv[2];
const manifest = require(file);
manifest.artifacts[0].relative = '../outside';
fs.writeFileSync(file, JSON.stringify(manifest));
NODE
if node "$ARTIFACT_MANAGER" restore "$WORK/artifact-safe" "$WORK/artifact-safe-snapshot" >/dev/null 2>&1; then
  echo 'unsafe artifact manifest was accepted' >&2
  exit 1
fi
grep -Fq 'generated' "$WORK/artifact-safe/module/build/test-results/test/generated.xml"

mkdir -p "$WORK/artifact-backup-link/build/test-results/test" "$WORK/artifact-backup-link-outside"
touch "$WORK/artifact-backup-link/build.gradle.kts"
printf 'original\n' > "$WORK/artifact-backup-link/build/test-results/test/original.xml"
node "$ARTIFACT_MANAGER" snapshot "$WORK/artifact-backup-link" "$WORK/artifact-backup-link-snapshot" >/dev/null
mkdir -p "$WORK/artifact-backup-link/build/test-results/test"
printf 'generated\n' > "$WORK/artifact-backup-link/build/test-results/test/generated.xml"
mv "$WORK/artifact-backup-link-snapshot/items/0" "$WORK/artifact-backup-link-snapshot/items/0-real"
ln -s "$WORK/artifact-backup-link-outside" "$WORK/artifact-backup-link-snapshot/items/0"
if node "$ARTIFACT_MANAGER" restore "$WORK/artifact-backup-link" "$WORK/artifact-backup-link-snapshot" >/dev/null 2>&1; then
  echo 'symlinked artifact backup was accepted' >&2
  exit 1
fi
grep -Fq 'generated' "$WORK/artifact-backup-link/build/test-results/test/generated.xml"

mkdir -p "$WORK/artifact-empty" "$WORK/artifact-outside/build/test-results"
touch "$WORK/artifact-empty/build.gradle.kts" "$WORK/artifact-outside/build/test-results/sentinel"
node "$ARTIFACT_MANAGER" audit "$WORK/artifact-empty" >/dev/null
ln -s "$WORK/artifact-outside/build" "$WORK/artifact-empty/build"
if node "$ARTIFACT_MANAGER" audit "$WORK/artifact-empty" >/dev/null 2>&1; then
  echo 'symlinked artifact boundary was accepted' >&2
  exit 1
fi
test -f "$WORK/artifact-outside/build/test-results/sentinel"

mkdir -p "$WORK/results/module/build/test-results/test"
touch "$WORK/results/build.gradle.kts"
cat > "$WORK/results/module/build/test-results/test/TEST-example.AsyncTest.xml" <<'XML'
<testsuite tests="2" skipped="0" failures="1" errors="0">
  <testcase classname="example.AsyncTest" name="passes"/>
  <testcase classname="example.AsyncTest" name="records payload"><failure message="missing payload">java.lang.AssertionError
    at example.AsyncTest.test(AsyncTest.kt:42)
  </failure></testcase>
  <system-out>Container confluentinc/cp-kafka:7.8.1 started in PT2S</system-out>
</testsuite>
XML
node "$RESULT_SUMMARIZER" "$WORK/results" > "$WORK/results.json"
node - "$WORK/results.json" <<'NODE'
const summary = require(process.argv[2]);
if (summary.totals.tests !== 2 || summary.totals.failures !== 1 || summary.passed !== 1) process.exit(1);
if (summary.failedTests[0].location !== 'AsyncTest.kt:42') process.exit(1);
if (!summary.runtimeProof.startedImages.includes('confluentinc/cp-kafka:7.8.1')) process.exit(1);
NODE

mkdir -p "$WORK/results-empty"
touch "$WORK/results-empty/build.gradle.kts"
if node "$RESULT_SUMMARIZER" "$WORK/results-empty" > "$WORK/results-empty.json"; then
  echo 'empty test result set was accepted' >&2
  exit 1
fi
grep -Fq '"status": "no-results"' "$WORK/results-empty.json"

mkdir -p "$WORK/results-link" "$WORK/results-link-outside"
touch "$WORK/results-link/build.gradle.kts"
ln -s "$WORK/results-link-outside" "$WORK/results-link/build"
if node "$RESULT_SUMMARIZER" "$WORK/results-link" >/dev/null 2>&1; then
  echo 'symlinked result boundary was summarized' >&2
  exit 1
fi

node "$VERDICT_CONTRACT"

echo 'e2e test profile contract: PASS'
