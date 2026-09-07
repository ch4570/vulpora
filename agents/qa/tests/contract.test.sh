#!/usr/bin/env bash
set -eu
set -f

QA_ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"

test -s "$QA_ROOT/reference/qa-test-plan-contract.md"
test -x "$QA_ROOT/scripts/validate-test-plan.js"
test -x "$QA_ROOT/tests/validator.test.js"

for required in \
  'qa-test-plan-contract.md' \
  'validate-test-plan.js' \
  '*.qa-plan.json' \
  'QAP-P0-UNCOVERED' \
  'seed/cleanup/absence-probe'; do
  grep -Fq "$required" "$QA_ROOT/../qa-test-designer.md"
done

node "$QA_ROOT/tests/validator.test.js"
