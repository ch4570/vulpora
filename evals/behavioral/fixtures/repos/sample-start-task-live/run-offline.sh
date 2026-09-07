#!/usr/bin/env bash
set -u
[ "$#" -gt 0 ] || { echo "usage: run-offline.sh COMMAND [ARG ...]" >&2; exit 2; }
# Native E2E parents set this only when their runtime sandbox independently enforces network denial.
# This avoids unsupported nested sandbox-exec calls while preserving the same no-network boundary.
if [ "${VULPORA_PARENT_NETWORK_DENIED:-0}" = 1 ]; then
  exec "$@"
fi
if command -v sandbox-exec >/dev/null 2>&1; then
  exec sandbox-exec -p '(version 1) (allow default) (deny network*)' "$@"
fi
if command -v unshare >/dev/null 2>&1 && unshare -n true >/dev/null 2>&1; then
  exec unshare -n "$@"
fi
echo "environment_unavailable: no enforced network namespace" >&2
exit 78
