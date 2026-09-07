#!/usr/bin/env bash
# Report whether every manifest agent has at least one behavioral case.
# Case assets may also be skills/workflows; those are reported separately and do
# not satisfy agent coverage accidentally.

set -eu
set -o pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/../.." && pwd)"
MANIFEST="$ROOT/install/manifest.txt"
CASES="$DIR/cases"
MODE="report"
# Test-only control for exercising aggregation across multiple xargs children.
# The ordinary path leaves batching to xargs, which remains safe for ARG_MAX.
XARGS_MAX_ARGS="${VULPORA_COVERAGE_XARGS_MAX_ARGS:-}"

for arg in "$@"; do
  case "$arg" in
    --report) MODE="report" ;;
    --strict) MODE="strict" ;;
    --manifest=*) MANIFEST="${arg#--manifest=}" ;;
    --cases=*) CASES="${arg#--cases=}" ;;
    -h|--help) sed -n '2,8p' "$0" | sed 's/^# //'; exit 0 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

[ -f "$MANIFEST" ] || { echo "manifest not found: $MANIFEST" >&2; exit 2; }
[ -d "$CASES" ] || { echo "cases directory not found: $CASES" >&2; exit 2; }
if [ -n "$XARGS_MAX_ARGS" ] && ! [[ "$XARGS_MAX_ARGS" =~ ^[1-9][0-9]*$ ]]; then
  echo "VULPORA_COVERAGE_XARGS_MAX_ARGS must be a positive integer" >&2
  exit 2
fi

work="$(mktemp -d "${TMPDIR:-/tmp}/vulpora-coverage.XXXXXX")"
trap 'rm -rf "$work"' EXIT HUP INT TERM
case_count="$(find "$CASES" -name '*.yaml' -type f -print | wc -l | tr -d ' ')"
if [ "$case_count" -eq 0 ]; then
  echo 'status: NOT_RUN; scanned_cases: 0; reason: empty_coverage_catalog' >&2
  exit 2
fi

# Trim fields in awk so the report remains stable if the manifest is aligned.
awk -F '|' '
  /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
  {
    kind=$1; id=$2
    gsub(/^[[:space:]]+|[[:space:]]+$/, "", kind)
    gsub(/^[[:space:]]+|[[:space:]]+$/, "", id)
    if (kind == "agent") print id
  }
' "$MANIFEST" | LC_ALL=C sort -u > "$work/agents"
if [ ! -s "$work/agents" ]; then
  echo 'status: NOT_RUN; scanned_agents: 0; reason: empty_agent_manifest' >&2
  exit 2
fi

awk -F '|' '
  /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
  {
    kind=$1; id=$2
    gsub(/^[[:space:]]+|[[:space:]]+$/, "", kind)
    gsub(/^[[:space:]]+|[[:space:]]+$/, "", id)
    if (kind != "agent") print id
  }
' "$MANIFEST" | LC_ALL=C sort -u > "$work/non_agents"

: > "$work/duplicate_root_identity_cases.raw"
find "$CASES" -name '*.yaml' -type f -print0 | xargs -0 awk -F ':[[:space:]]*' '
  # Only root identity fields are catalog evidence.  In particular, a prompt
  # block that says "  agent: ..." must not satisfy an uncovered-agent gate.
  /^(asset|agent):[[:space:]]*/ {
    id=$2; sub(/[[:space:]]+#.*$/, "", id); gsub(/^[[:space:]]+|[[:space:]]+$/, "", id)
    if (id == "") { print "D\t" FILENAME; next }
    if (++identity_count[FILENAME] > 1) print "D\t" FILENAME
    else print "A\t" id
  }
' | awk -F '\t' '
  $1 == "A" { print $2 }
  $1 == "D" { print $2 > duplicate_file }
' duplicate_file="$work/duplicate_root_identity_cases.raw" | LC_ALL=C sort -u > "$work/case_assets"
LC_ALL=C sort -u "$work/duplicate_root_identity_cases.raw" > "$work/duplicate_root_identity_cases"

comm -12 "$work/agents" "$work/case_assets" > "$work/covered_agents"
comm -23 "$work/agents" "$work/case_assets" > "$work/uncovered_agents"
comm -12 "$work/non_agents" "$work/case_assets" > "$work/skill_or_workflow_assets"
comm -23 "$work/case_assets" <(cat "$work/agents" "$work/non_agents" | LC_ALL=C sort -u) > "$work/unrecognized_assets"

# Promotion-grade cases must declare evidence the runner can verify. Keep this
# structural gate independent from runner execution so a legacy prose artifact
# cannot quietly re-enter the catalog.
: > "$work/legacy_artifact_cases.raw"
xargs_args=(-0)
if [ -n "$XARGS_MAX_ARGS" ]; then
  xargs_args+=(-n "$XARGS_MAX_ARGS")
fi
find "$CASES" -name '*.yaml' -type f -print0 | xargs "${xargs_args[@]}" awk '
  # Scan only expected.required_artifacts. Prompt prose may intentionally show
  # YAML-shaped adversarial text and is never catalog contract evidence.
  /^expected:[[:space:]]*$/ { in_expected=1; in_art=0; next }
  in_expected && /^[^[:space:]#]/ { in_expected=0; in_art=0; next }
  in_expected && /^  required_artifacts:[[:space:]]*$/ { in_art=1; next }
  in_expected && /^  [A-Za-z_][A-Za-z0-9_]*:/ { in_art=0; next }
  in_art && /^    -[[:space:]]*/ {
    value=$0; sub(/^    -[[:space:]]*/, "", value)
    sub(/^[[:space:]]+|[[:space:]]+$/, "", value)
    if ((value ~ /^".*"$/) || (value ~ /^\047.*\047$/)) value=substr(value,2,length(value)-2)
    if (value ~ /^(text|file|dir|file_existing|dir_existing):/) print "E"
    else print "L\t" FILENAME
    next
  }
  in_art && /^  / { in_art=0 }
' | awk -F '\t' '
  $1 == "E" { required++; explicit++; next }
  $1 == "L" { required++; legacy++; print $2 > legacy_file }
  END { printf "%d\t%d\t%d\n", required, explicit, legacy > counts }
' counts="$work/artifact_counts" legacy_file="$work/legacy_artifact_cases.raw"
LC_ALL=C sort -u "$work/legacy_artifact_cases.raw" > "$work/legacy_artifact_cases"

count() { wc -l < "$1" | tr -d ' '; }
IFS=$'\t' read -r artifact_required artifact_explicit artifact_legacy < "$work/artifact_counts"
printf 'catalog_coverage: agents=%s covered=%s uncovered=%s\n' "$(count "$work/agents")" "$(count "$work/covered_agents")" "$(count "$work/uncovered_agents")"
printf 'case_assets: agent=%s skill_or_workflow=%s unrecognized=%s\n' "$(count "$work/covered_agents")" "$(count "$work/skill_or_workflow_assets")" "$(count "$work/unrecognized_assets")"
printf 'artifact_contracts: required=%s explicit=%s legacy=%s\n' "$artifact_required" "$artifact_explicit" "$artifact_legacy"
for label in uncovered_agents skill_or_workflow_assets unrecognized_assets duplicate_root_identity_cases; do
  printf '%s:\n' "$label"
  sed 's/^/  - /' "$work/$label"
done
printf 'legacy_artifact_cases:\n'
sed 's#^.*/cases/#  - #' "$work/legacy_artifact_cases"

if [ "$MODE" = strict ] && { [ -s "$work/uncovered_agents" ] || [ -s "$work/unrecognized_assets" ] || [ -s "$work/duplicate_root_identity_cases" ] || [ "$artifact_legacy" != 0 ]; }; then
  echo "coverage gate: FAIL (uncovered agents, ambiguous case identity, unrecognized case assets, or legacy artifacts)" >&2
  exit 1
fi
