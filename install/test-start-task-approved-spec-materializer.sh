#!/usr/bin/env bash
set -eu
set -f

DIR="$(cd "$(dirname "$0")" && pwd -P)"
ROOT="$(cd "$DIR/.." && pwd -P)"
MATERIALIZER="$ROOT/skills/start-task/scripts/materialize-approved-spec.js"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/vulpora-approved-spec.XXXXXX")" || exit 1
trap 'rm -rf "$WORK"' EXIT HUP INT TERM
REPO="$WORK/repo"
RUN_ID='run-materialize-12345678'
RUN_DIR="$REPO/.vulpora/tasks/$RUN_ID"
mkdir -p "$RUN_DIR"

candidate='{"schema":"vulpora.clarified-task-spec-candidate/v2","spec_id":"spec-positive","status":"ready","approval":true,"approval_basis":"task-input-sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","clarity_projection":{"spec_status":"ready","approval":true,"unknowns":[],"clarity_gate":{"score":100,"threshold":85,"status":"passed","dimensions":[{"id":"goal","rating":4,"weight":20,"awarded":20,"evidence":"user: requested observable result"},{"id":"scope","rating":4,"weight":20,"awarded":20,"evidence":"repository: two exact source paths"},{"id":"acceptance","rating":4,"weight":20,"awarded":20,"evidence":"user: explicit boundary examples"},{"id":"constraints","rating":4,"weight":15,"awarded":15,"evidence":"policy: local execution only"},{"id":"authority_risk","rating":4,"weight":15,"awarded":15,"evidence":"policy: bounded workspace writes"},{"id":"verification","rating":4,"weight":10,"awarded":10,"evidence":"repository: offline test command exists"}],"skip":{"requested":false,"basis":null,"reason":null,"decision_ref":null,"accepted_risk_unknown_ids":[],"non_bypassable_blocker_ids":[]}}},"goal":"Implement the requested positive-number predicate.","context":{"evidence":[]},"scope":{"include":["src/numbers.js","test/numbers.test.js"],"exclude":[]},"requirements":{"functional":["Return true exactly above zero"],"non_functional":[]},"acceptance_criteria":["The examples pass."],"constraints":[],"assumptions":[],"decisions":[],"authority":{"allowed_reads":["workspace"],"allowed_writes":["src/numbers.js","test/numbers.test.js"],"allowed_external_effects":[],"forbidden":["network"]},"verification":[{"command_or_method":"./run-offline.sh node --test","expected":"exit 0"}],"provenance":{"generated_by":"requirement-dialogue","question_rounds":0,"source_summary":["task input"]}}'

printf '%s' "$candidate" | (cd "$REPO" && node "$MATERIALIZER" "$RUN_ID") >"$WORK/result.json"
node - "$WORK/result.json" "$RUN_DIR" <<'NODE'
const crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const [resultPath,dir]=process.argv.slice(2),result=JSON.parse(fs.readFileSync(resultPath));
const projection=fs.readFileSync(path.join(dir,'clarity-projection.json'));
const specBytes=fs.readFileSync(path.join(dir,'clarified-spec.yaml'));
const spec=JSON.parse(specBytes);
const hash=(bytes)=>crypto.createHash('sha256').update(bytes).digest('hex');
if(result.outcome!=='pass'||result.spec_id!=='spec-positive'||result.revision!==1
  ||result.clarity_projection.sha256!==hash(projection)||result.clarified_spec.sha256!==hash(specBytes)
  ||spec.schema!=='vulpora.clarified-task-spec/v2'||spec.spec_id!=='spec-positive'
  ||spec.clarity_projection_sha256!==hash(projection)||spec.clarity_projection_path!==result.clarity_projection.path
  ||spec.approval!==undefined||spec.approval_basis!==undefined
  ||JSON.stringify(result.acceptance_criterion_ids)!=='["AC-001"]'
  ||spec.acceptance_criteria[0]?.id!=='AC-001'||spec.acceptance_criteria[0]?.description!=='The examples pass.')process.exit(1);
NODE

LEGACY_RUN_ID='run-materialize-final-1234'
mkdir "$REPO/.vulpora/tasks/$LEGACY_RUN_ID"
printf '%s' "$candidate" | node -e '
  let text="";process.stdin.on("data",chunk=>text+=chunk);process.stdin.on("end",()=>{
    const value=JSON.parse(text);value.schema="vulpora.clarified-task-spec/v2";
    delete value.approval;delete value.approval_basis;
    value.spec_id="spec/positive";
    value.acceptance_criteria=value.acceptance_criteria.map(item=>({id:"AC-001",statement:item}));
    value.requirements=value.requirements.functional;value.verification={command:"node --test"};
    value.clarity_projection.clarity_gate.dimensions=value.clarity_projection.clarity_gate.dimensions.map(item=>({dimension:item.id,...Object.fromEntries(Object.entries(item).filter(([key])=>key!=="id"))}));
    value.clarity_projection.clarity_gate.skip=null;
    value.clarity_projection_path="untrusted/path";value.clarity_projection_sha256="placeholder";
    process.stdout.write(JSON.stringify(value));
  });
' | (cd "$REPO" && node "$MATERIALIZER" "$LEGACY_RUN_ID") >"$WORK/final-proposal-result.json"
node - "$WORK/final-proposal-result.json" "$REPO/.vulpora/tasks/$LEGACY_RUN_ID/clarified-spec.yaml" <<'NODE'
const fs=require('node:fs');const [resultPath,specPath]=process.argv.slice(2);
const result=JSON.parse(fs.readFileSync(resultPath)),spec=JSON.parse(fs.readFileSync(specPath));
if(result.input_schema!=='vulpora.clarified-task-spec/v2'||result.spec_id!=='spec-positive'
  ||result.normalized_input_fields.join(',')!=='spec_id_characters,requirements_array,verification_object,verification_method,clarity_dimension_id,clarity_passed_skip'
  ||spec.clarity_projection_path!==`.vulpora/tasks/${result.clarity_projection.path.split('/')[2]}/clarity-projection.json`
  ||spec.clarity_projection_sha256==='placeholder'
  ||spec.acceptance_criteria[0]?.description!=='The examples pass.'
  ||spec.acceptance_criteria[0]?.statement!==undefined
  ||spec.spec_id!=='spec-positive'||!Array.isArray(spec.requirements.functional)||!Array.isArray(spec.verification)
  ||spec.verification[0]?.command_or_method!=='node --test')process.exit(1);
NODE

before="$(shasum -a 256 "$RUN_DIR/clarity-projection.json" "$RUN_DIR/clarified-spec.yaml")"
if printf '%s' "$candidate" | (cd "$REPO" && node "$MATERIALIZER" "$RUN_ID") >/dev/null 2>&1; then
  echo 'duplicate materialization accepted' >&2; exit 1
fi
[ "$before" = "$(shasum -a 256 "$RUN_DIR/clarity-projection.json" "$RUN_DIR/clarified-spec.yaml")" ]

BAD_ID='run-materialize-bad-1234'
mkdir "$REPO/.vulpora/tasks/$BAD_ID"
bad="${candidate/\"score\":100/\"score\":99}"
if printf '%s' "$bad" | (cd "$REPO" && node "$MATERIALIZER" "$BAD_ID") >/dev/null 2>&1; then
  echo 'invalid projection accepted' >&2; exit 1
fi
[ ! -e "$REPO/.vulpora/tasks/$BAD_ID/clarity-projection.json" ]
[ ! -e "$REPO/.vulpora/tasks/$BAD_ID/clarified-spec.yaml" ]

BAD_ACCEPTANCE_ID='run-materialize-bad-acceptance'
mkdir "$REPO/.vulpora/tasks/$BAD_ACCEPTANCE_ID"
if printf '%s' "$candidate" | node -e '
  let text="";process.stdin.on("data",chunk=>text+=chunk);process.stdin.on("end",()=>{
    const value=JSON.parse(text);value.acceptance_criteria=[{id:"AC-001",statement:""}];
    process.stdout.write(JSON.stringify(value));
  });
' | (cd "$REPO" && node "$MATERIALIZER" "$BAD_ACCEPTANCE_ID") >/dev/null 2>&1; then
  echo 'invalid acceptance accepted' >&2; exit 1
fi
[ ! -e "$REPO/.vulpora/tasks/$BAD_ACCEPTANCE_ID/clarity-projection.json" ]
[ ! -e "$REPO/.vulpora/tasks/$BAD_ACCEPTANCE_ID/clarified-spec.yaml" ]

printf '{"semantic_ac_key":"start_task_approved_spec_materializer","outcome":"pass","candidate_validated":true,"projection_bound":true,"exclusive_create":true}\n'
