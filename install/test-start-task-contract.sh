#!/usr/bin/env bash
set -eu
DIR="$(cd "$(dirname "$0")" && pwd -P)"; ROOT="$(cd "$DIR/.." && pwd -P)"

files="README.md README.ko.md INSTALL.md CHANGELOG.md evals/behavioral/README.md skills/start-task/reference/kb/operating-contract.md skills/start-task/agents/openai.yaml"
for rel in $files; do
  grep -Fq 'vulpora.start-task/v1' "$ROOT/$rel" || { echo "missing workflow contract: $rel" >&2; exit 1; }
done
grep -Fq 'Codex: invoke `$start-task`, or select `start-task` from `/skills`.' "$ROOT/skills/start-task/reference/kb/operating-contract.md"
grep -Fq 'Claude Code: invoke `/start-task`.' "$ROOT/skills/start-task/reference/kb/operating-contract.md"
grep -Fq '$start-task "<task description string>"' "$ROOT/skills/start-task/reference/kb/operating-contract.md"
grep -Fq '/start-task "<task description string>"' "$ROOT/skills/start-task/reference/kb/operating-contract.md"
grep -Fq 'Never evaluate it as shell' "$ROOT/skills/start-task/reference/kb/operating-contract.md"
grep -Fq 'Show the current clarity and ambiguity scores' "$ROOT/skills/start-task/reference/kb/operating-contract.md"
grep -Fq 'The user owns the decision to clarify further or proceed' "$ROOT/skills/start-task/reference/kb/operating-contract.md"
grep -Fq 'Do not impose a fixed question-count limit' "$ROOT/skills/start-task/reference/kb/operating-contract.md"
grep -Fq 'If the user explicitly asks to implement with known uncertainty' "$ROOT/skills/start-task/reference/kb/operating-contract.md"
grep -Fq 'For every `needs_input` turn, relay the selected clarification path' "$ROOT/skills/start-task/reference/kb/operating-contract.md"
grep -Fq '`needs_input` is a waiting state' "$ROOT/skills/start-task/reference/kb/operating-contract.md"
grep -Fq '하나의 문장 안에 여러 입력 항목이나 하위 질문' "$ROOT/agents/requirement-dialogue.md"
grep -Fq 'Primary는 점수와 설명, 진행 가능 안내, `question`을 자연스러운 대화로 전달한다' "$ROOT/agents/requirement-dialogue.md"
grep -Fq '명확도와 모호성 점수를 숨기지 않는다' "$ROOT/agents/requirement-dialogue/SOUL.md"
rg -q -U '한 턴에 결정 축을 정확히\s+하나' "$ROOT/agents/requirement-dialogue.md"
grep -Fq '자유 입력을 막는 폐쇄형 객관식' "$ROOT/agents/requirement-dialogue.md"
grep -Fq '추천 기본값으로 진행' "$ROOT/agents/requirement-dialogue.md"
grep -Fq '`추천 기본값으로 진행` 또는 원하는 다른 모듈 변경 범위를 알려주시겠어요?' "$ROOT/agents/requirement-dialogue.md"
grep -Fq 'tools: Read, Grep, Glob, Skill' "$ROOT/agents/requirement-dialogue.md"
grep -Fq '정확한 `korean-dev-writer` 스킬로 윤문' "$ROOT/agents/requirement-dialogue.md"
grep -Fq 'SKILL_UNAVAILABLE:korean-dev-writer' "$ROOT/agents/requirement-dialogue.md"
grep -Fq 'exact installed `korean-dev-writer` skill' "$ROOT/agents/requirement-dialogue.codex.toml"
grep -Fq 'agent | requirement-dialogue | agents/requirement-dialogue.md | agents/requirement-dialogue | skill:korean-dev-writer | -' "$ROOT/install/manifest.txt"
grep -Fq 'korean_writer_path=' "$ROOT/evals/behavioral/adapters/run-start-task-native.sh"
grep -Fq "id==='requirement-dialogue'?['Read','Grep','Glob','Skill']" "$ROOT/evals/behavioral/adapters/run-start-task-native.sh"
grep -Fq 'isolated_claude_plugin/skills/korean-dev-writer' "$ROOT/evals/behavioral/adapters/run-start-task-native.sh"
grep -Fq 'completed_task_ids=[],' "$ROOT/evals/behavioral/adapters/run-start-task-native.sh"
grep -Fq 'pending_task_ids=[], remaining_acceptance_criterion_ids=[]' "$ROOT/evals/behavioral/adapters/run-start-task-native.sh"
grep -Fq 'Never carry completed IDs or frozen-artifact copies in continuation.' "$ROOT/evals/behavioral/adapters/run-start-task-native.sh"
grep -Fq '`skip.decision_ref`' "$ROOT/skills/start-task/reference/kb/operating-contract.md"
rg -q -U 'cannot\s+grant authority or bypass destructive/irreversible action' "$ROOT/skills/start-task/reference/kb/operating-contract.md"
grep -Fq 'Do not emit a generic freeze-confirmation question' "$ROOT/skills/start-task/reference/kb/operating-contract.md"
grep -Fq 'An implementation request already supplies implementation intent' "$ROOT/skills/start-task/reference/kb/operating-contract.md"
grep -Fq 'append exactly one `spec_committed`' "$ROOT/skills/start-task/reference/kb/operating-contract.md"
grep -Fq 'normative change requires a successor run' "$ROOT/skills/start-task/reference/kb/operating-contract.md"
grep -Fq '이 디렉터리에서 설치할 시스템 범위를 어디까지로 잡을까요?' "$ROOT/agents/requirement-dialogue.md"
grep -Fq '"clarity_gate":' "$ROOT/agents/requirement-dialogue/reference/kb/clarified-spec-schema.md"
rg -q -U 'gate status가\s+`passed\|skipped`' \
  "$ROOT/agents/requirement-dialogue/reference/kb/clarified-spec-schema.md"
grep -Fq 'malformed/blocked clarity gate' "$ROOT/agents/task-splitter.md"
grep -Fq 'blocked/malformed clarity gate' "$ROOT/agents/task-orchestrator.md"
grep -Fq 'score, threshold 85를 독립 재계산한다' "$ROOT/agents/task-splitter.md"
grep -Fq 'score 합계를 task-splitter와 같은 공식으로 다시 계산한다' "$ROOT/agents/task-orchestrator.md"
grep -Fq 'runtime_available_slots' "$ROOT/agents/task-splitter.md"
grep -Fq '`outputs`는 `write_scope`의 정확한 경로만 포함' "$ROOT/agents/task-splitter.md"
grep -Fq '새 점수를 만들거나' "$ROOT/agents/task-splitter.md"
grep -Fq '관찰되지 않은 관례적 경로를 추측해서 만들지 않는다' "$ROOT/agents/task-splitter.md"
grep -Fq 'dependency_ready_tasks' "$ROOT/agents/task-splitter.md"
grep -Fq 'AC의 `observable behavior → contract/state → evidence`' "$ROOT/agents/task-splitter.md"
grep -Fq 'role calibration' "$ROOT/agents/task-splitter.md"
grep -Fq 'disjoint_write_logical_scopes' "$ROOT/agents/task-orchestrator.md"
grep -Fq 'higher_policy_limit' "$ROOT/agents/task-orchestrator.md"
grep -Fq 'completion matrix' "$ROOT/agents/task-orchestrator.md"
grep -Fq 'scripts/validate-clarity-gate.js' "$ROOT/skills/start-task/reference/kb/operating-contract.md"
[ -x "$ROOT/skills/start-task/scripts/validate-clarity-gate.js" ]
grep -Fq 'scripts/score-clarity.js' "$ROOT/skills/start-task/reference/kb/operating-contract.md"
[ -x "$ROOT/skills/start-task/scripts/score-clarity.js" ]
grep -Fq 'scripts/assess-clarity.js' "$ROOT/skills/start-task/reference/kb/operating-contract.md"
[ -x "$ROOT/skills/start-task/scripts/assess-clarity.js" ]
grep -Fq 'callers never supply numeric ratings' "$ROOT/skills/start-task/reference/kb/operating-contract.md"
grep -Fq 'leader-inline clarification fallback' "$ROOT/skills/start-task/reference/kb/operating-contract.md"
if head -n 20 "$ROOT/agents/requirement-dialogue.md" | grep -Eq '^maxTurns:'; then
  echo 'requirement-dialogue must not have a fixed maxTurns cap' >&2; exit 1
fi
grep -Fq '`maxTurns`, 질문 총량, 전체 wall-clock 상한을 두지 않는다' "$ROOT/agents/requirement-dialogue.md"
grep -Fq 'Treat score 85 as permission to run the deterministic closure audit' "$ROOT/skills/start-task/reference/kb/operating-contract.md"
grep -Fq 'missing_canonical_projection' "$ROOT/agents/requirement-dialogue.md"
if rg -n 'capped at 60 seconds|smaller of 60 seconds|기본 wall-clock 55초|최대 60초' \
  "$ROOT/skills/start-task/reference/kb/operating-contract.md" "$ROOT/skills/start-task/reference/kb/runtime-fast-path.md" \
  "$ROOT/agents/requirement-dialogue.md" "$ROOT/docs/start-task-orchestration.md" >/dev/null; then
  echo 'fixed clarification wall-clock cap found' >&2; exit 1
fi
grep -Fq 'clarification_fallback_started' "$ROOT/skills/start-task/reference/kb/operating-contract.md"
grep -Fq '`clarification_heartbeat`' "$ROOT/skills/start-task/reference/kb/operating-contract.md"
grep -Fq '`no_progress_at_yield`' "$ROOT/skills/start-task/reference/kb/operating-contract.md"
grep -Fq '현재 내용으로 작업 명세를 확정' "$ROOT/skills/start-task/reference/kb/operating-contract.md"
grep -Fq 'scripts/validate-question-frame.js' "$ROOT/skills/start-task/reference/kb/operating-contract.md"
grep -Fq -- '--expected-clarity <canonical-score>' "$ROOT/skills/start-task/reference/kb/operating-contract.md"
grep -Fq -- '--risk-category <unknown-category>' "$ROOT/skills/start-task/reference/kb/operating-contract.md"
grep -Fq -- '--contract clarity-gate' "$ROOT/skills/start-task/reference/kb/operating-contract.md"
grep -Fq 'The initial task digest cannot prove that the user saw the scores' "$ROOT/skills/start-task/reference/kb/operating-contract.md"
grep -Fq 'clarification-offer-<sha256>.json' "$ROOT/skills/start-task/reference/kb/operating-contract.md"
grep -Fq 'structured DAG risk entry' "$ROOT/skills/start-task/reference/kb/operating-contract.md"
[ -x "$ROOT/skills/start-task/scripts/validate-question-frame.js" ]
grep -Fq 'scripts/validate-run-control.js' "$ROOT/skills/start-task/reference/kb/operating-contract.md"
[ -x "$ROOT/skills/start-task/scripts/validate-run-control.js" ]
grep -Fq 'scripts/freeze-run-control.js' "$ROOT/skills/start-task/reference/kb/operating-contract.md"
[ -x "$ROOT/skills/start-task/scripts/freeze-run-control.js" ]
grep -Fq 'runtime-fast-path.md' "$ROOT/skills/start-task/reference/kb/operating-contract.md"
grep -Fq 'Do not inspect bundled script implementations or the report schema on the normal path' "$ROOT/skills/start-task/reference/kb/operating-contract.md"
grep -Fq 'Reserve the final 120 seconds' "$ROOT/skills/start-task/reference/kb/runtime-fast-path.md"
grep -Fq 'vulpora.start-task-run-control/v1' "$ROOT/skills/start-task/reference/kb/runtime-fast-path.md"
grep -Fq 'The `goal` evidence must start with `user:`' "$ROOT/skills/start-task/reference/kb/runtime-fast-path.md"
grep -Fq 'use `not_run`, never `pending`' "$ROOT/skills/start-task/reference/kb/runtime-fast-path.md"
grep -Fq 'normalize-task-dag.js' "$ROOT/skills/start-task/reference/kb/runtime-fast-path.md"
grep -Fq 'Never invoke the append script without that complete stdin object' "$ROOT/skills/start-task/reference/kb/runtime-fast-path.md"
[ -x "$ROOT/skills/start-task/scripts/write-canonical-json.js" ]
[ -x "$ROOT/skills/start-task/scripts/initialize-run.js" ]
[ -x "$ROOT/skills/start-task/scripts/materialize-approved-spec.js" ]
[ -x "$ROOT/skills/start-task/scripts/normalize-task-dag.js" ]
[ -x "$ROOT/skills/start-task/scripts/verify-and-freeze-run.js" ]
grep -Fq 'checkpoint before current' "$ROOT/evals/behavioral/adapters/run-start-task-native.sh"
grep -Fq 'scripts/validate-task-dag.js' "$ROOT/skills/start-task/reference/kb/operating-contract.md"
[ -x "$ROOT/skills/start-task/scripts/validate-task-dag.js" ]
grep -Fq '질문은 그만하고 현재 내용으로 바로 구현해' "$ROOT/skills/start-task/reference/kb/operating-contract.md"
grep -Fq 'scripts/append-execution-ledger.js' "$ROOT/skills/start-task/reference/kb/operating-contract.md"
grep -Fq 'scripts/validate-execution-ledger.js' "$ROOT/skills/start-task/reference/kb/operating-contract.md"
grep -Fq 'scripts/record-execution-command.js' "$ROOT/skills/start-task/reference/kb/operating-contract.md"
grep -Fq 'Never omit `model` or `reasoning_effort` from an execution-child spawn' "$ROOT/skills/start-task/reference/kb/operating-contract.md"
grep -Fq '`fork_turns: none`' "$ROOT/skills/start-task/reference/kb/operating-contract.md"
grep -Fq 'A costly primary model must not leak into `frugal|standard` children through inheritance' "$ROOT/skills/start-task/reference/kb/operating-contract.md"
grep -Fq 'model_selection: explicit-native-override' "$ROOT/agents/task-splitter/reference/kb/task-dag-schema.md"
grep -Fq 'parent-model inheritance is forbidden' "$ROOT/agents/task-splitter/reference/kb/model-session-routing.md"
grep -Fq 'requested_model' "$ROOT/skills/start-task/reference/kb/orchestration-report.schema.json"
grep -Fq 'inheritance_used' "$ROOT/skills/start-task/reference/kb/orchestration-report.schema.json"
grep -Fq '`lightweight`' "$ROOT/docs/start-task-orchestration.md"
grep -Fq '`standard`' "$ROOT/docs/start-task-orchestration.md"
grep -Fq '`audit`' "$ROOT/docs/start-task-orchestration.md"
grep -Fq '현재 phase가' "$ROOT/docs/start-task-orchestration.md"
# Both language editions expose the same profiles and detailed contract. Link
# labels and translated prose are presentation choices, not workflow semantics.
for readme in README.md README.ko.md; do
  grep -Fq '(docs/start-task-orchestration.md)' "$ROOT/$readme"
  for profile in lightweight standard audit; do
    grep -Fq "$profile" "$ROOT/$readme"
  done
done
grep -Fq 'Before invoking the clarification child, generate the fresh run id' "$ROOT/skills/start-task/reference/kb/operating-contract.md"
grep -Fq 'candidate v3 report and workspace root' "$ROOT/skills/start-task/reference/kb/operating-contract.md"
grep -Fq 'child:<agent-id>:<native-child-id>' "$ROOT/skills/start-task/reference/kb/operating-contract.md"
grep -Fq 'vulpora.clarified-task-spec-candidate/v2' "$ROOT/agents/requirement-dialogue.md"
grep -Fq 'vulpora.clarified-task-spec/v2' "$ROOT/agents/task-splitter.md"
grep -Fq 'vulpora.orchestration-report/v3' "$ROOT/skills/start-task/reference/kb/orchestration-report.schema.json"
[ -x "$ROOT/skills/start-task/scripts/append-execution-ledger.js" ]
[ -x "$ROOT/skills/start-task/scripts/validate-execution-ledger.js" ]
[ -x "$ROOT/skills/start-task/scripts/record-execution-command.js" ]
grep -Fq '`partial` is a resumable checkpoint' "$ROOT/skills/start-task/reference/kb/operating-contract.md"
grep -Fq 'continuation' "$ROOT/skills/start-task/reference/kb/orchestration-report.schema.json"
grep -Fq 'pass_without_zero_exit_code' "$ROOT/evals/behavioral/adapters/validate-start-task-report.js"
test -x "$ROOT/evals/behavioral/adapters/validate-start-task-ledger-visibility.js"
grep -Fq '`continuation.status`는 `ready_to_resume`, `question`은 `null`' "$ROOT/agents/task-orchestrator.md"
grep -Fq 'scripts/validate-terminal-response.js' "$ROOT/skills/start-task/reference/kb/operating-contract.md"
[ -x "$ROOT/skills/start-task/scripts/validate-terminal-response.js" ]
grep -Fq 'scripts/validate-resume-checkpoint.js' "$ROOT/skills/start-task/reference/kb/operating-contract.md"
[ -x "$ROOT/skills/start-task/scripts/validate-resume-checkpoint.js" ]
if rg -n 'max 6([^0-9]|$)|최대 6([^0-9]|$)|min\(6([^0-9]|$)|six-child|six active|max_parallelism[:=][[:space:]]*6([^0-9]|$)|at most six' \
  "$ROOT/skills/start-task" "$ROOT/agents/task-splitter.md" "$ROOT/agents/task-splitter" \
  "$ROOT/agents/task-orchestrator.md" "$ROOT/agents/task-orchestrator" \
  "$ROOT/agents/task-orchestrator.codex.toml" >/dev/null; then
  echo 'stale six-child start-task contract found' >&2; exit 1
fi
if rg -n -i '((at most|max(imum)?[ -]?(of )?|최대[[:space:]]*)3([^0-9]|$)|three|3개).{0,40}(managed|background|child|agent|parallel|concurrent|execution|session|세션|에이전트|병렬)|(managed|background|child|agent|parallel|concurrent|execution|session|세션|에이전트|병렬).{0,40}((at most|max(imum)?[ -]?(of )?|최대[[:space:]]*)3([^0-9]|$)|three|3개)|min\([^\n]*3([^0-9]|$)|parallelism_cap:[[:space:]]*3([^0-9]|$)|max_parallelism:[[:space:]]*3([^0-9]|$)' \
  "$ROOT/skills/start-task" "$ROOT/agents/task-splitter.md" "$ROOT/agents/task-splitter" \
  "$ROOT/agents/task-orchestrator.md" "$ROOT/agents/task-orchestrator" \
  "$ROOT/evals/behavioral/cases/start-task" "$ROOT/evals/behavioral/cases/task-splitter" \
  "$ROOT/evals/behavioral/cases/task-orchestrator" "$ROOT/docs/start-task-orchestration.md" \
  "$ROOT"/docs/diagrams/start-task-*.html >/dev/null; then
  echo 'fixed three-child start-task contract found' >&2; exit 1
fi
for rubric in \
  "$ROOT/skills/start-task/reference/kb/clarity-scoring.md" \
  "$ROOT/agents/requirement-dialogue/reference/kb/clarity-scoring.md"; do
  grep -Fq '85' "$rubric"
  grep -Fq 'non-bypassable' "$rubric" || grep -Fq '비우회' "$rubric"
done
if rg -n 'ready_for_confirmation|return_to: requirement-dialogue|질문 없는 partial은 금지' \
  "$ROOT/skills/start-task/reference/kb/operating-contract.md" "$ROOT/skills/start-task/reference" \
  "$ROOT/agents/requirement-dialogue.md" "$ROOT/agents/requirement-dialogue/reference" \
  "$ROOT/agents/task-splitter.md" "$ROOT/agents/task-orchestrator.md" \
  "$ROOT/agents/task-orchestrator/reference" "$ROOT/docs/start-task-orchestration.md" >/dev/null; then
  echo 'stale confirmation/back-edge start-task contract found' >&2; exit 1
fi
grep -Fq 'Use $start-task \"<task description>\"' "$ROOT/skills/start-task/agents/openai.yaml"
grep -Fq 'vulpora.start-task-profile/v1' "$ROOT/skills/start-task/agents/openai.yaml"
grep -Fq 'audit_workflow_contract: "vulpora.start-task/v1"' "$ROOT/skills/start-task/agents/openai.yaml"
grep -Fq 'codex_entrypoints: ["$start-task", "/skills selection"]' "$ROOT/skills/start-task/agents/openai.yaml"
grep -Fq 'claude_code_entrypoint: "/start-task"' "$ROOT/skills/start-task/agents/openai.yaml"
if rg -n 'Codex[^\n]*(invoke|run|use|입력|실행)[^\n]*`?/start-task`?' "$ROOT/README.md" "$ROOT/INSTALL.md" "$ROOT/CHANGELOG.md" "$ROOT/evals/behavioral/README.md" "$ROOT/skills/start-task" | grep -vE '(does not|never|unsupported|없|지원하지)' >/dev/null; then
  echo 'unsupported Codex /start-task claim found' >&2; exit 1
fi
for case_file in "$ROOT"/evals/behavioral/cases/start-task/*.yaml; do
  grep -Fq '$start-task' "$case_file" || { echo "non-native Codex prompt: $case_file" >&2; exit 1; }
done
printf '{"semantic_ac_key":"runtime_entrypoint_contract","outcome":"pass","workflow_contract":"vulpora.start-task-profile/v1","audit_workflow_contract":"vulpora.start-task/v1","default_profile":"lightweight_or_standard","dialogue_mode":"batched_outside_audit","audit_ambiguity_score_visible":true,"audit_canonical_score_bound":true,"deterministic_profile_selector":true,"audit_fixed_question_limit":false,"audit_fixed_interview_timeout":false,"audit_immutable_spec":true,"post_execute_questions":false,"audit_complete_requires_ac_evidence":true,"audit_clarity_threshold":85,"codex_entrypoints":["$start-task","/skills selection"],"claude_code_entrypoint":"/start-task"}\n'
