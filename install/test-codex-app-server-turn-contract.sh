#!/usr/bin/env bash
set -eu
set -f

DIR="$(cd "$(dirname "$0")" && pwd -P)"
ROOT="$(cd "$DIR/.." && pwd -P)"
MODULE="$ROOT/evals/behavioral/adapters/codex-turn-contract.js"
SCHEMA="$ROOT/skills/start-task/reference/kb/orchestration-report.schema.json"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/vulpora-codex-turn.XXXXXX")" || exit 1
trap 'rm -rf "$WORK"' EXIT HUP INT TERM

node - "$MODULE" "$SCHEMA" "$WORK" <<'NODE'
'use strict';
const fs=require('node:fs');
const [modulePath,schemaPath,fixture]=process.argv.slice(2);
const {buildTurnStartParams,loadReportSchema}=require(modulePath);
const schema=loadReportSchema(schemaPath);
function assertTypedLiterals(value){
  if(Array.isArray(value)){value.forEach(assertTypedLiterals);return;}
  if(!value||typeof value!=='object')return;
  if((Object.hasOwn(value,'const')||Array.isArray(value.enum))&&!value.type)process.exit(1);
  for(const keyword of ['allOf','oneOf','not','if','then','else','dependentRequired','dependentSchemas','prefixItems','contains','uniqueItems']){
    if(Object.hasOwn(value,keyword))process.exit(1);
  }
  if(value.type==='object'&&value.properties){
    if(value.additionalProperties!==false||JSON.stringify(value.required)!==JSON.stringify(Object.keys(value.properties)))process.exit(1);
  }
  if(value.type==='array'&&(!value.items||value.items===false))process.exit(1);
  Object.values(value).forEach(assertTypedLiterals);
}
assertTypedLiterals(schema);
const params=buildTurnStartParams({threadId:'thread-1',prompt:'$start-task "fixture"',fixture,outputSchema:schema});
if(params.threadId!=='thread-1'||params.input?.[0]?.text!=='$start-task "fixture"')process.exit(1);
if(params.effort!=='medium'||params.outputSchema?.properties?.schema_version?.const!=='vulpora.orchestration-report/v3')process.exit(1);
if(params.approvalPolicy!=='never'||params.sandboxPolicy?.type!=='workspaceWrite'
  ||params.sandboxPolicy.networkAccess!==false||params.sandboxPolicy.writableRoots?.[0]!==fixture)process.exit(1);
const malformed=`${fixture}/malformed.json`,wrong=`${fixture}/wrong.json`;
fs.writeFileSync(malformed,'{broken');
fs.writeFileSync(wrong,JSON.stringify({$id:'wrong'}));
for(const candidate of [malformed,wrong]){
  let rejected=false;try{loadReportSchema(candidate);}catch{rejected=true;}
  if(!rejected)process.exit(1);
}
NODE

printf '{"semantic_ac_key":"codex_app_server_turn_contract","outcome":"pass","structured_report":true,"bounded_medium_effort":true,"network_denied":true}\n'
