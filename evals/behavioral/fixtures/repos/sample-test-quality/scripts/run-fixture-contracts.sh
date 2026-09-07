#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$(mktemp -d "${TMPDIR:-/tmp}/sample-test-quality.XXXXXX")"
trap 'rm -rf "$OUT"' EXIT

javac -d "$OUT" "$ROOT/src/main/java/samplequality/FixtureContractRunner.java"
java -cp "$OUT" samplequality.FixtureContractRunner
