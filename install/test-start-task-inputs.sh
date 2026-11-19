#!/usr/bin/env bash
set -eu
DIR="$(cd "$(dirname "$0")" && pwd -P)"; ROOT="$(cd "$DIR/.." && pwd -P)"
ADAPTER="$ROOT/evals/behavioral/adapters/run-start-task-native.sh"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/vulpora-input-test.XXXXXX")"
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

# No runtime or authentication helper is available to the argument parser tests.
# Their environment is constructed from scratch, including isolated auth paths.
mkdir "$WORK/no-runtime-bin"
for helper in dirname grep wc tr; do ln -s "$(command -v "$helper")" "$WORK/no-runtime-bin/$helper"; done
node - "$ADAPTER" "$WORK" <<'NODE'
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const [adapter,work]=process.argv.slice(2),failures=[];
const env={PATH:path.join(work,'no-runtime-bin'),HOME:path.join(work,'argument-home'),
  CODEX_HOME:path.join(work,'argument-codex-home'),VULPORA_STATE_HOME:path.join(work,'argument-state'),
  VULPORA_TEST_FAULTS:'1',LC_ALL:'C'};
const flags=['--runtime','--task','--output','--run-id','--runtime-instance-id',
  '--deadline-seconds','--resume-run-id','--test-interrupt-at','--test-force-failure-at','--test-config-drift-at'];
function check(name,args,reason,taskBytes=1) {
  try {
    const result=spawnSync('/bin/bash',[adapter,...args],{cwd:work,env,encoding:'utf8',timeout:2000,killSignal:'SIGKILL',maxBuffer:65536});
    if(result.error)throw new Error(`parser did not finish: ${result.error.code}`);
    assert.equal(result.signal,null);
    assert.equal(result.status,reason?2:0);
    const output=JSON.parse(result.stdout);
    assert.equal(output.outcome,reason?'failed':'pass');
    if(reason)assert.equal(output.reason,reason);
    else { assert.equal(output.phase,'preflight');assert.equal(output.task_bytes,taskBytes); }
    assert.equal(output.child_dispatch_count,0);
    assert.equal(output.mutation_count,0);
    assert.equal(output.cleanup_completed,true);
  } catch(error) { failures.push(`${name}: ${error.message}`); }
}
for(const runtime of ['codex','claude-code']) {
  const base=['--runtime',runtime,'--task','x','--output',path.join(work,'argument-output'),
    '--run-id','run-arguments-12345678','--runtime-instance-id','instance-arguments-12345678'];
  check(`${runtime} baseline`,[...base,'--preflight-only']);
  for(const flag of flags) {
    check(`${runtime} ${flag} missing`,[...base,'--preflight-only',flag],'missing_option_value');
    for(const next of ['--preflight-only','--help','-h','--unrecognized']) {
      check(`${runtime} ${flag} before ${next}`,[...base,flag,next],'missing_option_value');
    }
  }
  for(const task of ['--literal','--preflight-only','-h','a task with spaces','--eval=process.stdout.write("synthetic-marker")']) {
    check(`${runtime} literal task ${task}`,[...base,`--task=${task}`,'--preflight-only'],undefined,Buffer.byteLength(task));
  }
  check(`${runtime} literal output`,[...base,'--output=--literal','--preflight-only']);
  check(`${runtime} literal IDs`,[...base,'--run-id=--literal-run','--runtime-instance-id=--literal-instance','--preflight-only']);
  check(`${runtime} single-dash task`,[...base,'--task','-literal','--preflight-only'],undefined,8);
  for(const value of ['','   ']) {
    check(`${runtime} empty task space form`,[...base,'--task',value,'--preflight-only'],'empty_task');
    check(`${runtime} empty task equals form`,[...base,`--task=${value}`,'--preflight-only'],'empty_task');
  }
  check(`${runtime} empty runtime`,[...base,'--runtime','','--preflight-only'],'unsupported_runtime_selector');
  check(`${runtime} empty deadline`,[...base,'--deadline-seconds','','--preflight-only'],'invalid_deadline');
  check(`${runtime} empty run ID`,[...base,'--run-id','','--preflight-only'],'invalid_run_id');
  check(`${runtime} empty instance ID`,[...base,'--runtime-instance-id','','--preflight-only'],'invalid_runtime_instance_id');
  check(`${runtime} empty preflight output`,[...base,'--output','','--preflight-only']);
  check(`${runtime} empty preflight output equals form`,[...base,'--output=','--preflight-only']);
  check(`${runtime} empty optional values`,[...base,'--resume-run-id','','--test-interrupt-at=',
    '--test-force-failure-at','','--test-config-drift-at=','--preflight-only']);
}
// Run the two exact source expressions without entering authentication, install,
// or runtime execution. The Node function fixes only the executable path; shell
// argument handling remains the adapter's, and tasks enter solely through $1.
const source=fs.readFileSync(adapter,'utf8');
for(const variable of ['task_literal','task_sha256']) {
  const line=source.split('\n').find(line=>line.startsWith(`${variable}="$(node -e `));
  const match=line?.match(/^[a-z_0-9]+="\$\((node -e .+)\)" \|\| reject [a-z_]+$/);
  assert.ok(match,`source expression missing: ${variable}`);
  for(const task of ['plain task','--literal','-literal','--eval=process.stdout.write("synthetic-marker")']) {
    try {
      const result=spawnSync('/bin/bash',['-c','node() { "$NODE_EXECUTABLE" "$@"; }\ntask="$1"\n'+match[1],
        'task-expression',task],{cwd:work,env:{...env,NODE_EXECUTABLE:process.execPath},encoding:'utf8',timeout:2000,killSignal:'SIGKILL',maxBuffer:65536});
      if(result.error)throw new Error(`expression did not finish: ${result.error.code}`);
      assert.equal(result.signal,null);
      assert.equal(result.status,0);
      assert.equal(result.stdout,variable==='task_literal'?JSON.stringify(task):crypto.createHash('sha256').update(task).digest('hex'));
    } catch(error) { failures.push(`${variable} ${task}: ${error.message}`); }
  }
}
assert.equal(fs.existsSync(path.join(work,'argument-output')),false);
assert.equal(fs.existsSync(path.join(work,'argument-state')),false);
if(failures.length)throw new Error(`${failures.length} argument checks failed:\n${failures.join('\n')}`);
NODE

expect_reject() {
  name="$1"; shift
  out="$WORK/$name.out"
  if bash "$ADAPTER" "$@" >"$out" 2>&1; then echo "unexpected pass: $name" >&2; exit 1; fi
  grep -Fq '"child_dispatch_count":0' "$out" || { echo "dispatch on rejection: $name" >&2; exit 1; }
  grep -Fq '"mutation_count":0' "$out" || { echo "mutation on rejection: $name" >&2; exit 1; }
  grep -Fq '"cleanup_completed":true' "$out" || { echo "cleanup missing: $name" >&2; exit 1; }
}

base='--output ignored --run-id run-12345678 --runtime-instance-id instance-12345678'
# shellcheck disable=SC2086
expect_reject empty --runtime codex --task '' $base
expect_reject whitespace --runtime codex --task '   ' $base
oversized="$(awk 'BEGIN{for(i=0;i<4097;i++)printf "x"}')"
expect_reject oversized --runtime codex --task "$oversized" $base
expect_reject unsupported --runtime opencode --task x $base
expect_reject bad_deadline --runtime codex --task x $base --deadline-seconds wrong
expect_reject bad_run --runtime codex --task x --output ignored --run-id bad --runtime-instance-id instance-12345678
expect_reject resume --runtime codex --task x $base --resume-run-id run-interrupted

for drift_runtime in codex claude-code; do
  for drift_phase in before_discovery after_discovery; do
    drift_output="$WORK/config-drift-$drift_runtime-$drift_phase"; drift_out="$drift_output.out"
    if PATH="$WORK/deny-bin:$PATH" VULPORA_TEST_FAULTS=1 VULPORA_DEBUG_PRESERVE_FAILED_OUTPUT=0 \
      bash "$ADAPTER" --runtime "$drift_runtime" --task x --output "$drift_output" \
      --run-id run-drift-12345678 --runtime-instance-id instance-drift-12345678 --test-config-drift-at "$drift_phase" >"$drift_out" 2>&1; then
      echo 'configuration drift unexpectedly passed' >&2; exit 1
    fi
    grep -Fq '"reason":"runtime_configuration_changed"' "$drift_out"
    grep -Fq '"validity":"invalidated"' "$drift_out"
    grep -Fq '"child_dispatch_count":0' "$drift_out"
    grep -Fq '"mutation_count":0' "$drift_out"
    grep -Fq '"cleanup_completed":true' "$drift_out"
    grep -Fq '"execution":"not_run"' "$drift_out"
    grep -Fq '"synthetic_fault":true' "$drift_out"
    [ ! -e "$drift_output" ]
  done
done
[ ! -e "$VULPORA_TEST_RUNTIME_INVOCATIONS" ] || { echo 'offline drift reached runtime or personal config' >&2; exit 1; }

# Mutate only a disposable adapter copy so the selected checkpoint does nothing.
# Its final guard must still refuse to cross into runtime invocation.
node - "$ADAPTER" "$WORK/guard-adapter.sh" <<'NODE'
const fs=require('node:fs'),[source,target]=process.argv.slice(2),text=fs.readFileSync(source,'utf8');
const marker='if [ "$config_drift_at" = before_discovery ]; then printf';
if(!text.includes(marker))throw new Error('fault checkpoint mutation target missing');
const mutated=text.replace(/^DIR=.*$/m,'DIR="${VULPORA_TEST_ADAPTER_DIR:?}"').replace(marker,'if false; then printf');
fs.writeFileSync(target,mutated,{mode:0o700});
NODE
if PATH="$WORK/deny-bin:$PATH" VULPORA_TEST_FAULTS=1 VULPORA_DEBUG_PRESERVE_FAILED_OUTPUT=0 \
  VULPORA_TEST_ADAPTER_DIR="$(dirname "$ADAPTER")" bash "$WORK/guard-adapter.sh" --runtime codex \
  --task x --output "$WORK/guard-output" --run-id run-guard-12345678 --runtime-instance-id instance-guard-12345678 \
  --test-config-drift-at before_discovery >"$WORK/guard.out" 2>&1; then
  echo 'disabled fault checkpoint reached runtime execution' >&2; exit 1
fi
grep -Fq '"reason":"offline_fault_reached_runtime_boundary"' "$WORK/guard.out"
grep -Fq '"execution":"not_run"' "$WORK/guard.out"
grep -Fq '"synthetic_fault":true' "$WORK/guard.out"
[ ! -e "$WORK/guard-output" ]
[ ! -e "$VULPORA_TEST_RUNTIME_INVOCATIONS" ]

# No runtime binary is present in this minimal PATH. Real/live-only selectors
# must still stop at discovery, before any user authentication/config is read.
for live_runtime in codex claude-code; do
  for live_mode in env_only post_runtime; do
    live_out="$WORK/live-$live_runtime-$live_mode.out"
    set --
    [ "$live_mode" != post_runtime ] || set -- --test-config-drift-at post_runtime
    if PATH="$WORK/no-runtime-bin" VULPORA_TEST_FAULTS=1 /bin/bash "$ADAPTER" \
      --runtime "$live_runtime" --task x --output "$WORK/live-output" --run-id run-live-12345678 \
      --runtime-instance-id instance-live-12345678 "$@" >"$live_out" 2>&1; then
      echo 'live authentication guard was bypassed' >&2; exit 1
    fi
    expected_cli=codex; [ "$live_runtime" = codex ] || expected_cli=claude
    grep -Fq "\"reason\":\"${expected_cli}_not_found\"" "$live_out"
    [ ! -e "$WORK/live-output" ]
    ! grep -Fq '"synthetic_fault":true' "$live_out"
  done
done
# shellcheck disable=SC2086
VULPORA_TEST_FAULTS=0 expect_reject disabled_fault --runtime codex --task x $base --test-interrupt-at reporting
grep -Fq '"reason":"test_faults_disabled"' "$WORK/disabled_fault.out"
# shellcheck disable=SC2086
VULPORA_TEST_FAULTS=1 expect_reject invalid_fault --runtime codex --task x $base --test-interrupt-at unknown
grep -Fq '"reason":"invalid_interrupt_phase"' "$WORK/invalid_fault.out"
# shellcheck disable=SC2086
VULPORA_TEST_FAULTS=1 expect_reject conflicting_faults --runtime codex --task x $base --test-interrupt-at reporting --test-config-drift-at post_runtime
grep -Fq '"reason":"conflicting_test_faults"' "$WORK/conflicting_faults.out"
# shellcheck disable=SC2086
VULPORA_TEST_FAULTS=1 expect_reject preflight_fault --runtime codex --task x $base --test-interrupt-at reporting --preflight-only
grep -Fq '"reason":"fault_preflight_conflict"' "$WORK/preflight_fault.out"

boundary="$(awk 'BEGIN{for(i=0;i<4096;i++)printf "x"}')"
# shellcheck disable=SC2086
bash "$ADAPTER" --runtime codex --task "$boundary" $base --preflight-only >"$WORK/boundary.out"
grep -Fq '"task_bytes":4096' "$WORK/boundary.out"
grep -Fq '"child_dispatch_count":0' "$WORK/boundary.out"
[ ! -e "$ROOT/ignored" ]
bash "$DIR/test-start-task-claude-auth.sh" >/dev/null
printf '{"semantic_ac_key":"input_and_report_rejection","outcome":"pass","empty":true,"whitespace_only":true,"oversized":true,"boundary_4096":true,"unsupported_runtime":true,"missing_option_values_rejected":true,"option_tokens_not_consumed":true,"literal_dash_values_preserved":true,"task_node_option_injection_rejected":true,"wrong_types":true,"malformed_reports":true,"configuration_drift_invalidated":true,"offline_fault_boundary_rejected":true,"live_runtime_invocations":0,"personal_config_read_sentinel_hits":0,"child_dispatch_count":0,"mutation_count":0,"cleanup_completed":true}\n'
