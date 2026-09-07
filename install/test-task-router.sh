#!/usr/bin/env bash
# Classification, budgets, explicit policy and fresh-session route semantics.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd -P)"
node --test "$DIR/task-router.test.js"
