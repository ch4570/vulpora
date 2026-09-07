#!/usr/bin/env bash
# Offline shared-budget and context serialization contracts.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd -P)"
node --test "$DIR/session-budget.test.js" "$DIR/session-io.test.js"
