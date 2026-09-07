#!/usr/bin/env bash
# Offline behavioral and improvement contract entrypoint. No LLM runtime calls.
set -eu
DIR="$(cd "$(dirname "$0")" && pwd)"
node --test "$DIR/behavioral/tests/harness-incidents.test.js"
bash "$DIR/behavioral/tests/awk-audit.test.sh"
bash "$DIR/behavioral/tests/git-gates.test.sh"
bash "$DIR/behavioral/tests/runner-hardening.test.sh"
bash "$DIR/behavioral/tests/codex-adapter.test.sh"
node --test "$DIR/behavioral/tests/local-adapters.test.cjs"
bash "$DIR/behavioral/tests/contracts.test.sh"
bash "$DIR/behavioral/tests/coverage-baseline.test.sh"
bash "$DIR/improvements/tests/contracts.test.sh"
bash "$DIR/improvements/validate-improvement-records.sh"
