#!/usr/bin/env bash
# Installed as "awk" in a private PATH by test-portability.sh. Capture stderr
# even when the calling negative test redirects or suppresses its own output.
set -u
stderr_file="$(mktemp "$VULPORA_AWK_AUDIT_DIR/stderr.XXXXXX")" || exit 2
"$VULPORA_AWK_BINARY" "$@" 2> "$stderr_file"
code=$?
if [ -s "$stderr_file" ]; then
  cat "$stderr_file" >&2
fi
exit "$code"
