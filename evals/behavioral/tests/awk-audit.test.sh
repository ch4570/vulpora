#!/usr/bin/env bash
set -eu
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/vulpora-awk-audit-test.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT HUP INT TERM
mkdir "$WORK/audit"
printf '%s\n' '#!/bin/sh' 'echo "awk: warning: synthetic diagnostic" >&2' 'echo synthetic-output' 'exit 7' > "$WORK/fake-awk"
chmod +x "$WORK/fake-awk"
code=0
VULPORA_AWK_BINARY="$WORK/fake-awk" VULPORA_AWK_AUDIT_DIR="$WORK/audit" \
  bash "$ROOT/evals/awk-audit-wrapper.sh" > "$WORK/stdout" 2> /dev/null || code=$?
[ "$code" -eq 7 ]
grep -Fqx synthetic-output "$WORK/stdout"
find "$WORK/audit" -type f -exec grep -Fq 'awk: warning: synthetic diagnostic' {} \;
[ "$(find "$WORK/audit" -type f ! -size 0 | wc -l | tr -d ' ')" -eq 1 ]
echo 'awk audit contracts: PASS'
