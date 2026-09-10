#!/usr/bin/env bash
# Pack, globally install, verify, and uninstall the Codex npm distribution.

set -u
set -o pipefail
set -f
umask 077

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"
MANIFEST="$REPO_ROOT/install/manifest.txt"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/vulpora-npm-test.XXXXXX")" || exit 1
WORK="$(cd "$WORK" && pwd -P)"
NPM_TEMP_PARENT="$(dirname "$WORK")"
pass=0
fail=0

cleanup() {
  cleanup_rc=$?
  if [ "$cleanup_rc" -ne 0 ] || [ "$fail" -ne 0 ]; then
    printf 'npm integration evidence preserved: %s\n' "$WORK" >&2
    return
  fi
  if [ -n "$WORK" ] && [ -d "$WORK" ] && [ ! -L "$WORK" ]; then
    case "$WORK" in "$NPM_TEMP_PARENT"/vulpora-npm-test.*) rm -rf "$WORK" ;; esac
  fi
}
trap cleanup EXIT HUP INT TERM

record() {
  if eval "$2" 2>/dev/null; then
    printf '  ✓ %s\n' "$1"
    pass=$((pass + 1))
  else
    printf '  ✗ %s\n' "$1"
    fail=$((fail + 1))
  fi
}

manifest_count() {
  awk -F'|' -v wanted="$1" '
    /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
    { gsub(/^[[:space:]]+|[[:space:]]+$/, "", $1); if ($1 == wanted) count++ }
    END { print count + 0 }
  ' "$MANIFEST"
}

all_toml_files_parse() {
  if ! command -v python3 >/dev/null 2>&1 \
    || ! python3 -c 'import tomllib' >/dev/null 2>&1; then
    return 0
  fi
  python3 - "$1" <<'PY'
import pathlib
import sys
import tomllib

for path in pathlib.Path(sys.argv[1]).glob("*.toml"):
    with path.open("rb") as source:
        tomllib.load(source)
PY
}

tarball_contents_are_safe() {
  awk '
    /(^|\/)\.git\// || /(^|\/)\.omx\// || /(^|\/)node_modules\// ||
      /private-settings/ || /docs\/security\/raw/ { bad=1 }
    /(^|\/)\.env($|\.)/ && $0 !~ /\/\.env\.example$/ { bad=1 }
    END { exit(bad ? 1 : 0) }
  ' "$contents"
}

command -v npm >/dev/null 2>&1 || { printf '%s\n' 'npm을 찾을 수 없습니다.' >&2; exit 1; }
command -v npx >/dev/null 2>&1 || { printf '%s\n' 'npx를 찾을 수 없습니다.' >&2; exit 1; }

# The source gate is exercised separately by `npm run check`. Ignore lifecycle
# scripts here so this integration test can run against an in-progress diff.
pack_output="$(cd "$REPO_ROOT" && npm pack --ignore-scripts --silent --pack-destination "$WORK" 2>&1)"
pack_rc=$?
tarball_name="$(printf '%s\n' "$pack_output" | tail -1)"
tarball="$WORK/$tarball_name"
expected_agents="$(manifest_count agent)"
expected_skills="$(manifest_count skill)"

record 'release manifest fixes the package inventory at 28 agents and 64 skills' \
  "[ '$expected_agents' = 28 ] && [ '$expected_skills' = 64 ]"
record 'npm pack creates the Vulpora tarball' \
  "[ '$pack_rc' = 0 ] && [ -f '$tarball' ] && [ ! -L '$tarball' ]"
record 'npm package has no environment-mutating install lifecycle' \
  "node -e 'const s=require(process.argv[1]).scripts||{}; process.exit([\"preinstall\",\"install\",\"postinstall\",\"preuninstall\"].some(k => s[k]) ? 1 : 0)' '$REPO_ROOT/package.json' \
   && ! grep -Eq '\"(dependencies|devDependencies|optionalDependencies)\"[[:space:]]*:' '$REPO_ROOT/package.json'"

contents="$WORK/contents.txt"
if [ -f "$tarball" ]; then tar -tf "$tarball" > "$contents"; else : > "$contents"; fi
record 'tarball contains interactive agent, skill, and MCP installer surfaces' \
  "grep -Fqx 'package/vulpora' '$contents' \
   && grep -Fqx 'package/README.md' '$contents' \
   && grep -Fqx 'package/README.ko.md' '$contents' \
   && grep -Fqx 'package/README.en.md' '$contents' \
   && grep -Fqx 'package/install/interactive.sh' '$contents' \
   && grep -Fqx 'package/install/mcp-manager.sh' '$contents' \
   && grep -Fqx 'package/install/mcp-packs.txt' '$contents' \
   && grep -Fqx 'package/install/packs.txt' '$contents' \
   && grep -Fqx 'package/install/project-config.schema.json' '$contents' \
   && grep -Fqx 'package/vulpora.config.example.json' '$contents' \
   && grep -Fqx 'package/NOTICE' '$contents' \
   && grep -Fqx 'package/CONTRIBUTING.md' '$contents' \
   && grep -Fqx 'package/SECURITY.md' '$contents' \
   && grep -Fqx 'package/docs/agent-mcp-design-rules.md' '$contents' \
   && grep -Fqx 'package/.claude-plugin/plugin.json' '$contents' \
   && grep -Fqx 'package/.claude-plugin/marketplace.json' '$contents' \
   && grep -Fqx 'package/agents/notion-domain-researcher.md' '$contents' \
   && grep -Fqx 'package/agents/task-orchestrator.md' '$contents' \
   && grep -Fqx 'package/agents/security-auditor.md' '$contents' \
   && grep -Fqx 'package/agents/agent-eval/reference/kb/skillevaluator-usage.md' '$contents' \
   && grep -Fqx 'package/skills/vulpora-installer/SKILL.md' '$contents' \
   && grep -Fqx 'package/skills/vulpora-init/scripts/update-routing-guidance.js' '$contents' \
   && grep -Fqx 'package/skills/vulpora-init/tests/update-routing-guidance.test.sh' '$contents' \
   && grep -Fqx 'package/skills/vulpora-init/tests/stack-detection.test.js' '$contents' \
   && grep -Fqx 'package/skills/agent-eval/scripts/run-skillevaluator.sh' '$contents' \
   && grep -Fqx 'package/skills/agent-eval/config/skillevaluator-policy.yaml' '$contents' \
   && grep -Fqx 'package/skills/agent-eval/reference/kb/skillevaluator-usage.md' '$contents' \
   && grep -Fqx 'package/skills/agent-eval/tests/skillevaluator-contract.test.sh' '$contents' \
   && grep -Fqx 'package/skills/start-task/SKILL.md' '$contents' \
   && grep -Fqx 'package/skills/start-task/scripts/assess-clarity.js' '$contents' \
   && grep -Fqx 'package/skills/start-task/scripts/score-clarity.js' '$contents' \
   && grep -Fqx 'package/skills/start-task/scripts/select-execution-profile.js' '$contents' \
   && grep -Fqx 'package/skills/start-task/reference/kb/lightweight-path.md' '$contents' \
   && grep -Fqx 'package/skills/e2e-scenario-author/scripts/discover-surfaces.js' '$contents' \
   && grep -Fqx 'package/skills/e2e-scenario-author/scripts/validate-catalog.js' '$contents' \
   && grep -Fqx 'package/skills/e2e-test-workflow/SKILL.md' '$contents' \
   && grep -Fqx 'package/skills/mssql-code-authoring/SKILL.md' '$contents' \
   && grep -Fqx 'package/skills/product-requirements/SKILL.md' '$contents' \
   && grep -Fqx 'package/skills/product-ui-design/SKILL.md' '$contents' \
   && grep -Fqx 'package/skills/visual-artifact-router/SKILL.md' '$contents' \
   && grep -Fqx 'package/skills/pdf-qa/SKILL.md' '$contents' \
   && grep -Fqx 'package/skills/korean-dev-writer/SKILL.md' '$contents' \
   && grep -Fqx 'package/skills/kotlin-spring-review-workflow/SKILL.md' '$contents' \
   && grep -Fqx 'package/skills/java-spring-review-workflow/SKILL.md' '$contents' \
   && grep -Fqx 'package/skills/backend-code-review-workflow/SKILL.md' '$contents' \
   && grep -Fqx 'package/skills/test-authoring/SKILL.md' '$contents' \
   && grep -Fqx 'package/skills/test-quality-review/SKILL.md' '$contents' \
   && grep -Fqx 'package/skills/test-quality-review/tests/contract.test.sh' '$contents' \
   && grep -Fqx 'package/skills/test-refactoring/SKILL.md' '$contents' \
   && grep -Fqx 'package/skills/test-refactoring/tests/contract.test.sh' '$contents' \
   && grep -Fqx 'package/skills/test-quality-refactoring-workflow/SKILL.md' '$contents' \
   && grep -Fqx 'package/skills/test-quality-refactoring-workflow/tests/contract.test.sh' '$contents' \
   && grep -Fqx 'package/install/manifest.txt' '$contents' \
   && [ \"\$(grep -Ec '^package/agents/[^/]+\\.md$' '$contents')\" = '$expected_agents' ] \
   && [ \"\$(grep -Ec '^package/agents/[^/]+\\.codex\\.toml$' '$contents')\" = '$expected_agents' ] \
   && [ \"\$(grep -Ec '^package/skills/[^/]+/SKILL.md$' '$contents')\" = '$expected_skills' ]"
record 'tarball exposes only the Vulpora command without retired product surfaces' \
  "! grep -Eq '^package/(mad-dev|mad-dev-os)(/|$)' '$contents' \
   && ! grep -Fqx 'package/MIGRATION.md' '$contents' \
   && [ \"\$(node -e \"const p=require('$REPO_ROOT/package.json'); console.log(Object.keys(p.bin || {}).sort().join(' '))\")\" = 'vulpora' ]"
record 'tarball excludes repository state, secrets, caches, and research raw data' \
  "tarball_contents_are_safe \
   && ! grep -Eq '(^|/)(__pycache__/|[^/]+\\.py[co]$)' '$contents'"

lifecycle_source="$WORK/lifecycle-source"
lifecycle_destination="$WORK/lifecycle-pack"
lifecycle_stdout="$WORK/lifecycle-pack.stdout"
lifecycle_stderr="$WORK/lifecycle-pack.stderr"
lifecycle_rc=1
mkdir -p "$lifecycle_source" "$lifecycle_destination"
if [ -f "$tarball" ]; then
  tar -xf "$tarball" -C "$lifecycle_source"
  (
    cd "$lifecycle_source/package" \
      && npm pack --silent --pack-destination "$lifecycle_destination"
  ) > "$lifecycle_stdout" 2> "$lifecycle_stderr"
  lifecycle_rc=$?
fi
lifecycle_tarball_name="$(tail -1 "$lifecycle_stdout")"
record 'packaged agent and skill contracts contain no MAD-DEV naming' \
  "[ -d '$lifecycle_source/package/agents' ] \
   && [ -d '$lifecycle_source/package/skills' ] \
   && ! grep -R -Eiq '(^|[^[:alnum:]-])mad-dev([^[:alnum:]-]|$)|mad-dev-os' \
        '$lifecycle_source/package/agents' '$lifecycle_source/package/skills'"
record 'prepack keeps npm pack stdout usable as one tarball path' \
  "[ '$lifecycle_rc' = 0 ] \
   && [ \"\$(wc -l < '$lifecycle_stdout' | tr -d ' ')\" = 1 ] \
   && [ -f '$lifecycle_destination/$lifecycle_tarball_name' ] \
   && grep -Fq 'npm package source OK:' '$lifecycle_stderr'"

npx_home="$WORK/npx-home"
npx_cache="$WORK/npx-cache"
npx_version="$WORK/npx-version.txt"
mkdir -p "$npx_home" "$npx_cache"
if [ -f "$tarball" ]; then
  HOME="$npx_home" npm_config_cache="$npx_cache" npm_config_global=false \
    npx --yes --package="$tarball" -- vulpora version > "$npx_version" 2>/dev/null
  npx_rc=$?
else
  npx_rc=1
fi
repo_version="$(tr -d '\r\n' < "$REPO_ROOT/VERSION")"
record 'non-global npx runs the CLI without preinstalling the user catalog' \
  "[ '$npx_rc' = 0 ] \
   && grep -Fqx 'vulpora $repo_version' '$npx_version' \
   && [ ! -e '$npx_home/.codex' ] \
   && [ ! -e '$npx_home/.claude' ]"

npx_mcp_home="$WORK/npx-mcp-home"
npx_mcp_cache="$WORK/npx-mcp-cache"
npx_mcp_bin="$WORK/npx-mcp-bin"
npx_mcp_state="$WORK/npx-mcp-state"
npx_mcp_log="$WORK/npx-mcp.log"
mkdir -p "$npx_mcp_home" "$npx_mcp_cache" "$npx_mcp_bin" "$npx_mcp_state"
cat > "$npx_mcp_bin/claude" <<'FAKE_CLAUDE'
#!/bin/bash
set -eu
[ "$1" = mcp ] || exit 2
shift
action="$1"
shift
printf '%s\t%s\n' "$action" "$*" >> "$FAKE_NPX_MCP_STATE/calls.log"
case "$action" in
  get)
    [ -f "$FAKE_NPX_MCP_STATE/url" ] || exit 1
    printf 'vulpora-notion:\n  Scope: User config\n  Status: ✓ Connected\n  Type: http\n  URL: %s\n' "$(cat "$FAKE_NPX_MCP_STATE/url")"
    ;;
  add)
    while [ "$#" -ge 2 ] && { [ "$1" = --transport ] || [ "$1" = --scope ]; }; do shift 2; done
    [ "$1" = vulpora-notion ] || exit 2
    printf '%s\n' "$2" > "$FAKE_NPX_MCP_STATE/url"
    ;;
  *) exit 2 ;;
esac
FAKE_CLAUDE
chmod +x "$npx_mcp_bin/claude"
if [ -f "$tarball" ]; then
  HOME="$npx_mcp_home" FAKE_NPX_MCP_STATE="$npx_mcp_state" \
    npm_config_cache="$npx_mcp_cache" npm_config_global=false PATH="$npx_mcp_bin:$PATH" \
    npx --yes --package="$tarball" -- vulpora mcp install \
      --runtime claude-code --scope user notion > "$npx_mcp_log" 2>&1
  npx_mcp_rc=$?
else
  npx_mcp_rc=1
fi
record 'non-global npx executes an explicit Claude MCP install subcommand' \
  "[ '$npx_mcp_rc' = 0 ] \
   && grep -Fq 'installed: vulpora-notion' '$npx_mcp_log' \
   && grep -Fq 'auth_deferred: vulpora-notion' '$npx_mcp_log' \
   && grep -Fq $'add\t--transport http --scope user vulpora-notion https://mcp.notion.com/mcp' \
        '$npx_mcp_state/calls.log'"

npx_interactive_home="$WORK/npx-interactive-home"
npx_interactive_cache="$WORK/npx-interactive-cache"
npx_interactive_state="$WORK/npx-interactive-state"
npx_interactive_bin="$WORK/npx-interactive-bin"
npx_interactive_log="$WORK/npx-interactive.log"
mkdir -p "$npx_interactive_home" "$npx_interactive_cache" "$npx_interactive_state" \
  "$npx_interactive_bin"
ln -s "$(type -P true)" "$npx_interactive_bin/claude"
if [ -f "$tarball" ]; then
  printf '1\n1\n5\n1\n1\ny\n' \
    | HOME="$npx_interactive_home" \
      VULPORA_STATE_HOME="$npx_interactive_state" VULPORA_UI=plain \
      VULPORA_RUNTIME_PATH="$npx_interactive_bin" \
      npm_config_cache="$npx_interactive_cache" npm_config_global=false \
      PATH="$npx_interactive_bin:$PATH" \
      npx --yes --package="$tarball" -- vulpora > "$npx_interactive_log" 2>&1
  npx_interactive_rc=$?
else
  npx_interactive_rc=1
fi
record 'one-line npx entry opens the guided installer and applies its selection' \
  "[ '$npx_interactive_rc' = 0 ] \
   && [ \"\$(find '$npx_interactive_home/.claude/agents' -maxdepth 1 -type f -name '*.md' | wc -l | tr -d ' ')\" = '$expected_agents' ] \
   && [ \"\$(find '$npx_interactive_home/.claude/skills' -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')\" = '$expected_skills' ] \
   && [ -f '$npx_interactive_home/.vulpora/receipts/v1/claude-code.tsv' ] \
   && [ ! -e '$npx_interactive_home/.codex' ] \
   && grep -Fq '변경 미리보기' '$npx_interactive_log' \
   && grep -Fq '설치/업데이트가 완료됐습니다' '$npx_interactive_log'"

prefix="$WORK/prefix"
home="$WORK/home"
state="$WORK/state"
mkdir -p "$prefix" "$home" "$state"

install_output="$WORK/npm-install.log"
if [ -f "$tarball" ]; then
  HOME="$home" VULPORA_STATE_HOME="$state" \
    npm install --global --prefix "$prefix" "$tarball" > "$install_output" 2>&1
  install_rc=$?
else
  install_rc=1
fi

cli="$prefix/bin/vulpora"
package_root="$prefix/lib/node_modules/vulpora"
record 'global npm install exposes only the Vulpora command' \
  "[ '$install_rc' = 0 ] && [ -x '$cli' ] && [ \"\$(find '$prefix/bin' -maxdepth 1 -type l | wc -l | tr -d ' ')\" = 1 ] \
   && [ -d '$package_root' ] \
   && [ \"\$('$cli' version)\" = 'vulpora $repo_version' ]"
record 'global npm install is inert until setup is explicitly requested' \
  "[ ! -e '$home/.codex' ] \
   && [ ! -e '$home/.claude' ] \
   && [ ! -e '$home/.agents' ] \
   && [ ! -e '$home/.vulpora' ]"

explicit_setup_log="$WORK/explicit-setup.log"
if [ -x "$cli" ]; then
  HOME="$home" VULPORA_STATE_HOME="$state" \
    "$cli" setup --runtime codex --scope user all-agents all-skills \
      > "$explicit_setup_log" 2>&1
  explicit_setup_rc=$?
else
  explicit_setup_rc=1
fi
record "explicit setup creates $expected_agents Codex agents and $expected_skills skills" \
  "[ '$explicit_setup_rc' = 0 ] \
   && [ \"\$(find '$home/.codex/agents' -maxdepth 1 -type f -name '*.toml' | wc -l | tr -d ' ')\" = '$expected_agents' ] \
   && [ \"\$(find '$home/.codex/agents' -maxdepth 1 -type f -name '*.md' | wc -l | tr -d ' ')\" = '$expected_agents' ] \
   && [ \"\$(find '$home/.agents/skills' -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')\" = '$expected_skills' ]"
record 'explicit setup exposes the workflow orchestrators and their required agent catalog' \
  "[ -f '$home/.codex/agents/task-orchestrator.md' ] \
   && [ -f '$home/.codex/agents/security-auditor.md' ] \
   && [ -f '$home/.agents/skills/start-task/SKILL.md' ] \
   && [ -f '$home/.agents/skills/product-requirements/SKILL.md' ] \
   && [ -f '$home/.agents/skills/product-ui-design/SKILL.md' ] \
   && [ -f '$home/.agents/skills/visual-artifact-router/SKILL.md' ] \
   && [ -f '$home/.agents/skills/pdf-qa/SKILL.md' ] \
   && [ -f '$home/.agents/skills/kotlin-spring-review-workflow/SKILL.md' ] \
   && [ -f '$home/.agents/skills/java-spring-review-workflow/SKILL.md' ] \
   && [ -f '$home/.agents/skills/backend-code-review-workflow/SKILL.md' ] \
   && [ -f '$home/.agents/skills/korean-dev-writer/SKILL.md' ] \
   && [ -f '$home/.agents/skills/test-quality-review/SKILL.md' ] \
   && [ -f '$home/.agents/skills/test-refactoring/SKILL.md' ] \
   && [ -f '$home/.agents/skills/test-quality-refactoring-workflow/SKILL.md' ]"
record 'installed Codex adapters contain canonical definitions, not runtime tombstones' \
  "grep -Fq 'Vulpora canonical definition for postgres-dba.' '$home/.codex/agents/postgres-dba.toml' \
   && ! grep -R -Fq 'AGENT_RUNTIME_REQUIRED:' '$home/.codex/agents/' \
   && all_toml_files_parse '$home/.codex/agents'"
record 'installed npm catalog passes source verification' \
  "HOME='$home' VULPORA_STATE_HOME='$state' \
     bash '$package_root/install/install.sh' -t '$home' --runtime codex \
       --verify all-agents all-skills | grep -Fq '모든 자산과 의존성'"

version_file="$WORK/version.txt"
list_file="$WORK/list.txt"
if [ -x "$cli" ]; then
  "$cli" version > "$version_file" 2>/dev/null || true
  "$cli" list > "$list_file" 2>/dev/null || true
else
  : > "$version_file"
  : > "$list_file"
fi
record 'npm executable resolves package-relative version and catalog' \
  "grep -Fqx 'vulpora $repo_version' '$version_file' \
   && grep -Fq 'notion-domain-researcher' '$list_file' \
   && grep -Fq 'vulpora-installer' '$list_file' \
   && grep -Fq 'task-orchestrator' '$list_file' \
   && grep -Fq 'start-task' '$list_file' \
   && grep -Fq 'test-quality-review' '$list_file' \
   && grep -Fq 'test-refactoring' '$list_file' \
   && grep -Fq 'test-quality-refactoring-workflow' '$list_file' \
   && grep -Fq 'kotlin-spring-review-workflow' '$list_file' \
   && grep -Fq 'java-spring-review-workflow' '$list_file' \
   && ! grep -Eq '(^|[^[:alnum:]-])mad-dev([^[:alnum:]-]|$)' '$list_file'"
record 'explicit setup writes runtime ownership receipts' \
  "[ -f '$home/.vulpora/receipts/v1/codex.tsv' ] \
   && [ -n \"\$(find '$state/receipts/v1/targets' -type f -name target.path -print -quit)\" ]"

explicit_uninstall_log="$WORK/explicit-uninstall.log"
HOME="$home" VULPORA_STATE_HOME="$state" \
  "$cli" uninstall --runtime codex --scope user > "$explicit_uninstall_log" 2>&1
explicit_uninstall_rc=$?
record 'explicit uninstall removes receipt-owned catalog assets' \
  "[ '$explicit_uninstall_rc' = 0 ] \
   && [ ! -e '$home/.vulpora/receipts/v1/codex.tsv' ] \
   && [ -z \"\$(find '$home/.codex/agents' -type f -print -quit 2>/dev/null)\" ] \
   && [ -z \"\$(find '$home/.agents/skills' -type f -print -quit 2>/dev/null)\" ]"

HOME="$home" VULPORA_STATE_HOME="$state" \
  npm uninstall --global --prefix "$prefix" vulpora > "$WORK/npm-uninstall.log" 2>&1
uninstall_rc=$?
record 'npm uninstall removes the CLI package' \
  "[ '$uninstall_rc' = 0 ] && [ ! -e '$cli' ] \
   && [ ! -e '$package_root' ]"
record 'npm uninstall does not mutate user runtime directories' \
  "[ -d '$home/.codex' ] && [ -d '$home/.agents' ]"
record 'test workspace contains no leaked transaction directory' \
  "[ -z \"\$(find '$WORK' -type d \\( -name '.vulpora-replace.*' -o -name '.vulpora-remove.*' \\) -print -quit)\" ]"

printf '결과: PASS=%s FAIL=%s\n' "$pass" "$fail"
[ "$fail" = 0 ]
