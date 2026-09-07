#!/bin/bash
# Validate the supported native distribution surfaces:
# - Codex: global npm package with explicit, receipt-owned catalog setup
# - Claude Code: repository-root marketplace plugin

set -u
set -f
umask 077

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"
MANIFEST="$REPO_ROOT/install/manifest.txt"
runtime=all

usage() { printf '%s\n' 'Usage: test-plugin-distribution.sh [--runtime codex|claude-code|all]'; }
while [ "$#" -gt 0 ]; do
  case "$1" in
    --runtime) [ "$#" -ge 2 ] || { usage >&2; exit 2; }; runtime="$2"; shift 2 ;;
    --runtime=*) runtime="${1#--runtime=}"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; exit 2 ;;
  esac
done
case "$runtime" in codex|claude-code|all) ;; *) usage >&2; exit 2 ;; esac

WORK="$(mktemp -d "${TMPDIR:-/tmp}/vulpora-plugin-test.XXXXXX")" || exit 1
trap 'rm -rf "$WORK"' EXIT HUP INT TERM
pass=0
fail=0
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

repo_semver="$(awk -F. 'NF == 4 { print $1 "." $2 "." $3; exit }' "$REPO_ROOT/VERSION")"
expected_agents="$(manifest_count agent)"
expected_skills="$(manifest_count skill)"

record 'release manifest fixes the plugin inventory at 28 agents and 62 skills' \
  "[ '$expected_agents' = 28 ] && [ '$expected_skills' = 62 ]"
record 'release metadata points Claude at the complete repository-root plugin' \
  "[ -n '$repo_semver' ] \
   && grep -Fq '\"source\": \"./\"' '$REPO_ROOT/.claude-plugin/marketplace.json' \
   && grep -Fq '\"version\": \"$repo_semver\"' '$REPO_ROOT/.claude-plugin/plugin.json' \
   && grep -Fq '\"version\": \"$repo_semver\"' '$REPO_ROOT/.claude-plugin/marketplace.json'"
record 'root catalog contains every manifest agent and skill' \
  "[ \"\$(find '$REPO_ROOT/agents' -maxdepth 1 -type f -name '*.md' | wc -l | tr -d ' ')\" = '$expected_agents' ] \
   && [ \"\$(find '$REPO_ROOT/skills' -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')\" = '$expected_skills' ] \
   && [ -f '$REPO_ROOT/agents/task-orchestrator.md' ] \
   && [ -f '$REPO_ROOT/agents/security-auditor.md' ] \
   && [ -f '$REPO_ROOT/skills/start-task/SKILL.md' ] \
   && [ -f '$REPO_ROOT/skills/e2e-test-workflow/SKILL.md' ] \
   && [ -f '$REPO_ROOT/skills/mssql-code-authoring/SKILL.md' ] \
   && [ -x '$REPO_ROOT/skills/vulpora-init/scripts/update-routing-guidance.js' ] \
   && [ -f '$REPO_ROOT/skills/product-requirements/SKILL.md' ] \
   && [ -f '$REPO_ROOT/skills/product-ui-design/SKILL.md' ] \
   && [ -f '$REPO_ROOT/skills/visual-artifact-router/SKILL.md' ] \
   && [ -f '$REPO_ROOT/skills/pdf-qa/SKILL.md' ] \
   && [ -f '$REPO_ROOT/skills/korean-dev-writer/SKILL.md' ] \
   && [ -f '$REPO_ROOT/skills/kotlin-spring-review-workflow/SKILL.md' ] \
   && [ -f '$REPO_ROOT/skills/java-spring-review-workflow/SKILL.md' ] \
   && [ -f '$REPO_ROOT/skills/backend-code-review-workflow/SKILL.md' ] \
   && [ -f '$REPO_ROOT/skills/test-quality-review/SKILL.md' ] \
   && [ -f '$REPO_ROOT/skills/test-refactoring/SKILL.md' ] \
   && [ -f '$REPO_ROOT/skills/test-quality-refactoring-workflow/SKILL.md' ]"
record 'plugin distribution contains no MAD-DEV product surface' \
  "[ ! -e '$REPO_ROOT/mad-dev' ] \
   && [ ! -e '$REPO_ROOT/mad-dev-os' ] \
   && [ ! -e '$REPO_ROOT/MIGRATION.md' ] \
   && ! grep -Fq '\"mad-dev\"' '$REPO_ROOT/.claude-plugin/plugin.json' \
   && ! grep -Fq '\"mad-dev\"' '$REPO_ROOT/.claude-plugin/marketplace.json' \
   && ! grep -R -Eiq '(^|[^[:alnum:]-])mad-dev([^[:alnum:]-]|$)|mad-dev-os' \
        '$REPO_ROOT/agents' '$REPO_ROOT/skills'"
record 'obsolete split plugin packages are absent' \
  "[ ! -e '$REPO_ROOT/codex-plugin/.codex-plugin/plugin.json' ] \
   && [ ! -e '$REPO_ROOT/claude-plugin/.claude-plugin/plugin.json' ] \
   && [ ! -e '$REPO_ROOT/.agents/plugins/marketplace.json' ]"

if [ "$runtime" = codex ] || [ "$runtime" = all ]; then
  record 'npm installation is inert and catalog setup remains explicit' \
    "node -e 'const s=require(process.argv[1]).scripts||{}; process.exit([\"preinstall\",\"install\",\"postinstall\",\"preuninstall\"].some(k => s[k]) ? 1 : 0)' '$REPO_ROOT/package.json' \
     && grep -Fq 'vulpora setup' '$REPO_ROOT/README.md'"
  record 'Codex package scripts and native adapters are structurally valid' \
    "bash -n '$REPO_ROOT/vulpora' '$REPO_ROOT/install/install.sh' \
       '$REPO_ROOT/install/npm-postinstall.sh' '$REPO_ROOT/install/npm-preuninstall.sh' \
     && [ \"\$(find '$REPO_ROOT/agents' -maxdepth 1 -type f -name '*.codex.toml' | wc -l | tr -d ' ')\" = '$expected_agents' ]"
fi

if [ "$runtime" = claude-code ] || [ "$runtime" = all ]; then
  if command -v claude >/dev/null 2>&1; then
    claude_home="$WORK/claude-home"
    claude_config="$WORK/claude-config"
    claude_source="$WORK/claude-source"
    mkdir -p "$claude_home" "$claude_config" "$claude_source"
    cp -R "$REPO_ROOT/.claude-plugin" "$REPO_ROOT/agents" "$REPO_ROOT/skills" "$claude_source/"
    record 'Claude validates the complete repository-root plugin' \
      "HOME='$claude_home' CLAUDE_CONFIG_DIR='$claude_config' claude plugin validate '$claude_source' \
         | grep -Fq 'Validation passed'"
    if HOME="$claude_home" CLAUDE_CONFIG_DIR="$claude_config" \
        claude plugin marketplace add "$claude_source" --scope user >/dev/null 2>&1 \
      && HOME="$claude_home" CLAUDE_CONFIG_DIR="$claude_config" \
        claude plugin install vulpora@vulpora --scope user >/dev/null 2>&1; then
      record 'Claude installs the Vulpora marketplace plugin' \
        "HOME='$claude_home' CLAUDE_CONFIG_DIR='$claude_config' claude plugin list --json \
           | grep -Fq '\"id\": \"vulpora@vulpora\"'"
      record "Claude inventory exposes Agents($expected_agents) and Skills($expected_skills)" \
        "details=\$(HOME='$claude_home' CLAUDE_CONFIG_DIR='$claude_config' \
           claude plugin details vulpora@vulpora) \
         && printf '%s\n' \"\$details\" | grep -Fq 'Agents ($expected_agents)' \
         && printf '%s\n' \"\$details\" | grep -Fq 'Skills ($expected_skills)' \
         && printf '%s\n' \"\$details\" | grep -Fq 'Hooks (0)' \
         && printf '%s\n' \"\$details\" | grep -Fq 'MCP servers (0)'"
      record 'Claude cache contains agent and skill assets' \
        "find '$claude_config/plugins/cache/vulpora/vulpora' -type f \
             -path '*/agents/postgres-dba.md' -print -quit | grep -q . \
         && find '$claude_config/plugins/cache/vulpora/vulpora' -type f \
             -path '*/skills/test-authoring/SKILL.md' -print -quit | grep -q . \
         && find '$claude_config/plugins/cache/vulpora/vulpora' -type f \
             -path '*/skills/test-quality-review/SKILL.md' -print -quit | grep -q . \
         && find '$claude_config/plugins/cache/vulpora/vulpora' -type f \
             -path '*/skills/test-refactoring/SKILL.md' -print -quit | grep -q . \
         && find '$claude_config/plugins/cache/vulpora/vulpora' -type f \
             -path '*/skills/test-quality-refactoring-workflow/SKILL.md' -print -quit | grep -q . \
         && find '$claude_config/plugins/cache/vulpora/vulpora' -type f \
             -path '*/agents/task-orchestrator.md' -print -quit | grep -q . \
         && find '$claude_config/plugins/cache/vulpora/vulpora' -type f \
             -path '*/skills/start-task/SKILL.md' -print -quit | grep -q . \
         && find '$claude_config/plugins/cache/vulpora/vulpora' -type f \
             -path '*/skills/e2e-test-workflow/SKILL.md' -print -quit | grep -q . \
         && find '$claude_config/plugins/cache/vulpora/vulpora' -type f \
             -path '*/skills/mssql-code-authoring/SKILL.md' -print -quit | grep -q . \
         && find '$claude_config/plugins/cache/vulpora/vulpora' -type f \
             -path '*/skills/product-requirements/SKILL.md' -print -quit | grep -q . \
         && find '$claude_config/plugins/cache/vulpora/vulpora' -type f \
             -path '*/skills/visual-artifact-router/SKILL.md' -print -quit | grep -q . \
         && find '$claude_config/plugins/cache/vulpora/vulpora' -type f \
             -path '*/skills/kotlin-spring-review-workflow/SKILL.md' -print -quit | grep -q . \
         && find '$claude_config/plugins/cache/vulpora/vulpora' -type f \
             -path '*/skills/java-spring-review-workflow/SKILL.md' -print -quit | grep -q ."
      record 'Claude removes the plugin registration' \
        "HOME='$claude_home' CLAUDE_CONFIG_DIR='$claude_config' \
           claude plugin uninstall vulpora@vulpora --scope user >/dev/null \
         && [ \"\$(HOME='$claude_home' CLAUDE_CONFIG_DIR='$claude_config' claude plugin list --json \
              | grep -Fc '\"id\": \"vulpora@vulpora\"')\" = 0 ]"
      record 'Claude removes the user marketplace declaration' \
        "HOME='$claude_home' CLAUDE_CONFIG_DIR='$claude_config' \
           claude plugin marketplace remove vulpora --scope user >/dev/null"
    else
      record 'Claude installs the Vulpora marketplace plugin' false
    fi

    claude_project="$WORK/claude-project"
    mkdir -p "$claude_project"
    if (
      cd "$claude_project" \
        && HOME="$claude_home" CLAUDE_CONFIG_DIR="$claude_config" \
          claude plugin marketplace add "$claude_source" --scope project >/dev/null 2>&1 \
        && HOME="$claude_home" CLAUDE_CONFIG_DIR="$claude_config" \
          claude plugin install vulpora@vulpora --scope project >/dev/null 2>&1
    ); then
      record 'Claude installs the Vulpora plugin at project scope' \
        "cd '$claude_project' \
         && HOME='$claude_home' CLAUDE_CONFIG_DIR='$claude_config' claude plugin list --json \
              | grep -Fq '\"id\": \"vulpora@vulpora\"'"
      record 'Claude removes the project plugin and marketplace declaration' \
        "cd '$claude_project' \
         && HOME='$claude_home' CLAUDE_CONFIG_DIR='$claude_config' \
              claude plugin uninstall vulpora@vulpora --scope project >/dev/null \
         && HOME='$claude_home' CLAUDE_CONFIG_DIR='$claude_config' \
              claude plugin marketplace remove vulpora --scope project >/dev/null \
         && [ \"\$(HOME='$claude_home' CLAUDE_CONFIG_DIR='$claude_config' claude plugin list --json \
              | grep -Fc '\"id\": \"vulpora@vulpora\"')\" = 0 ]"
    else
      record 'Claude installs the Vulpora plugin at project scope' false
    fi
  else
    printf '%s\n' '  - Claude Code CLI 없음: marketplace install test skipped'
  fi
fi

printf '결과: PASS=%s FAIL=%s\n' "$pass" "$fail"
[ "$fail" = 0 ]
