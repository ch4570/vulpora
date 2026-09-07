#!/usr/bin/env bash
set -u
DIR="$(cd "$(dirname "$0")" && pwd -P)"
exec bash "$DIR/test-start-task-live.sh" --runtime codex "$@"
