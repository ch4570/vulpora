#!/usr/bin/env bash
# Summarize behavioral result YAML files as a markdown table.

set -u

DIR="$(cd "$(dirname "$0")" && pwd)"
RESULTS="${VULPORA_BEHAVIORAL_RESULTS_DIR:-$DIR/results}"

field() {
  local key="$1" file="$2"
  grep -E "^$key:" "$file" | head -1 | sed -E "s/^$key:[[:space:]]*//; s/[[:space:]]+#.*$//; s/[[:space:]]*$//"
}

nested_field() {
  local key="$1" file="$2"
  grep -E "^[[:space:]]+$key:" "$file" | head -1 | sed -E "s/^[[:space:]]+$key:[[:space:]]*//; s/[[:space:]]+#.*$//; s/[[:space:]]*$//"
}

actual_field() {
  local key="$1" file="$2"
  grep -E '^actual:' "$file" | head -1 |
    sed -E "s/.*$key: ([^,}]+).*/\1/"
}

echo "# Behavioral Eval Results"
echo ""
echo "| case | runtime | baseline | verdict | outcome | process | safety | cost | file |"
echo "|---|---|---|---:|---:|---:|---:|---:|---|"

found=0
for f in "$RESULTS"/*.yaml; do
  [ -f "$f" ] || continue
  found=1
  case_id="$(field case_id "$f")"
  runtime="$(nested_field runtime "$f")"
  baseline="$(nested_field baseline_mode "$f")"
  verdict="$(field verdict "$f")"
  outcome="$(actual_field outcome_score "$f")"
  process="$(actual_field process_score "$f")"
  safety="$(actual_field safety_score "$f")"
  cost="$(actual_field cost_score "$f")"
  printf '| `%s` | `%s` | `%s` | %s | %s | %s | %s | %s | `%s` |\n' \
    "$case_id" "$runtime" "$baseline" "$verdict" "$outcome" "$process" "$safety" "$cost" "$(basename "$f")"
done

if [ "$found" = 0 ]; then
  echo "| _no results_ |  |  |  |  |  |  |  |  |"
fi
