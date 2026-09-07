#!/usr/bin/env bash
# Portable bounded command runner. Exit 124 means timeout; signals are forwarded and owned descendants are reaped.
set -u

[ "$#" -ge 2 ] || { echo "usage: with-timeout.sh SECONDS COMMAND [ARG ...]" >&2; exit 2; }
limit="$1"; shift
case "$limit" in ''|*[!0-9]*) echo "timeout must be a positive integer" >&2; exit 2 ;; esac
[ "$limit" -gt 0 ] || { echo "timeout must be a positive integer" >&2; exit 2; }

child=""; watcher=""; timed_out_file="$(mktemp "${TMPDIR:-/tmp}/vulpora-timeout.XXXXXX")" || exit 1
rm -f "$timed_out_file"

descendants() {
  local parent="$1" kid
  for kid in $(pgrep -P "$parent" 2>/dev/null || true); do descendants "$kid"; printf '%s\n' "$kid"; done
}
stop_owned() {
  [ -n "$child" ] || return 0
  local pids
  pids="$(descendants "$child")"
  [ -z "$pids" ] || kill -TERM $pids 2>/dev/null || true
  kill -TERM "$child" 2>/dev/null || true
  local i=0
  while kill -0 "$child" 2>/dev/null && [ "$i" -lt 20 ]; do sleep 0.1; i=$((i + 1)); done
  pids="$(descendants "$child")"
  [ -z "$pids" ] || kill -KILL $pids 2>/dev/null || true
  kill -KILL "$child" 2>/dev/null || true
}
on_signal() { stop_owned; [ -n "$watcher" ] && kill "$watcher" 2>/dev/null || true; rm -f "$timed_out_file"; exit 130; }
trap on_signal HUP INT TERM
trap 'rm -f "$timed_out_file"' EXIT

"$@" & child=$!
(
  sleep "$limit"
  if kill -0 "$child" 2>/dev/null; then
    : > "$timed_out_file"
    kill -TERM "$child" 2>/dev/null || true
  fi
) & watcher=$!

wait "$child"; rc=$?
kill "$watcher" 2>/dev/null || true
wait "$watcher" 2>/dev/null || true
if [ -e "$timed_out_file" ]; then
  stop_owned
  echo "timeout_result={\"outcome\":\"timeout\",\"timeout_seconds\":$limit}" >&2
  exit 124
fi
exit "$rc"
