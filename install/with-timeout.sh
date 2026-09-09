#!/usr/bin/env bash
# Bounded command group runner. 124: timeout, 130: cancellation, 125: cleanup unverified.
# Descendants that deliberately leave the owned process group require external isolation.
set -u

[ "$#" -ge 2 ] || { echo "usage: with-timeout.sh SECONDS COMMAND [ARG ...]" >&2; exit 2; }
limit="$1"; shift
case "$limit" in ''|*[!0-9]*) echo "timeout must be a positive integer" >&2; exit 2 ;; esac
[ "$limit" -gt 0 ] || { echo "timeout must be a positive integer" >&2; exit 2; }

state="$(mktemp -d "${TMPDIR:-/tmp}/vulpora-timeout.XXXXXX")" || exit 1
anchor=""; timer=""; cancelled=0; timed_out=0; cleanup_failed=0; command_rc=125
cleanup_state() {
  exec 3>&- 4>&-
  [ -n "$state" ] || return 0
  rm -f "$state/hold" "$state/completion"
  rmdir "$state" 2>/dev/null || true
}
on_signal() { cancelled=1; trap '' HUP INT TERM; }
trap on_signal HUP INT TERM
trap cleanup_state EXIT
mkfifo "$state/hold" "$state/completion" || exit 1
# Open and unlink both channels before launching any command. A worker can
# write to its own temporary files, but cannot publish a completion through a
# shared pathname or an inherited internal descriptor.
exec 3<> "$state/completion" 4<> "$state/hold" || exit 1
rm -f "$state/completion" "$state/hold" || exit 1
rmdir "$state" || exit 1
state=""

job_running() {
  local pid
  for pid in $(jobs -pr); do [ "$pid" != "$1" ] || return 0; done
  return 1
}

# The supervisor keeps its PGID owned even after the actual command exits and
# its descendants are reparented. No signal is sent to a historical PGID.
group_workers() {
  local rows
  job_running "$anchor" || return 1
  rows="$(ps -axo pid=,ppid=,pgid=,stat= 2>/dev/null)" || return 1
  printf '%s\n' "$rows" | awk -v owner="$anchor" -v parent="$$" '
    $3 == owner && $4 !~ /^Z/ {
      if ($1 == owner && $2 == parent) alive=1
      else if ($1 != owner) workers++
    }
    END { if (!alive) exit 1; print workers+0 }'
}
signal_group() {
  group_workers >/dev/null || return 1
  kill "-$1" -- "-$anchor" 2>/dev/null
}
group_empty() {
  local rows
  rows="$(ps -axo pid=,pgid=,stat= 2>/dev/null)" || return 1
  printf '%s\n' "$rows" | awk -v owner="$anchor" '
    $2 == owner && $3 !~ /^Z/ { found=1 }
    END { exit found ? 1 : 0 }'
}
stop_group() {
  local workers ticks=0
  workers="$(group_workers)" || return 1
  if [ "$workers" -gt 0 ]; then
    signal_group TERM || return 1
    while [ "$ticks" -lt 20 ]; do
      workers="$(group_workers)" || return 1
      [ "$workers" -gt 0 ] || break
      sleep 0.1
      ticks=$((ticks + 1))
    done
  fi
  if [ "$workers" -gt 0 ]; then
    signal_group KILL || return 1
  else
    # Only the anchor remains. Reap it without giving up ownership before the
    # command group cleanup is finished.
    job_running "$anchor" || return 1
    kill -KILL "$anchor" 2>/dev/null || return 1
  fi
  wait "$anchor" 2>/dev/null || true
  ticks=0
  while ! group_empty; do
    [ "$ticks" -lt 20 ] || return 1
    sleep 0.1
    ticks=$((ticks + 1))
  done
}

[ "$cancelled" -eq 0 ] || exit 130
# Bash 3.2 job control creates a separate group without a setsid dependency.
# Disable it again inside the supervisor and parent; only this job owns a group.
set -m
(
  set +m
  trap - EXIT
  trap ':' HUP INT TERM
  # A separate command child also keeps exit/exec builtins from replacing the
  # supervisor. Only its actual wait result can publish a completion.
  "$@" 3>&- 4>&- & command_pid=$!
  wait "$command_pid"
  command_rc=$?
  printf '%s\n' "$command_rc" >&3 || exit 125
  exec 3>&-
  # A blocking builtin holds the group without creating more helper processes.
  exec 2>/dev/null
  while :; do read -r hold <&4 || :; done
) </dev/null & anchor=$!
set +m
sleep "$limit" 3>&- 4>&- >/dev/null 2>&1 & timer=$!

while :; do
  [ "$cancelled" -eq 0 ] || break
  if ! job_running "$anchor"; then cleanup_failed=1; break; fi
  if ! job_running "$timer"; then timed_out=1; break; fi
  # Integer read timeouts work in Bash 3.2. The timeout bounds observation of
  # lost ownership as well as an otherwise silent command.
  if IFS= read -r -t 1 -u 3 command_rc; then
    if ! job_running "$timer"; then timed_out=1; fi
    case "$command_rc" in ''|*[!0-9]*) cleanup_failed=1 ;; *) [ "$command_rc" -le 255 ] || cleanup_failed=1 ;; esac
    break
  fi
done

if job_running "$timer"; then kill -TERM "$timer" 2>/dev/null || true; fi
wait "$timer" 2>/dev/null || true
stop_group || cleanup_failed=1
if [ "$cleanup_failed" -ne 0 ]; then
  # Losing the anchor forbids further group signals. Stop only a still-owned
  # supervisor job; a nonzero outcome preserves the unresolved cleanup state.
  if job_running "$anchor"; then kill -KILL "$anchor" 2>/dev/null || true; fi
  wait "$anchor" 2>/dev/null || true
  echo 'timeout_result={"outcome":"cleanup_unverified"}' >&2
  exit 125
fi
[ "$cancelled" -eq 0 ] || exit 130
if [ "$timed_out" -eq 1 ]; then
  echo "timeout_result={\"outcome\":\"timeout\",\"timeout_seconds\":$limit}" >&2
  exit 124
fi
exit "$command_rc"
