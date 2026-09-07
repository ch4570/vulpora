#!/usr/bin/env bash
set -eu
set -f

DIR="$(cd "$(dirname "$0")" && pwd -P)"
ROOT="$(cd "$DIR/.." && pwd -P)"
INITIALIZER="$ROOT/skills/start-task/scripts/initialize-run.js"
APPEND="$ROOT/skills/start-task/scripts/append-execution-ledger.js"
RECORD_COMMAND="$ROOT/skills/start-task/scripts/record-execution-command.js"
VALIDATOR="$ROOT/skills/start-task/scripts/validate-execution-ledger.js"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/vulpora-run-initializer.XXXXXX")" || exit 1
trap 'rm -rf "$WORK"' EXIT HUP INT TERM
REPO="$WORK/repo"; RUN_ID='run-initializer-1234'; RUN_DIR="$REPO/.vulpora/tasks/$RUN_ID"
mkdir -p "$RUN_DIR"
(cd "$REPO" && node "$INITIALIZER" \
  ".vulpora/tasks/$RUN_ID/execution-ledger.jsonl" "$RUN_ID" instance-initializer-1234 \
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa) >"$WORK/result.json"
(cd "$REPO" && node "$VALIDATOR" ".vulpora/tasks/$RUN_ID/execution-ledger.jsonl" "$RUN_ID") >"$WORK/validation.json"
node - "$WORK/result.json" "$WORK/validation.json" <<'NODE'
const fs=require('node:fs'),[resultPath,validationPath]=process.argv.slice(2);
const result=JSON.parse(fs.readFileSync(resultPath)),validation=JSON.parse(fs.readFileSync(validationPath));
if(result.outcome!=='pass'||result.record_count!==2||result.progress_lines.length!==2
  ||validation.record_count!==2||validation.head_sha256!==result.head_sha256)process.exit(1);
NODE
before="$(shasum -a 256 "$RUN_DIR/execution-ledger.jsonl")"
if (cd "$REPO" && node "$INITIALIZER" \
  ".vulpora/tasks/$RUN_ID/execution-ledger.jsonl" "$RUN_ID" instance-initializer-1234 \
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa) >/dev/null 2>&1; then
  echo 'duplicate initialization accepted' >&2; exit 1
fi
[ "$before" = "$(shasum -a 256 "$RUN_DIR/execution-ledger.jsonl")" ]
if (cd "$REPO" && printf '%s' '{"run_id":"run-initializer-1234","phase":"approve","event_type":"spec_committed","status":"reported","source_type":"user_decision","source_ref":"task-input-sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","message":"Out-of-order approval."}' \
  | node "$APPEND" ".vulpora/tasks/$RUN_ID/execution-ledger.jsonl") >/dev/null 2>&1; then
  echo 'approve event appended before clarify finished' >&2; exit 1
fi
[ "$before" = "$(shasum -a 256 "$RUN_DIR/execution-ledger.jsonl")" ]
if (cd "$REPO" && node "$RECORD_COMMAND" ".vulpora/tasks/$RUN_ID/execution-ledger.jsonl" \
  "$RUN_ID" approve 10 'Out-of-order command' -- \
  node -e 'require("node:fs").writeFileSync(process.argv[1], "ran")' "$WORK/out-of-order-command-ran") >/dev/null 2>&1; then
  echo 'approve command recorded before clarify finished' >&2; exit 1
fi
[ ! -e "$WORK/out-of-order-command-ran" ] || { echo 'out-of-order command executed before rejection' >&2; exit 1; }
[ "$before" = "$(shasum -a 256 "$RUN_DIR/execution-ledger.jsonl")" ]
printf '{"semantic_ac_key":"start_task_run_initializer","outcome":"pass","exact_initial_events":2,"duplicate_rejected":true,"out_of_order_append_rejected_before_write":true,"out_of_order_command_rejected_before_execution":true}\n'
