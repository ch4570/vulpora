#!/usr/bin/env bash
# Offline cryptographic evidence and bounded local-runner regression tests.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
node --test "$SCRIPT_DIR/eval-evidence.test.js" "$SCRIPT_DIR/run-budgeted-eval.test.js"
