#!/usr/bin/env bash
# Integrity/coverage checks need only Python's standard library, never a model.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
python3 -m unittest discover -s "$ROOT/evals/token-efficiency" -p test_measure_skills.py
