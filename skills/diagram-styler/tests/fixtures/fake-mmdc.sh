#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == '--version' ]]; then
  printf '%s\n' 'test-mmdc 1.0.0'
  exit 0
fi

output=''
while (($#)); do
  case "$1" in
    --output)
      output="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

[[ -n "$output" ]]
printf '%s\n' '<svg viewBox="0 0 640 320"><g id="diagram"><text x="20" y="30">Rendered</text></g></svg>' > "$output"
