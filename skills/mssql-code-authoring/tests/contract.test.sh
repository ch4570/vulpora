#!/usr/bin/env bash
set -eu
set -o pipefail

DIR="$(cd "$(dirname "$0")" && pwd -P)"
SKILL_ROOT="$(cd "$DIR/.." && pwd -P)"
REPO_ROOT="$(cd "$DIR/../../.." && pwd -P)"
SKILL="$SKILL_ROOT/SKILL.md"

for kb in \
  legacy-environment-profile \
  query-construction \
  transactions-and-concurrency \
  schema-and-migration \
  performance-and-observability \
  security-and-legacy; do
  test -f "$SKILL_ROOT/reference/kb/$kb.md"
  grep -Fq "($kb.md)" "$SKILL_ROOT/reference/kb/INDEX.md"
done

for rule in MSSQL-1 MSSQL-3 MSSQL-5 MSSQL-8 MSSQL-9 MSSQL-10 MSSQL-11; do
  grep -Fq "**$rule " "$SKILL"
done

grep -Fq 'compatibility_level' "$SKILL_ROOT/reference/kb/legacy-environment-profile.md"
grep -Fq 'sys.database_query_store_options' "$SKILL_ROOT/reference/kb/legacy-environment-profile.md"
grep -Fq 'sp_executesql' "$SKILL_ROOT/reference/kb/query-construction.md"
grep -Fq 'QUOTENAME' "$SKILL_ROOT/reference/kb/query-construction.md"
grep -Fq 'Do not add `NOLOCK`' "$SKILL_ROOT/reference/kb/query-construction.md"
grep -Fq '`XACT_STATE()` value of `-1`' "$SKILL_ROOT/reference/kb/transactions-and-concurrency.md"
grep -Fq '`ONLINE`, `RESUMABLE`' "$SKILL_ROOT/reference/kb/schema-and-migration.md"
grep -Fq 'Parameter Sensitive Plan optimization' "$SKILL_ROOT/reference/kb/performance-and-observability.md"
grep -Fq '`db_owner`, `securityadmin`, or `sysadmin`' "$SKILL_ROOT/reference/kb/security-and-legacy.md"

urls="$(rg -o 'https?://[^)[:space:]]+' "$SKILL_ROOT/reference" | sed 's/^[^:]*://')"
test -n "$urls"
if printf '%s\n' "$urls" | grep -Ev '^https://learn\.microsoft\.com/' >/dev/null; then
  echo 'non-Microsoft source found in mssql KB' >&2
  exit 1
fi

grep -Fq 'mssql-code-authoring' "$REPO_ROOT/skills/code-authoring-router/SKILL.md"
grep -Fq 'mssql-code-authoring' "$REPO_ROOT/skills/vulpora-init/scripts/update-routing-guidance.js"
grep -Fq 'display_name: "Microsoft SQL Server Authoring"' "$SKILL_ROOT/agents/openai.yaml"
grep -Fq 'Use $mssql-code-authoring' "$SKILL_ROOT/agents/openai.yaml"

if rg -n '\[(TODO|todo):|\[TODO' "$SKILL" "$SKILL_ROOT/reference" "$SKILL_ROOT/agents/openai.yaml" >/dev/null; then
  echo 'mssql-code-authoring contains scaffold placeholders' >&2
  exit 1
fi

printf '{"outcome":"pass","skill":"mssql-code-authoring","official_sources_only":true,"legacy_profile_required":true,"kb_topics":6}\n'
