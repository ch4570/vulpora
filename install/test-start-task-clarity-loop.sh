#!/usr/bin/env bash
set -eu
set -f

DIR="$(cd "$(dirname "$0")" && pwd -P)"
ROOT="$(cd "$DIR/.." && pwd -P)"
SCORER="$ROOT/skills/start-task/scripts/score-clarity.js"
ASSESSOR="$ROOT/skills/start-task/scripts/assess-clarity.js"
VALIDATOR="$ROOT/skills/start-task/scripts/validate-clarity-gate.js"
QUESTION_VALIDATOR="$ROOT/skills/start-task/scripts/validate-question-frame.js"
SKILL="$ROOT/skills/start-task/reference/kb/operating-contract.md"
FAST_PATH="$ROOT/skills/start-task/reference/kb/runtime-fast-path.md"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/vulpora-clarity-loop.XXXXXX")" || exit 1
trap 'rm -rf "$WORK"' EXIT HUP INT TERM

test -x "$SCORER"
test -x "$ASSESSOR"

cat > "$WORK/below-threshold.json" <<'JSON'
{
  "assessment": {
    "goal":{"signals":{"outcome_named":true,"trigger_named":true,"observable_change_named":true,"user_value_named":true},"evidence":"user: 요청 결과가 구체적으로 관찰 가능하게 설명되었습니다."},
    "scope":{"signals":{"include_named":true,"exclude_named":false,"repository_targets_bound":true,"ownership_bound":false},"evidence":"repository: 변경 범위 일부만 저장소에서 확인되었습니다."},
    "acceptance":{"signals":{"happy_path_observable":true,"failure_path_observable":false,"expected_values_named":true,"criterion_ids_stable":false},"evidence":"repository: 핵심 성공 조건 일부만 테스트로 확인됩니다."},
    "constraints":{"signals":{"compatibility_named":true,"dependency_policy_named":true,"operational_limits_named":true,"recovery_named":true},"evidence":"policy: 외부 작업과 신규 의존성을 허용하지 않습니다."},
    "authority_risk":{"signals":{"write_scope_named":true,"external_effects_named":true,"destructive_effects_resolved":true,"credentials_resolved":true},"evidence":"user: 로컬 작업공간 안의 가역적 변경만 요청했습니다."},
    "verification":{"signals":{"method_named":true,"expected_outcome_named":true,"failure_diagnostics_named":false,"environment_bound":false},"evidence":"repository: 집중 테스트 경로만 현재 확인되었습니다."}
  },
  "unknowns": [
    {"id":"U-SCOPE","category":"scope","summary":"수정할 모듈의 정확한 경계가 아직 결정되지 않았습니다.","blocking":false,"disposition":"pending"}
  ],
  "proceed": {"requested":false,"basis":null,"reason":null,"decision_ref":null,"decision_context":null}
}
JSON

node "$SCORER" < "$WORK/below-threshold.json" > "$WORK/below-threshold.projection.json"
node "$VALIDATOR" < "$WORK/below-threshold.projection.json" >/dev/null
node - "$WORK/below-threshold.projection.json" <<'NODE'
const value=require(process.argv[2]);
if(value.spec_status!=='needs_input'||value.approval!==false
  ||value.clarity_gate.score!==75||value.clarity_gate.status!=='blocked')process.exit(1);
NODE

node - "$WORK/below-threshold.json" "$WORK/model-rated.json" <<'NODE'
const fs=require('node:fs');const value=JSON.parse(fs.readFileSync(process.argv[2]));
value.assessment.scope.rating=4;fs.writeFileSync(process.argv[3],JSON.stringify(value));
NODE
if node "$SCORER" < "$WORK/model-rated.json" >/dev/null 2>&1; then
  echo 'model-supplied rating was accepted' >&2
  exit 1
fi

node - "$WORK/below-threshold.json" "$WORK/confirmed-below-threshold.json" <<'NODE'
const fs=require('node:fs'),crypto=require('node:crypto');
const [src,out]=process.argv.slice(2),value=JSON.parse(fs.readFileSync(src));
const canonical=(candidate)=>candidate===null||typeof candidate!=='object'?JSON.stringify(candidate)
  :Array.isArray(candidate)?`[${candidate.map(canonical).join(',')}]`
  :`{${Object.keys(candidate).sort().map((key)=>`${JSON.stringify(key)}:${canonical(candidate[key])}`).join(',')}}`;
value.unknowns[0].disposition='accepted_risk';
const unknownsSha=crypto.createHash('sha256').update(canonical(value.unknowns)).digest('hex');
const offer={run_id:'run-clarity-loop',offered_clarity_score:75,offered_ambiguity_score:25,
  offered_unknown_ids:['U-SCOPE'],offered_unknowns_sha256:unknownsSha,question_signature:'blocker:U-SCOPE'};
const offerSha=crypto.createHash('sha256').update(canonical(offer)).digest('hex');
const answerSha='f'.repeat(64);
value.proceed={requested:true,basis:'explicit_user_request',reason:'사용자가 현재 명세 확정을 명시적으로 선택했습니다.',
  decision_ref:`answer-sha256:${answerSha}`,decision_context:{...offer,answer_sha256:answerSha,
    offer_sha256:offerSha,offer_ref:`file-sha256:${offerSha}:.vulpora/tasks/${offer.run_id}/clarification-offer-${offerSha}.json`}};
fs.writeFileSync(out,JSON.stringify(value));
NODE
node "$SCORER" < "$WORK/confirmed-below-threshold.json" > "$WORK/confirmed-below-threshold.projection.json"
node "$VALIDATOR" < "$WORK/confirmed-below-threshold.projection.json" >/dev/null
node - "$WORK/confirmed-below-threshold.projection.json" <<'NODE'
const value=require(process.argv[2]);
if(value.spec_status!=='ready'||value.approval!==true||value.clarity_gate.score!==75
  ||value.clarity_gate.status!=='skipped'||value.clarity_gate.skip.accepted_risk_unknown_ids[0]!=='U-SCOPE')process.exit(1);
NODE

cat > "$WORK/answered.json" <<'JSON'
{
  "assessment": {
    "goal":{"signals":{"outcome_named":true,"trigger_named":true,"observable_change_named":true,"user_value_named":true},"evidence":"user: 요청 결과가 구체적으로 관찰 가능하게 설명되었습니다."},
    "scope":{"signals":{"include_named":true,"exclude_named":true,"repository_targets_bound":true,"ownership_bound":true},"evidence":"user: 포함 범위와 제외 범위를 답변으로 확정했습니다."},
    "acceptance":{"signals":{"happy_path_observable":true,"failure_path_observable":true,"expected_values_named":true,"criterion_ids_stable":true},"evidence":"user: 성공과 실패를 판정할 인수 기준을 확정했습니다."},
    "constraints":{"signals":{"compatibility_named":true,"dependency_policy_named":true,"operational_limits_named":true,"recovery_named":true},"evidence":"policy: 외부 작업과 신규 의존성을 허용하지 않습니다."},
    "authority_risk":{"signals":{"write_scope_named":true,"external_effects_named":true,"destructive_effects_resolved":true,"credentials_resolved":true},"evidence":"user: 로컬 작업공간 안의 가역적 변경만 요청했습니다."},
    "verification":{"signals":{"method_named":true,"expected_outcome_named":true,"failure_diagnostics_named":true,"environment_bound":true},"evidence":"repository: 모든 인수 기준을 검증할 명령이 확인되었습니다."}
  },
  "unknowns": [],
  "proceed": {"requested":false,"basis":null,"reason":null,"decision_ref":null,"decision_context":null}
}
JSON

node "$SCORER" < "$WORK/answered.json" > "$WORK/answered.projection.json"
node "$VALIDATOR" < "$WORK/answered.projection.json" >/dev/null
node - "$WORK/answered.projection.json" <<'NODE'
const value=require(process.argv[2]);
if(value.spec_status!=='ready'||value.approval!==true
  ||value.clarity_gate.score!==100||value.clarity_gate.status!=='passed')process.exit(1);
NODE

cat > "$WORK/exact-threshold.json" <<'JSON'
{
  "assessment": {
    "goal":{"signals":{"outcome_named":true,"trigger_named":true,"observable_change_named":true,"user_value_named":true},"evidence":"user: 요청 결과가 구체적으로 관찰 가능하게 설명되었습니다."},
    "scope":{"signals":{"include_named":true,"exclude_named":true,"repository_targets_bound":true,"ownership_bound":false},"evidence":"user: 변경할 모듈과 제외 범위를 충분히 확정했습니다."},
    "acceptance":{"signals":{"happy_path_observable":true,"failure_path_observable":true,"expected_values_named":true,"criterion_ids_stable":false},"evidence":"repository: 핵심 성공 조건을 검증할 테스트가 확인되었습니다."},
    "constraints":{"signals":{"compatibility_named":true,"dependency_policy_named":true,"operational_limits_named":true,"recovery_named":true},"evidence":"policy: 외부 작업과 신규 의존성을 허용하지 않습니다."},
    "authority_risk":{"signals":{"write_scope_named":true,"external_effects_named":true,"destructive_effects_resolved":true,"credentials_resolved":true},"evidence":"user: 로컬 작업공간 안의 가역적 변경만 요청했습니다."},
    "verification":{"signals":{"method_named":true,"expected_outcome_named":true,"failure_diagnostics_named":false,"environment_bound":false},"evidence":"repository: 집중 검증 명령과 판정 기준이 확인되었습니다."}
  },
  "unknowns": [],
  "proceed": {"requested":false,"basis":null,"reason":null,"decision_ref":null,"decision_context":null}
}
JSON
node "$SCORER" < "$WORK/exact-threshold.json" > "$WORK/exact-threshold.projection.json"
node "$VALIDATOR" < "$WORK/exact-threshold.projection.json" >/dev/null
node - "$WORK/exact-threshold.projection.json" <<'NODE'
const value=require(process.argv[2]);
if(value.spec_status!=='ready'||value.approval!==true
  ||value.clarity_gate.score!==85||value.clarity_gate.status!=='passed')process.exit(1);
NODE

cat > "$WORK/non-bypassable.json" <<'JSON'
{
  "assessment": {
    "goal":{"signals":{"outcome_named":true,"trigger_named":true,"observable_change_named":true,"user_value_named":true},"evidence":"user: 요청 결과가 구체적으로 관찰 가능하게 설명되었습니다."},
    "scope":{"signals":{"include_named":true,"exclude_named":true,"repository_targets_bound":true,"ownership_bound":true},"evidence":"user: 포함 범위와 제외 범위를 답변으로 확정했습니다."},
    "acceptance":{"signals":{"happy_path_observable":true,"failure_path_observable":true,"expected_values_named":true,"criterion_ids_stable":true},"evidence":"user: 성공과 실패를 판정할 인수 기준을 확정했습니다."},
    "constraints":{"signals":{"compatibility_named":true,"dependency_policy_named":true,"operational_limits_named":true,"recovery_named":true},"evidence":"policy: 외부 작업과 신규 의존성을 허용하지 않습니다."},
    "authority_risk":{"signals":{"write_scope_named":true,"external_effects_named":true,"destructive_effects_resolved":true,"credentials_resolved":true},"evidence":"user: 로컬 작업공간 안의 가역적 변경만 요청했습니다."},
    "verification":{"signals":{"method_named":true,"expected_outcome_named":true,"failure_diagnostics_named":true,"environment_bound":true},"evidence":"repository: 모든 인수 기준을 검증할 명령이 확인되었습니다."}
  },
  "unknowns": [
    {"id":"U-AUTH","category":"authority","summary":"외부 시스템 변경 권한과 승인 주체가 결정되지 않았습니다.","blocking":true,"disposition":"pending"}
  ],
  "proceed": {"requested":false,"basis":null,"reason":null,"decision_ref":null,"decision_context":null}
}
JSON

node "$SCORER" < "$WORK/non-bypassable.json" > "$WORK/non-bypassable.projection.json"
node "$VALIDATOR" < "$WORK/non-bypassable.projection.json" >/dev/null
node - "$WORK/non-bypassable.projection.json" <<'NODE'
const value=require(process.argv[2]);
if(value.clarity_gate.score!==96||value.clarity_gate.status!=='blocked'
  ||value.clarity_gate.skip.non_bypassable_blocker_ids[0]!=='U-AUTH')process.exit(1);
NODE

cat > "$WORK/question.txt" <<'TEXT'
현재 명확도는 75/100이고 모호성은 25/100입니다.
모듈 변경 범위가 아직 충분히 정해지지 않았습니다.
원하시면 남은 가정과 위험을 기록하고 현재 내용으로 작업 명세를 확정해 구현을 시작할 수 있습니다.
추천 기본값: 회귀 위험을 줄이기 위해 관련 테스트가 있는 모듈만 바꿉니다.
`추천 기본값으로 진행` 또는 원하는 다른 모듈 변경 범위를 알려주시겠어요?
TEXT
node "$QUESTION_VALIDATOR" --expected-clarity 75 --risk-category scope < "$WORK/question.txt" >/dev/null

grep -Fq 'scripts/score-clarity.js' "$SKILL"
grep -Fq 'leader-inline clarification fallback' "$SKILL"
grep -Fq 'must not terminate the run with `AGENT_UNAVAILABLE:requirement-dialogue`' "$SKILL"
grep -Fq 'one persistent clarification-child session' "$FAST_PATH"
grep -Fq 'without a skill-owned turn count or wall-clock cap' "$FAST_PATH"
grep -Fq 'recompute the score after every user answer' "$FAST_PATH"

printf '{"semantic_ac_key":"start_task_clarity_loop","outcome":"pass","evidence_derived_rating":true,"model_rating_rejected":true,"deterministic_score":true,"question_below_threshold":true,"direct_execution_at_threshold":true,"user_can_confirm_below_threshold":true,"non_bypassable_preserved":true,"clarification_fallback":true}\n'
