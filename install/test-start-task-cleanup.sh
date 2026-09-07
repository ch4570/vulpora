#!/usr/bin/env bash
set -u
DIR="$(cd "$(dirname "$0")" && pwd -P)"; ROOT="$(cd "$DIR/.." && pwd -P)"
ADAPTER="$ROOT/evals/behavioral/adapters/run-start-task-native.sh"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/vulpora-cleanup-test.XXXXXX")" || exit 1
trap 'rm -rf "$WORK"' EXIT HUP INT TERM
export VULPORA_STATE_HOME="$WORK/state"
export VULPORA_TEST_RUNTIME_INVOCATIONS="$WORK/runtime-invocations"
export VULPORA_TEST_REAL_NODE="$(command -v node)"
node - "$WORK/deny-bin" <<'NODE'
const fs=require('node:fs'),path=require('node:path'),dir=process.argv[2];fs.mkdirSync(dir);
const deny='#!/bin/sh\nprintf "denied-runtime-invocation\\n" >> "$VULPORA_TEST_RUNTIME_INVOCATIONS"\nexit 99\n';
for(const name of ['codex','claude','security'])fs.writeFileSync(path.join(dir,name),deny,{mode:0o755});
fs.writeFileSync(path.join(dir,'node'),'#!/bin/sh\nfor argument do\n case "$argument" in\n "${HOME-}/.codex"|"${HOME-}/.codex/"*|"${HOME-}/.claude"|"${HOME-}/.claude/"*|"${HOME-}/.claude.json")\n printf "denied-personal-config-read\\n" >> "$VULPORA_TEST_RUNTIME_INVOCATIONS"; exit 99;;\n esac\ndone\nexec "$VULPORA_TEST_REAL_NODE" "$@"\n',{mode:0o755});
NODE
fixture="$ROOT/evals/behavioral/fixtures/repos/sample-start-task-live"
canonical_before="$(find "$fixture" -type f -print0 | sort -z | xargs -0 shasum -a 256 | shasum -a 256 | awk '{print $1}')"

run_fault() {
  kind="$1"; phase="$2"; fault_runtime="$3"
  out="$WORK/$fault_runtime-$kind-$phase"; log="$out.log"
  fault_run_id="run-$fault_runtime-$kind-$phase-$(basename "$WORK")"
  set +e
  PATH="$WORK/deny-bin:$PATH" VULPORA_TEST_FAULTS=1 VULPORA_DEBUG_PRESERVE_FAILED_OUTPUT=0 \
    bash "$ADAPTER" --runtime "$fault_runtime" --task x --output "$out" \
    --run-id "$fault_run_id" --runtime-instance-id "instance-$fault_run_id" "--test-$kind-at" "$phase" >"$log" 2>&1
  rc=$?
  set -e
  [ "$rc" -ne 0 ] || { echo "$kind unexpectedly passed at $phase" >&2; return 1; }
  grep -Eq '"outcome":"(cancelled|failed)"' "$log" || return 1
  grep -Fq '"cleanup_completed":true' "$log" || return 1
  grep -Fq '"execution":"not_run"' "$log" || return 1
  grep -Fq '"synthetic_fault":true' "$log" || return 1
  [ ! -e "$VULPORA_TEST_RUNTIME_INVOCATIONS" ] || { echo 'offline fault reached runtime or personal config' >&2; return 1; }
  [ ! -e "$out" ] || { echo "owned output survived $kind at $phase" >&2; return 1; }
  ! pgrep -f "$fault_run_id" >/dev/null 2>&1
}
for fault_runtime in codex claude-code; do
  for phase in clarification child_execution fixture_mutation test reporting; do
    run_fault interrupt "$phase" "$fault_runtime" || exit 1
    run_fault force-failure "$phase" "$fault_runtime" || exit 1
  done
done

resume_out="$WORK/resume.out"
if bash "$ADAPTER" --runtime codex --task x --output "$WORK/must-not-exist" --run-id interrupted-run-123 --runtime-instance-id interrupted-instance-123 --resume-run-id interrupted-run-123 >"$resume_out" 2>&1; then
  echo "interrupted run resume unexpectedly succeeded" >&2; exit 1
fi
grep -Fq 'interrupted_runs_are_non_resumable' "$resume_out" || exit 1
[ ! -e "$WORK/must-not-exist" ] || exit 1
canonical_after="$(find "$fixture" -type f -print0 | sort -z | xargs -0 shasum -a 256 | shasum -a 256 | awk '{print $1}')"
[ "$canonical_before" = "$canonical_after" ] || exit 1
printf '{"semantic_ac_key":"cleanup_interruption_resume","outcome":"pass","interruption_injections":10,"forced_failure_injections":10,"cleanup_idempotent":true,"owned_outputs_removed":true,"orphan_processes":0,"resume_rejected_before_dispatch":true,"fresh_restart_required":true,"canonical_fixture_unchanged":true,"live_runtime_invocations":0,"personal_config_read_sentinel_hits":0,"synthetic_fault_execution":"not_run"}\n'
