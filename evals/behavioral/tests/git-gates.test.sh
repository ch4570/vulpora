#!/usr/bin/env bash
# Isolated repositories; no remote push, credentials, or user Git config writes.
set -eu
set -o pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/vulpora-git-gates.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT HUP INT TERM
mkdir "$WORK/repo"
cd "$WORK/repo"
git init -q
git config user.name 'Synthetic Test'
git config user.email 'test@example.invalid'
cp -R "$ROOT/templates/githooks" .githooks
mkdir scripts
expect_failure() {
  local signal="$1"; shift
  if "$@" > "$WORK/output" 2>&1; then echo "unexpected gate success: $signal" >&2; exit 1; fi
  grep -Fq "$signal" "$WORK/output"
}
expect_failure missing_or_ambiguous_gate sh .githooks/pre-commit
expect_failure missing_or_ambiguous_gate sh .githooks/pre-push < /dev/null
cp "$ROOT/templates/scripts/agent-memory-gate.sh" scripts/
expect_failure 'status=NOT_RUN scanned_files=0' sh scripts/agent-memory-gate.sh
sh scripts/agent-memory-gate.sh --allow-empty > "$WORK/output"
grep -Fq 'status=NOT_RUN scanned_files=0' "$WORK/output"
printf 'synthetic\n' > README.md
git add README.md
sh .githooks/pre-commit > "$WORK/output"
grep -Fq 'status=PASS scanned_files=1 source=stdin0' "$WORK/output"
git -c core.hooksPath=/dev/null commit -qm baseline
base="$(git rev-parse HEAD)"
# Quoted, space-containing names are consumed through Git NUL records.
printf 'synthetic\n' > 'unsafe" transcript.transcript'
git add 'unsafe" transcript.transcript'
expect_failure forbidden_paths sh .githooks/pre-commit
git -c core.hooksPath=/dev/null commit -qm 'synthetic forbidden history'
git rm -q 'unsafe" transcript.transcript'
git -c core.hooksPath=/dev/null commit -qm 'synthetic cleanup'
tip="$(git rev-parse HEAD)"
printf 'refs/heads/main %s refs/heads/main %s\n' "$tip" "$base" > "$WORK/push-input"
expect_failure forbidden_paths sh .githooks/pre-push < "$WORK/push-input"
printf 'refs/heads/main %s refs/heads/main %040d\n' "$tip" 1 > "$WORK/push-input"
expect_failure unreadable_push_range sh .githooks/pre-push < "$WORK/push-input"
# Legacy runtime installations remain discoverable when exactly one exists.
mkdir -p .codex/scripts
mv scripts/agent-memory-gate.sh .codex/scripts/
sh .githooks/pre-commit > "$WORK/output"
grep -Fq 'status=NOT_RUN scanned_files=0' "$WORK/output"
mkdir -p .claude/scripts
cp .codex/scripts/agent-memory-gate.sh .claude/scripts/
expect_failure missing_or_ambiguous_gate sh .githooks/pre-commit
# A stale no-op gate cannot satisfy the hook merely by returning zero.
printf '#!/bin/sh\nexit 0\n' > scripts/agent-memory-gate.sh
expect_failure missing_scan_receipt sh .githooks/pre-commit
printf '%s\n' 'git gate contracts: PASS'
