#!/usr/bin/env bash
# Offline routing, context limits, accounting, and fake-runtime regressions.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd -P)"
bash "$DIR/test-model-router.sh"
bash "$DIR/test-task-router.sh"
bash "$DIR/test-codex-model-catalog.sh"
bash "$DIR/test-codex-agent-compat.sh"
bash "$DIR/test-start-task-evidence.sh"
bash "$DIR/test-session-accounting.sh"
bash "$DIR/test-session-runner.sh"
