#!/usr/bin/env bash
# Exercise discovery and failure diagnostics without recursively running the catalog.
set -euo pipefail
set -f
DIR="$(cd "$(dirname "$0")" && pwd -P)"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/vulpora-offline-discovery.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT HUP INT TERM
mkdir -p "$WORK/repo/install" "$WORK/repo/agents" "$WORK/repo/skills"
cp "$DIR/test-offline-suite.sh" "$WORK/repo/install/test-offline-suite.sh"
suite="$WORK/repo/install/test-offline-suite.sh"

if bash "$suite" > "$WORK/stdout" 2> "$WORK/stderr"; then
  echo 'empty offline suite unexpectedly passed' >&2; exit 1
fi
grep -Fq 'NOT_RUN reason=no_tests_executed' "$WORK/stderr"

printf '#!/usr/bin/env bash\nprintf "healthy fixture\\n"\n' > "$WORK/repo/install/test-fixture.sh"
bash "$suite" > "$WORK/stdout" 2> "$WORK/stderr"
grep -Fq 'healthy fixture' "$WORK/stdout"
grep -Fq 'PASS=1 FAIL=0' "$WORK/stdout"

printf '#!/usr/bin/env bash\nprintf "failure from stdout\\n"\nprintf "failure from stderr\\n" >&2\nexit 42\n' > "$WORK/repo/install/test-fixture.sh"
if bash "$suite" > "$WORK/stdout" 2> "$WORK/stderr"; then
  echo 'failed offline test unexpectedly passed' >&2; exit 1
fi
grep -Fq 'failure from stdout' "$WORK/stderr"
grep -Fq 'failure from stderr' "$WORK/stderr"
grep -Fq 'offline test failed: install/test-fixture.sh' "$WORK/stderr"
grep -Fq 'PASS=0 FAIL=1' "$WORK/stdout"

mv "$WORK/repo/agents" "$WORK/agents-removed"
if bash "$suite" > "$WORK/stdout" 2> "$WORK/stderr"; then
  echo 'failed inventory unexpectedly passed' >&2; exit 1
fi
grep -Fq 'FAIL reason=inventory_failed' "$WORK/stderr"
printf 'offline suite discovery: PASS empty/healthy/failure-diagnostics/inventory-error\n'
