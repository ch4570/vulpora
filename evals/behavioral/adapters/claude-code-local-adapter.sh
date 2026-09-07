#!/usr/bin/env bash
# Claude live evaluation is unavailable until machine-enforced isolation can be
# verified. --prepare-prompt only previews local input; it never invokes Claude.
set -eu

case "${1:-}" in
  --prepare-prompt)
    [ "$#" -eq 1 ] || { echo "usage: claude-code-local-adapter.sh [--prepare-prompt]" >&2; exit 2; }
    ;;
  "")
    # No environment flag, permission mode, CLI login or signed trial bundle
    # proves the current process is isolated. Existing evidence verification
    # explicitly leaves this operational control unverified.
    printf '%s\n' '{"runtime":"claude","outcome":"INCONCLUSIVE","reason":"MACHINE_ISOLATION_UNVERIFIED","promotion":"BLOCKED"}' >&2
    exit 3
    ;;
  *) echo "usage: claude-code-local-adapter.sh [--prepare-prompt]" >&2; exit 2 ;;
esac

case_file="${VULPORA_PROMPT_FILE:?VULPORA_PROMPT_FILE}"
fixture_repo="${VULPORA_FIXTURE_REPO:?VULPORA_FIXTURE_REPO}"
asset="${VULPORA_ASSET:-unknown}"
case_id="${VULPORA_CASE_ID:-unknown}"
baseline="${VULPORA_BASELINE_MODE:-plain-runtime}"
DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/../../.." && pwd)"
[ -d "$fixture_repo" ] || { echo "fixture repo not found: $fixture_repo" >&2; exit 2; }
command -v node >/dev/null 2>&1 || { echo "Node.js is required for offline context validation" >&2; exit 127; }

prompt_block() {
  awk '
    /^prompt:[[:space:]]*\|[[:space:]]*$/ { in_prompt=1; next }
    in_prompt {
      if ($0 ~ /^[^[:space:]#][^:]*:/) exit
      sub(/^  /, "")
      print
    }' "$case_file"
}

artifact_evidence_block() {
  # Keep promotion evidence visible to the evaluated model. Outcome matchers
  # remain evaluator rubric; required_artifacts are an explicit deliverable.
  awk '
    /^expected:[[:space:]]*$/ { in_expected=1; next }
    in_expected && /^  required_artifacts:[[:space:]]*$/ { in_artifacts=1; next }
    in_artifacts && /^    -[[:space:]]*/ {
      value=$0; sub(/^    -[[:space:]]*/, "", value)
      if (value ~ /^".*"$/ || value ~ /^\047.*\047$/) value=substr(value, 2, length(value)-2)
      if (value ~ /^text:/) { sub(/^text:/, "", value); print "- Include this exact evidence label in the final response: " value }
      else if (value ~ /^file:/) { sub(/^file:/, "", value); print "- Create or change this fixture file: " value }
      else if (value ~ /^dir:/) { sub(/^dir:/, "", value); print "- Create or change content under this fixture directory: " value }
      else if (value ~ /^file_existing:/) { sub(/^file_existing:/, "", value); print "- Cite this existing fixture file: " value }
      else if (value ~ /^dir_existing:/) { sub(/^dir_existing:/, "", value); print "- Cite this existing fixture directory: " value }
      next
    }
    in_artifacts && /^  [^[:space:]#]/ { exit }
  ' "$case_file"
}

tmp="$(mktemp -d "${TMPDIR:-/tmp}/vulpora-claude-preview.XXXXXX")"
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
node "$DIR/local-adapter-context.cjs" "$ROOT" "$asset" "$baseline" "$tmp/context.json" "${VULPORA_ASSET_KIND:-}" > "$tmp/context.txt"

{
  echo "You are running inside Vulpora behavioral evaluation."
  echo "Case: $case_id"
  echo "Asset: $asset"
  echo "Baseline mode: $baseline"
  echo ""
  echo "Rules:"
  echo "- Work only inside the fixture repository."
  echo "- Do not commit, push, install dependencies, access the network, or delete files."
  echo "- Prefer reading existing files and reporting grounded findings."
  echo "- Return a concise final response that includes the requested artifacts."
  echo ""
  echo "Task:"
  prompt_block
  echo ""
  echo "Required artifact evidence (promotion contract):"
  artifact_evidence_block
  cat "$tmp/context.txt"
}
