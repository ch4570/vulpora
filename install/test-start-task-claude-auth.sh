#!/usr/bin/env bash
set -eu
DIR="$(cd "$(dirname "$0")" && pwd -P)"
ROOT="$(cd "$DIR/.." && pwd -P)"
RUNNER="$ROOT/evals/behavioral/adapters/run-claude-isolated.js"
ADAPTER="$ROOT/evals/behavioral/adapters/run-start-task-native.sh"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/vulpora-claude-auth.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT HUP INT TERM
mkdir -p "$WORK/bin"

cat >"$WORK/bin/claude" <<'SH'
#!/usr/bin/env bash
[ -n "${ANTHROPIC_API_KEY:-}" ] || exit 92
[ -z "${CLAUDE_CODE_OAUTH_TOKEN:-}" ] || exit 91
if [ "${FAKE_CLAUDE_MODE:-}" = oauth_denied ]; then
  printf '%s\n' \
    '{"type":"assistant","error":"oauth_org_not_allowed"}' \
    '{"type":"result","api_error_status":403}'
  exit 1
fi
printf '{"auth_mode":"api_key"}\n'
SH
chmod +x "$WORK/bin/claude"

PATH="$WORK/bin:$PATH" \
  ANTHROPIC_API_KEY='test-api-key-not-a-secret' \
  CLAUDE_CODE_OAUTH_TOKEN='blocked-oauth-not-a-secret' \
  node "$RUNNER" "$WORK/home" --version >"$WORK/runner.out"
grep -Fq '"auth_mode":"api_key"' "$WORK/runner.out"

set +e
result="$(PATH="$WORK/bin:$PATH" \
  ANTHROPIC_API_KEY='test-api-key-not-a-secret' \
  CLAUDE_CODE_OAUTH_TOKEN='blocked-oauth-not-a-secret' \
  FAKE_CLAUDE_MODE=oauth_denied \
  bash "$ADAPTER" --runtime claude-code --task x --output "$WORK/adapter-output" \
    --run-id run-claude-auth-test --runtime-instance-id instance-claude-auth-test \
    --deadline-seconds 30)"
rc=$?
set -e
[ "$rc" -ne 0 ]
node - "$result" <<'NODE'
const value=JSON.parse(process.argv[2]);
if(value.outcome!=='environment_unavailable'||value.execution!=='attempted'||value.reason!=='claude_oauth_org_not_allowed'||value.api_error_code!=='oauth_org_not_allowed'||value.api_error_status!==403)process.exit(1);
NODE
[ ! -e "$WORK/adapter-output" ]
printf '{"semantic_ac_key":"claude_auth_and_failure_classification","outcome":"pass","api_key_preferred":true,"oauth_org_denial_classified":true,"credentials_redacted":true}\n'
