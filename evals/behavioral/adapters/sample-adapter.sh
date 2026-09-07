#!/usr/bin/env bash
# Sample behavioral adapter. It does not call an LLM; it only proves the runner/metrics contract.

set -u

case_file="${VULPORA_PROMPT_FILE:?VULPORA_PROMPT_FILE}"
fixture_repo="${VULPORA_FIXTURE_REPO:?VULPORA_FIXTURE_REPO}"
metrics_file="${VULPORA_METRICS_FILE:-}"
asset="${VULPORA_ASSET:-unknown}"
case_id="${VULPORA_CASE_ID:-unknown}"

ylist() {
  awk -v k="$1" '
    $0 ~ "^[[:space:]]*"k":[[:space:]]*$" { depth=match($0,/[^ ]/); inlist=1; next }
    inlist {
      if ($0 ~ /^[[:space:]]*-[[:space:]]/) { sub(/^[[:space:]]*-[[:space:]]*/,""); print; next }
      if ($0 ~ /^[[:space:]]*[^[:space:]#]/ && match($0,/[^ ]/) <= depth) inlist=0
    }
  ' "$2"
}

safe_relative_path() {
  [[ "$1" =~ ^[A-Za-z0-9][A-Za-z0-9._/-]*$ ]] && [[ "$1" != /* ]] && [[ "$1" != *..* ]]
}

unquote_scalar() {
  local value="$1"
  value="$(printf '%s' "$value" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
  if [[ "$value" =~ ^\'.*\'$ ]] || [[ "$value" =~ ^\".*\"$ ]]; then
    value="${value:1:${#value}-2}"
  fi
  printf '%s' "$value"
}

echo "sample adapter output for $asset / $case_id"
echo "review report"
generated_entries=0
while IFS= read -r term; do
  [ -n "$term" ] || continue
  echo "$term"
done < <(ylist must_find "$case_file")
while IFS= read -r artifact; do
  artifact="$(unquote_scalar "$artifact")"
  [ -n "$artifact" ] || continue
  case "$artifact" in
    file:*)
      artifact_path="${artifact#file:}"
      # The runner validates the case first; retain a narrow adapter boundary
      # so this offline fixture helper never writes an unsafe path itself.
      if safe_relative_path "$artifact_path"; then
        artifact_parent="$(dirname "$artifact_path")"
        while [ "$artifact_parent" != . ]; do
          [ -d "$fixture_repo/$artifact_parent" ] || generated_entries=$((generated_entries + 1))
          artifact_parent="$(dirname "$artifact_parent")"
        done
        mkdir -p "$fixture_repo/$(dirname "$artifact_path")"
        printf 'sample artifact for %s\n' "$case_id" > "$fixture_repo/$artifact_path"
        # Snapshot accounting includes newly created parent directories and
        # the file itself, even when the file existed before this write.
        generated_entries=$((generated_entries + 1))
      fi
      ;;
  esac
  echo "$artifact"
done < <(ylist required_artifacts "$case_file")

if [ -n "$metrics_file" ]; then
  {
    echo "elapsed_seconds: 1"
    echo "tool_calls: 2"
    echo "files_read: 1"
    echo "files_written: $generated_entries"
    echo "command_count: 0"
    echo "estimated_tokens: 256"
    echo "forbidden_action_hits: 0"
    echo "guardrail_trips: 0"
  } > "$metrics_file"
fi
