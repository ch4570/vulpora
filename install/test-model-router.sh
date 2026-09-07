#!/usr/bin/env bash
# Deterministic routing decisions and CLI integration; no model requests.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd -P)"
node --test "$DIR/model-router.test.js"
