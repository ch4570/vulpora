#!/usr/bin/env bash
# Discover and execute every offline shell contract test in the public source.
# Live runtime tests and the npm tarball integration are separate explicit jobs.

set -u
set -o pipefail
set -f
umask 077

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"
INVENTORY="$(mktemp "${TMPDIR:-/tmp}/vulpora-offline-tests.XXXXXX")" || exit 1
trap 'rm -f "$INVENTORY"' EXIT HUP INT TERM
TEST_LOG="$(mktemp "${TMPDIR:-/tmp}/vulpora-offline-output.XXXXXX")" || exit 1
trap 'rm -f "$INVENTORY" "$TEST_LOG"' EXIT HUP INT TERM

if ! find "$REPO_ROOT/install" "$REPO_ROOT/agents" "$REPO_ROOT/skills" \
  -type f \( -name 'test-*.sh' -o -name '*.test.sh' -o -path '*/tests/*.sh' \) \
  -not -path '*/node_modules/*' -print \
  | LC_ALL=C sort > "$INVENTORY"; then
  printf 'offline suite: FAIL reason=inventory_failed\n' >&2
  exit 1
fi

pass=0
fail=0
while IFS= read -r test_path; do
  [ -n "$test_path" ] || continue
  relative="${test_path#"$REPO_ROOT"/}"
  case "$relative" in
    install/test-offline-suite.sh|\
    install/test-npm-package.sh|\
    install/test-runtime-agent-catalog-live.sh|\
    install/test-start-task-matrix.sh|\
    install/test-start-task-claude-live.sh|\
    install/test-start-task-codex-live.sh|\
    install/test-start-task-live.sh|\
    skills/diagram-styler/tests/fixtures/*)
      continue
      ;;
  esac

  printf 'offline test: %s\n' "$relative"
  if bash "$test_path" > "$TEST_LOG" 2>&1; then
    cat "$TEST_LOG"
    pass=$((pass + 1))
  else
    # Release/prepack intentionally suppress successful stdout. Preserve the
    # failing test's diagnostics on stderr so CI can identify the real cause.
    cat "$TEST_LOG" >&2
    printf 'offline test failed: %s\n' "$relative" >&2
    fail=$((fail + 1))
  fi
done < "$INVENTORY"

printf 'offline suite: PASS=%s FAIL=%s\n' "$pass" "$fail"
if [ "$pass" -eq 0 ] && [ "$fail" -eq 0 ]; then
  printf 'offline suite: NOT_RUN reason=no_tests_executed\n' >&2
  exit 1
fi
[ "$fail" -eq 0 ]
