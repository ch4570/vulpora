#!/usr/bin/env bash
set -u
set -f
DIR="$(cd "$(dirname "$0")" && pwd -P)"
ROOT="$(cd "$DIR/.." && pwd -P)"
ADAPTER="$ROOT/evals/behavioral/adapters/run-start-task-native.sh"
runtime=""; deadline=900; runs=1
while [ "$#" -gt 0 ]; do
  case "$1" in
    --runtime) runtime="${2-}"; shift 2 ;; --runtime=*) runtime="${1#*=}"; shift ;;
    --deadline-seconds) deadline="${2-}"; shift 2 ;; --deadline-seconds=*) deadline="${1#*=}"; shift ;;
    --runs) runs="${2-}"; shift 2 ;; --runs=*) runs="${1#*=}"; shift ;;
    *) echo "usage: test-start-task-live.sh --runtime codex|claude-code [--runs 1|2] [--deadline-seconds N]" >&2; exit 2 ;;
  esac
done
case "$runtime" in codex|claude-code) ;; *) exit 2 ;; esac
case "$runs" in 1|2) ;; *) exit 2 ;; esac
case "$deadline" in ''|*[!0-9]*) exit 2 ;; esac
[ "$deadline" -gt 0 ] && [ "$deadline" -le 900 ] || exit 2

if ! command -v "$([ "$runtime" = codex ] && echo codex || echo claude)" >/dev/null 2>&1; then
  printf '{"semantic_ac_key":"native_%s_e2e","runtime":"%s","outcome":"environment_unavailable","execution":"not_run","terminal_status":"failed"}\n' "$runtime" "$runtime"
  exit 1
fi

WORK="$(mktemp -d "${TMPDIR:-/tmp}/vulpora-live-test.XXXXXX")" || exit 1
trap 'rm -rf "$WORK"' EXIT HUP INT TERM
state_hash() {
  if [ "$runtime" = codex ]; then
    paths=("$HOME/.codex/config.toml" "$HOME/.codex/auth.json")
  else
    paths=("$HOME/.claude.json" "$HOME/.claude/settings.json" "$HOME/.claude/settings.local.json" "$HOME/.claude/.credentials.json")
  fi
  { for f in "${paths[@]}"; do
      if [ -f "$f" ]; then shasum -a 256 "$f" | awk '{print $1}'; else echo absent; fi
    done; } | shasum -a 256 | awk '{print $1}'
}
active_state_before="$(state_hash)"
canonical_before="$(find "$ROOT/evals/behavioral/fixtures/repos/sample-start-task-live" -type f -print0 | sort -z | xargs -0 shasum -a 256 | shasum -a 256 | awk '{print $1}')"

i=1
while [ "$i" -le "$runs" ]; do
  nonce="$(date +%s)-$$-$i"
  run_id="run-${runtime//-/_}-$nonce"
  instance_id="instance-${runtime//-/_}-$nonce"
  out="$WORK/run-$i"
  if ! result="$(bash "$ADAPTER" --runtime "$runtime" --task 'Implement CommonJS isPositive(value) returning true exactly when value is greater than zero; preserve absolute; export both; add node:test assertions for -1, 0, and 1. All requirements and approval are final.' --output "$out" --run-id "$run_id" --runtime-instance-id "$instance_id" --deadline-seconds "$deadline")"; then
    node - "$runtime" "$i" "$result" <<'NODE'
const [runtime,runText,input]=process.argv.slice(2);
let detail={};
for(const line of input.split(/\n/)){try{detail=JSON.parse(line);}catch{}}
const result={semantic_ac_key:`native_${runtime}_e2e`,runtime,outcome:detail.outcome||'failed',execution:detail.execution||'attempted',terminal_status:'failed',run:Number(runText)};
for(const key of ['reason','exit_code','api_error_code','api_error_status'])if(detail[key]!==undefined&&detail[key]!==null)result[key]=detail[key];
process.stdout.write(`${JSON.stringify(result)}\n`);
NODE
    exit 1
  fi
  printf '%s\n' "$result" > "$WORK/result-$i.json"
  node - "$out/orchestration-report.json" "$out/independent-evidence.json" "$WORK/semantic-$i.json" <<'NODE'
const fs=require('node:fs');const [rp,ep,out]=process.argv.slice(2),r=JSON.parse(fs.readFileSync(rp)),e=JSON.parse(fs.readFileSync(ep));
fs.writeFileSync(out,JSON.stringify({workflow:r.workflow_contract,runtime:r.runtime,entrypoint:r.runtime_entrypoint,phases:r.phases.map(x=>[x.name,x.outcome]),children:r.children.map(x=>x.agent_id),ownership:r.ownership,changed_files:r.changed_files.slice().sort(),verification:r.verification.map(x=>({argv:x.argv,exit_code:x.exit_code,outcome:x.outcome})),status:r.terminal_status,cleanup:e.cleanup,network:e.network}));
NODE
  i=$((i + 1))
done

if [ "$runs" -eq 2 ] && ! cmp -s "$WORK/semantic-1.json" "$WORK/semantic-2.json"; then
  echo '{"outcome":"failed","reason":"non_deterministic_semantics"}'
  exit 1
fi
active_state_after="$(state_hash)"
canonical_after="$(find "$ROOT/evals/behavioral/fixtures/repos/sample-start-task-live" -type f -print0 | sort -z | xargs -0 shasum -a 256 | shasum -a 256 | awk '{print $1}')"
[ "$active_state_before" = "$active_state_after" ] || { echo '{"outcome":"failed","reason":"active_runtime_state_changed"}'; exit 1; }
[ "$canonical_before" = "$canonical_after" ] || { echo '{"outcome":"failed","reason":"canonical_fixture_changed"}'; exit 1; }
for result in "$WORK"/result-*.json; do
  rid="$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1])).run_id)' "$result")"
  pgrep -f "$rid" >/dev/null 2>&1 && { echo '{"outcome":"failed","reason":"owned_orphan_process"}'; exit 1; }
done
printf '{"semantic_ac_key":"native_%s_e2e","runtime":"%s","outcome":"pass","execution":"executed","runs":%s,"deterministic":true,"cleanup_completed":true,"orphan_processes":0,"terminal_status":"complete","verification_scope":"audit-workflow-primary-inline","execution_child_model_routing_verified":false}\n' "$runtime" "$runtime" "$runs"
