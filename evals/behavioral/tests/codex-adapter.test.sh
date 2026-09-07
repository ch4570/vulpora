#!/usr/bin/env bash
set -eu
DIR="$(cd "$(dirname "$0")/.." && pwd -P)"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/vulpora-codex-adapter.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT HUP INT TERM
mkdir -p "$WORK/bin" "$WORK/fixture"
printf '%s\n' '#!/usr/bin/env bash' \
  'capture_dir="$(cd "$(dirname "$0")/.." && pwd -P)"' 'if [ "${1:-}" = --version ]; then echo "codex-cli 0.153.2"; exit 0; fi' 'printf "%s\n" "$@" > "$capture_dir/args.txt"' 'out=""' 'while [ "$#" -gt 0 ]; do' \
  '  if [ "$1" = --output-last-message ]; then out="$2"; shift 2; continue; fi' \
  '  shift' 'done' \
  'printf "%s\n" "$HOME" "${CODEX_HOME:-}" "${VULPORA_HOST_SECRET_SENTINEL:-unset}" > "$capture_dir/env.txt"' \
  'cat > "$capture_dir/prompt.txt"' \
  'printf "%s\n" "final adapter response" > "$out"' \
  'printf "%s\n" "{\"type\":\"item.completed\",\"item\":{\"type\":\"command_execution\",\"command\":\"pwd\"}}"' \
  'printf "%s\n" "{\"type\":\"turn.completed\",\"usage\":{\"input_tokens\":10,\"cached_input_tokens\":7,\"output_tokens\":2,\"reasoning_output_tokens\":3}}"' > "$WORK/bin/codex"
chmod +x "$WORK/bin/codex"
capture="$WORK/prompt.txt"; args_capture="$WORK/args.txt"; env_capture="$WORK/env.txt"; metrics="$WORK/metrics.yaml"
printf '%s\n' \
  'prompt: |' '  Verify existing evidence.' 'expected:' '  required_artifacts:' \
  '    - "file_existing:existing.md"' "    - 'dir_existing:docs'" '    - "file:out.md"' "    - 'dir:generated'" > "$WORK/quoted-artifacts.yaml"
PATH="$WORK/bin:$PATH" VULPORA_HOST_SECRET_SENTINEL=host-secret-must-not-reach-codex \
  VULPORA_PROMPT_FILE="$WORK/quoted-artifacts.yaml" \
  VULPORA_FIXTURE_REPO="$WORK/fixture" VULPORA_ASSET=agent-evaluator VULPORA_CASE_ID=agent-evaluator.evidence-backed-scorecard.v1 \
  VULPORA_METRICS_FILE="$metrics" VULPORA_CODEX_MODEL=gpt-5.6-terra bash "$DIR/adapters/codex-local-adapter.sh" > "$WORK/stdout.txt"
grep -Fqx 'final adapter response' "$WORK/stdout.txt"
grep -Fqx 'Required artifact deliverables:' "$capture"
grep -Fqx -- '- Cite existing fixture file: existing.md' "$capture"
grep -Fqx -- '- Cite existing fixture directory: docs' "$capture"
grep -Fqx -- '- Required fixture deliverable: file:out.md' "$capture"
grep -Fqx -- '- Required fixture deliverable: dir:generated' "$capture"
grep -Fqx -- '--ephemeral' "$args_capture"
grep -Fqx -- '--ignore-user-config' "$args_capture"
grep -Fqx -- '--strict-config' "$args_capture"
if grep -Fqx -- '--sandbox' "$args_capture"; then echo 'legacy sandbox unexpectedly overrides permission profile' >&2; exit 1; fi
grep -Fqx 'default_permissions="vulpora_eval_write"' "$args_capture"
grep -Fqx 'permissions.vulpora_eval_write.network.enabled=false' "$args_capture"
grep -Fqx 'shell_environment_policy.inherit="none"' "$args_capture"
grep -Fqx -- 'approval_policy="never"' "$args_capture"
grep -Fqx 'web_search="disabled"' "$args_capture"
grep -Fqx 'apps._default.enabled=false' "$args_capture"
grep -Fqx 'features.skill_mcp_dependency_install=false' "$args_capture"
grep -Fq 'sandbox_workspace_write.network_access=false' "$capture" && { echo 'adapter configuration leaked into prompt' >&2; exit 1; } || true
grep -Fqx 'forbidden_action_hits: 0' "$metrics"
grep -Fqx 'guardrail_trips: 0' "$metrics"
grep -Fqx 'tool_calls: 1' "$metrics"
grep -Fqx 'command_count: 1' "$metrics"
grep -Fqx 'estimated_tokens_measurement_kind: byte_quarter_proxy' "$metrics"
node - "$metrics.measurements.json" "$capture" <<'NODE'
const fs = require('node:fs');
const assert = require('node:assert/strict');
const measured = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
assert.equal(measured.usage.input_tokens, 10);
assert.equal(measured.usage.cached_input_tokens, 7);
assert.equal(measured.usage.output_tokens, 2);
assert.equal(measured.usage.reasoning_tokens, 3);
assert.equal(measured.usage.input_output_tokens, 12);
assert.equal(measured.prompt_proxy.estimated_tokens, Math.ceil(fs.statSync(process.argv[3]).size / 4));
NODE
# The adapter process needs HOME/CODEX_HOME only for CLI auth; the profile's
# shell policy, verified with the real sentinel probe, keeps them out of tools.
grep -Fqx unset "$env_capture"
printf '%s\n' 'codex local adapter: PASS'
