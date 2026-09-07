#!/usr/bin/env bash

set -eu
set -o pipefail
set -f

TEST_DIR="$(cd "$(dirname "$0")" && pwd -P)"
ROOT="$(cd "$TEST_DIR/../../.." && pwd -P)"
RUNNER="$ROOT/skills/agent-eval/scripts/run-skillevaluator.sh"
POLICY="$ROOT/skills/agent-eval/config/skillevaluator-policy.yaml"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/vulpora-skillevaluator-contract.XXXXXX")"
WORK="$(cd "$WORK" && pwd -P)"

cleanup() {
  if [ -d "$WORK" ] && [ ! -L "$WORK" ]; then
    case "$WORK" in "${TMPDIR:-/tmp}"/vulpora-skillevaluator-contract.*) rm -rf "$WORK" ;; esac
  fi
}
trap cleanup EXIT HUP INT TERM

mkdir -p "$WORK/bin" "$WORK/skill" "$WORK/catalog/fixture-skill" "$WORK/out"
printf '%s\n' '---' 'name: fixture-skill' 'description: Fixture for wrapper contract tests.' '---' > "$WORK/skill/SKILL.md"
printf '%s\n' '---' 'name: fixture-skill' 'description: Fixture for wrapper contract tests.' '---' > "$WORK/catalog/fixture-skill/SKILL.md"

cat > "$WORK/bin/skillevaluator" <<'FAKE'
#!/usr/bin/env bash
set -eu
if [ "$*" = '--version' ]; then
  printf 'skillevaluator, version %s\n' "${FAKE_SKILLEVALUATOR_VERSION:-0.2.1}"
  exit 0
fi
printf '%s\n' "$*" >> "$FAKE_SKILLEVALUATOR_LOG"
printf '%s\n' "${SKILLEVALUATOR_SCHEMA_ALLOWED_DIRS:-}" >> "$FAKE_SKILLEVALUATOR_ENV"
exit "${FAKE_SKILLEVALUATOR_EXIT:-0}"
FAKE
chmod +x "$WORK/bin/skillevaluator"

cat > "$WORK/bin/uv" <<'FAKE_UV'
#!/usr/bin/env bash
printf '%s\n' 'unexpected uv invocation' > "$FAKE_SKILLEVALUATOR_UNEXPECTED_UV"
exit 99
FAKE_UV
chmod +x "$WORK/bin/uv"

export SKILLEVALUATOR_BIN="$WORK/bin/skillevaluator"
export FAKE_SKILLEVALUATOR_LOG="$WORK/calls.log"
export FAKE_SKILLEVALUATOR_ENV="$WORK/env.log"
export FAKE_SKILLEVALUATOR_UNEXPECTED_UV="$WORK/unexpected-uv.log"
export PATH="$WORK/bin:$PATH"

bash "$RUNNER" --output-dir "$WORK/out" "$WORK/skill"
grep -Fq "validate $WORK/skill --type skill --checks schema,pii,license,quality,unicode,lint --policy $POLICY --no-dedup --continue-on-failure -r json,markdown -o $WORK/out" "$WORK/calls.log"
grep -Fq 'reference' "$WORK/env.log"

: > "$WORK/calls.log"
bash "$RUNNER" --catalog --output-dir "$WORK/out" "$WORK/catalog"
grep -Fq "validate $WORK/catalog --type skill --checks schema,pii,license,quality,unicode,lint --policy $POLICY --no-dedup --continue-on-failure -r json,markdown -o $WORK/out" "$WORK/calls.log"

if bash "$RUNNER" --catalog --mode tier2 --output-dir "$WORK/out" "$WORK/catalog" >/dev/null 2>&1; then
  printf '%s\n' 'wrapper accepted catalog Tier 2 evaluation' >&2
  exit 1
fi

: > "$WORK/calls.log"
bash "$RUNNER" --mode security --output-dir "$WORK/out" "$WORK/skill"
grep -Fq -- '--checks schema,security,pii,license,code-integrity,unicode,quality,lint' "$WORK/calls.log"
grep -Fq -- '--no-dedup' "$WORK/calls.log"

: > "$WORK/calls.log"
bash "$RUNNER" --mode tier2 --output-dir "$WORK/out" "$WORK/skill"
grep -Fq "context-optimization-check $WORK/skill -r json,markdown -o $WORK/out" "$WORK/calls.log"

: > "$WORK/calls.log"
bash "$RUNNER" --mode tier3 --agents codex --env-mode docker --output-dir "$WORK/out" "$WORK/skill"
[ "$(wc -l < "$WORK/calls.log" | tr -d ' ')" = 2 ]
sed -n '1p' "$WORK/calls.log" | grep -Fqx 'doctor --agents codex --env-mode docker'
sed -n '2p' "$WORK/calls.log" | grep -Fq "tier3 evaluate $WORK/skill --agents codex --env-mode docker --results-dir $WORK/out"

if FAKE_SKILLEVALUATOR_EXIT=1 bash "$RUNNER" --output-dir "$WORK/out" "$WORK/skill" >/dev/null 2>&1; then
  printf '%s\n' 'wrapper swallowed evaluator failure' >&2
  exit 1
fi

if SKILLEVALUATOR_BIN="$WORK/missing" bash "$RUNNER" --output-dir "$WORK/out" "$WORK/skill" >/dev/null 2>&1; then
  printf '%s\n' 'wrapper accepted a missing evaluator' >&2
  exit 1
fi

if FAKE_SKILLEVALUATOR_VERSION=0.2.0 bash "$RUNNER" --output-dir "$WORK/out" "$WORK/skill" >/dev/null 2>&1; then
  printf '%s\n' 'wrapper accepted an unpinned evaluator version' >&2
  exit 1
fi

if bash "$RUNNER" --mode full --output-dir "$WORK/out" "$WORK/skill" >/dev/null 2>&1; then
  printf '%s\n' 'wrapper exposed upstream mutating advisory full mode' >&2
  exit 1
fi

grep -Fq 'SCHEMA.author_missing: low' "$POLICY"
grep -Fq '3bfba44e754be87073b2344233f9569b06509ce1' "$RUNNER"
[ "$(grep -Fxc '  *'"'"'version 0.2.1'"'"') ;;' "$RUNNER")" = 1 ]
[ "$(find "$WORK/skill" -type f | wc -l | tr -d ' ')" = 1 ]
[ ! -e "$FAKE_SKILLEVALUATOR_UNEXPECTED_UV" ]

printf '%s\n' 'agent-eval SkillEvaluator wrapper: PASS'
