#!/usr/bin/env bash
# One-time mechanical migration for legacy regex-like behavioral assertions.
# It only edits expected.must_find/must_not_claim list scalars.  Run with --write
# after reviewing --check output.  New cases should be authored explicitly.

set -eu
DIR="$(cd "$(dirname "$0")/.." && pwd)"
MODE="--check"
CASES="$DIR/cases"
case "${1:-}" in
  --check|--write) MODE="$1"; shift ;;
  "") ;;
esac
if [ "${1:-}" != "" ]; then CASES="$1"; shift; fi
[ "$#" -eq 0 ] || { echo "usage: $0 [--check|--write] [cases-dir]" >&2; exit 2; }
[ -d "$CASES" ] || { echo "cases directory not found: $CASES" >&2; exit 2; }

changed=0
for file in $(find "$CASES" -name '*.yaml' -type f | LC_ALL=C sort); do
  tmp="$(mktemp "${TMPDIR:-/tmp}/vulpora-matcher.XXXXXX")"
  awk '
    /^[[:space:]]*(must_find|must_not_claim):[[:space:]]*$/ { section=1; print; next }
    section && /^[[:space:]]*-[[:space:]]/ {
      line=$0; value=line; sub(/^[[:space:]]*-[[:space:]]*/, "", value)
      quote=substr(value,1,1); inner=value
      if ((quote == "\047" || quote == "\"") && substr(value,length(value),1) == quote) inner=substr(value,2,length(value)-2)
      if (inner !~ /^(literal|any_of|regex):/) {
        prefix=""
        if (inner ~ /\.\*|\[[^]]*\]|\([^)]*\)|\\|\$|\^|\+/) prefix="regex:"
        else if (inner ~ /\|/) prefix="any_of:"
        if (prefix != "") {
          match(line, /^[[:space:]]*-[[:space:]]*/); leader=substr(line,1,RLENGTH)
          if ((quote == "\047" || quote == "\"") && substr(value,length(value),1) == quote)
            line=leader quote prefix inner quote
          else line=leader prefix inner
        }
      }
      print line; next
    }
    section && /^[^[:space:]#]/ { section=0 }
    { print }
  ' "$file" > "$tmp"
  if ! cmp -s "$file" "$tmp"; then
    changed=$((changed + 1))
    if [ "$MODE" = --write ]; then mv "$tmp" "$file"; else printf '%s\n' "$file"; rm -f "$tmp"; fi
  else rm -f "$tmp"; fi
done
printf 'matcher migration candidates: %s\n' "$changed"
