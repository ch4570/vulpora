#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILL="$ROOT/SKILL.md"
KOTEST="$ROOT/reference/kb/kotest-idioms.md"
JUNIT="$ROOT/reference/kb/junit5-idioms.md"
COROUTINES="$ROOT/reference/kb/coroutine-unit-testing.md"
JPA="$ROOT/reference/kb/jpa-persistence-testing.md"
REFACTORING="$ROOT/reference/kb/refactoring-resistant-tests.md"
AGENTIC="$ROOT/reference/kb/agentic-coding-safety-net.md"
PRINCIPLES="$ROOT/reference/principles.md"
KB_ROOT="$ROOT/reference/kb"

require() {
  local file="$1" text="$2"
  grep -Fq "$text" "$file" || { echo "missing '$text' in $file" >&2; exit 1; }
}

for file in "$SKILL" "$KOTEST" "$JUNIT" "$COROUTINES" "$JPA" "$REFACTORING" "$AGENTIC" "$PRINCIPLES"; do
  test -s "$file"
done

# TST identifiers are a stable API: SKILL.md defines exactly TST-1..TST-20 once,
# and every identifier cited by a supporting reference resolves to that registry.
for number in $(seq 1 20); do
  count="$(grep -Ec "^\| \*\*TST-${number}\*\* \|" "$SKILL")"
  if [[ "$count" -ne 1 ]]; then
    echo "expected exactly one authoritative definition for TST-${number}, found ${count}" >&2
    exit 1
  fi
done

while IFS= read -r rule; do
  number="${rule#TST-}"
  if ! grep -Eq "^\| \*\*TST-${number}\*\* \|" "$SKILL"; then
    echo "reference cites undefined rule ${rule}" >&2
    exit 1
  fi
done < <(rg -o --no-filename 'TST-[0-9]+' "$PRINCIPLES" "$KB_ROOT" | sort -u)

require "$SKILL" 'Detect before writing'
require "$SKILL" '## Requirements and limitations'
require "$SKILL" 'Do not use this skill to create or execute E2E'
require "$SKILL" 'E2E-profile detector merely to choose'
require "$SKILL" 'Prefer real deterministic collaborators and a narrow integration boundary before mocks'
require "$SKILL" 'after considering a real collaborator'
require "$SKILL" '### 3. Mock selection gate'
require "$SKILL" 'do not create a one-off private class that mirrors a production interface'
require "$SKILL" 'An implementation-only refactor must not require widespread test edits'
require "$SKILL" 'Refactoring-resistant tests'
require "$SKILL" '### 4. Agentic change safety gate'
require "$SKILL" 'Treat existing tests, assertions, fixtures, snapshots, graders, coverage rules, and CI configuration as protected evidence'
require "$SKILL" 'temporary controlled mutation/revert'
require "$SKILL" 'zero discovered tests, stale reports, or cache-only/`UP-TO-DATE` output'
require "$SKILL" 'Derive expected values from requirements, public contracts, or independently calculated examples'
require "$SKILL" 'SDK mocks and self-declared faithful fakes do not prove that contract'
require "$SKILL" 'Do not globally enable relaxed behavior'
require "$SKILL" 'capture and assert every contract-bearing argument'
require "$SKILL" 'must not run database-wide, schema-wide, bucket-wide, topic-wide, or cache-wide destructive cleanup'
require "$SKILL" 'A JUnit project must not extend a Kotest base class'
require "$SKILL" 'Apply this profile **only when'
require "$SKILL" 'Kotest dependencies or `*Spec` tests'
require "$SKILL" 'JUnit Jupiter dependencies or `org.junit.jupiter` tests'
require "$SKILL" 'Multiple JUnit Platform engines, `@Suite`, or `useJUnitPlatform()`'
require "$KOTEST" 'Use this only after detecting Kotest and its version.'
require "$KOTEST" 'InstancePerRoot'
require "$KOTEST" '`InstancePerLeaf` and `InstancePerTest` are deprecated'
require "$KOTEST" 'withTests'
require "$JUNIT" 'mixed suites are normal'
require "$JUNIT" '@ParameterizedTest'
require "$JUNIT" 'Parallel execution is opt-in and configuration-driven.'
require "$JUNIT" 'Never require a Kotest base class'
require "$SKILL" 'JPA persistence contract profile'
require "$SKILL" 'single normative definition of the `TST-n` rule set'
require "$SKILL" 'DB-slice base plus'
require "$SKILL" 'Save and reload through the injected repository'
require "$SKILL" 'direct `EntityManager` flush/clear is strictly test plumbing'
require "$SKILL" 'Use `persist`/`find`/`merge` only when'
require "$JPA" 'PST-1'
require "$JPA" 'PST-5'
require "$JPA" 'PST-6'
require "$JPA" 'Spring Data repository APIs'
require "$JPA" 'real-DB configuration'
require "$SKILL" 'strictly test plumbing'
require "$JPA" 'strictly as test plumbing'
require "$SKILL" 'per-test observation'
require "$SKILL" 'For coroutine code'
require "$SKILL" 'runTest'
require "$COROUTINES" 'Use this only after detecting `kotlinx-coroutines-test`'
require "$COROUTINES" 'StandardTestDispatcher'
require "$COROUTINES" 'advanceUntilIdle()'
require "$COROUTINES" 'Dispatchers.resetMain()'
require "$ROOT/reference/kb/test-doubles-and-mocks.md" '기본 순서: 통합 우선, mock은 경계에서만'
require "$ROOT/reference/kb/test-doubles-and-mocks.md" '반환값·결과 상태를 먼저 단언한다'
require "$ROOT/reference/kb/test-doubles-and-mocks.md" '## 외부 경계의 증명'
require "$ROOT/reference/kb/test-doubles-and-mocks.md" '## Mutation-survival 점검'
require "$ROOT/reference/kb/test-doubles-and-mocks.md" 'shared target에 `FLUSHDB`'
require "$ROOT/reference/kb/test-doubles-and-mocks.md" '## Fake 비용 기준'
require "$REFACTORING" '## 목표: 변경 증폭을 줄인다'
require "$REFACTORING" '## Private helper와 fake 선택 기준'
require "$REFACTORING" '## 배포 신뢰의 증거 사슬'
require "$ROOT/reference/kb/INDEX.md" '[refactoring-resistant-tests](refactoring-resistant-tests.md)'
require "$ROOT/reference/kb/INDEX.md" '[agentic-coding-safety-net](agentic-coding-safety-net.md)'
require "$AGENTIC" '## 위협 모델'
require "$AGENTIC" '## Oracle-integrity audit'
require "$AGENTIC" '## Negative proof'
require "$AGENTIC" '## Verification ladder'
require "$AGENTIC" 'zero discovered tests'

if grep -Fq 'private class RecordingOrderStore' "$ROOT/reference/kb/test-doubles-and-mocks.md"; then
  echo 'found the deprecated one-off private fake example' >&2
  exit 1
fi

for number in $(seq 1 6); do
  count="$(grep -Ec "^- \*\*PST-${number}:\*\*" "$SKILL")"
  if [[ "$count" -ne 1 ]]; then
    echo "expected exactly one authoritative definition for PST-${number}, found ${count}" >&2
    exit 1
  fi
done

if rg -q 'repository\x27s test framework is \*\*Kotest|The repository\x27s test framework is \*\*Kotest|New tests extend a `module:test-support`|the skill\x27s standard is \*\*`BehaviorSpec`' "$SKILL" "$KOTEST" "$JUNIT"; then
  echo 'found a universal Kotest/test-support requirement' >&2
  exit 1
fi

echo 'test-authoring routing contract: PASS'
