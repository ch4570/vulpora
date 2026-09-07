#!/usr/bin/env bash
set -eu
set -f
umask 077

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
UPDATER="$SCRIPT_DIR/../scripts/update-routing-guidance.js"
CONFIG_SCHEMA="$SCRIPT_DIR/../../../install/project-config.schema.json"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/vulpora-init-test.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT HUP INT TERM

mkdir -p "$WORK/repo/src/main/kotlin/example" "$WORK/repo/src/main/resources/db/migration" "$WORK/repo/search"
printf '# Team instructions\n\nKeep this sentence.\n' > "$WORK/repo/AGENTS.md"
printf 'plugins { kotlin("jvm") version "2.2.0"; id("org.springframework.boot") version "3.5.0" }\ndependencies { runtimeOnly("org.postgresql:postgresql") ; implementation("org.opensearch.client:opensearch-java") }\n' > "$WORK/repo/build.gradle.kts"
printf 'package example\nimport org.springframework.stereotype.Service\n@Service class OrderService\n' > "$WORK/repo/src/main/kotlin/example/OrderService.kt"
printf 'create table orders (id bigint generated always as identity, metadata jsonb);\n' > "$WORK/repo/src/main/resources/db/migration/V1__orders.sql"
printf '{"mappings":{"properties":{"title":{"type":"text"}}}}\n' > "$WORK/repo/search/order-mapping.json"
printf '<Project><ItemGroup><PackageReference Include="Microsoft.Data.SqlClient" Version="6.1.1" /></ItemGroup></Project>\n' > "$WORK/repo/legacy.csproj"

node "$UPDATER" --target "$WORK/repo" >/dev/null
grep -Fqx 'Keep this sentence.' "$WORK/repo/AGENTS.md"
[ "$(grep -Fc '<!-- VULPORA:ROUTING:START -->' "$WORK/repo/AGENTS.md")" = 1 ]
grep -Fq 'kotlin-code-authoring' "$WORK/repo/AGENTS.md"
grep -Fq 'postgres-code-authoring' "$WORK/repo/AGENTS.md"
grep -Fq 'mssql-code-authoring' "$WORK/repo/AGENTS.md"
grep -Fq 'opensearch-code-authoring' "$WORK/repo/AGENTS.md"
grep -Fq 'test-authoring' "$WORK/repo/AGENTS.md"
grep -Fq 'test-quality-review' "$WORK/repo/AGENTS.md"
grep -Fq 'test-refactoring' "$WORK/repo/AGENTS.md"
grep -Fq 'test-quality-refactoring-workflow' "$WORK/repo/AGENTS.md"
grep -Fq 'otherwise recommend `pack:jvm-spring`' "$WORK/repo/AGENTS.md"
grep -Fq 'otherwise recommend `pack:postgres`' "$WORK/repo/AGENTS.md"
grep -Fq 'build.gradle.kts' "$WORK/repo/AGENTS.md"
grep -Fq 'Preserve the current branch and worktree by default' "$WORK/repo/AGENTS.md"

mkdir -p "$WORK/java-spring/src/main/java/example"
printf 'package example; import org.springframework.stereotype.Service; @Service class OrderService {}\n' \
  > "$WORK/java-spring/src/main/java/example/OrderService.java"
node "$UPDATER" --target "$WORK/java-spring" >/dev/null
grep -Fq '### Java / Spring' "$WORK/java-spring/AGENTS.md"
grep -Fq 'java-spring-review-workflow' "$WORK/java-spring/AGENTS.md"
! grep -Fq '### Kotlin / Spring' "$WORK/java-spring/AGENTS.md"
grep -Fq 'VCS provider: auto-detect from repository remotes. Base branch: repository default.' "$WORK/repo/AGENTS.md"
grep -Fq 'Language: follow the user and repository conventions.' "$WORK/repo/AGENTS.md"
! grep -Fq 'apply the `git-flow` work-start procedure' "$WORK/repo/AGENTS.md"
node "$UPDATER" --target "$WORK/repo" --check | grep -Fq 'routing_guidance_current'

before_manual="$(sed -n '1,3p' "$WORK/repo/AGENTS.md")"
rm "$WORK/repo/search/order-mapping.json"
sed 's/; implementation("org.opensearch.client:opensearch-java")//' "$WORK/repo/build.gradle.kts" > "$WORK/repo/build.gradle.kts.next"
mv "$WORK/repo/build.gradle.kts.next" "$WORK/repo/build.gradle.kts"
mkdir -p "$WORK/repo/.agents/skills/untrusted-installed-copy"
printf 'dependencies { implementation("org.opensearch.client:opensearch-java") }\n' \
  > "$WORK/repo/.agents/skills/untrusted-installed-copy/build.gradle.kts"
if node "$UPDATER" --target "$WORK/repo" --check >/dev/null 2>&1; then
  echo 'stale routing guidance passed --check' >&2
  exit 1
fi
node "$UPDATER" --target "$WORK/repo" >/dev/null
[ "$(grep -Fc '<!-- VULPORA:ROUTING:START -->' "$WORK/repo/AGENTS.md")" = 1 ]
[ "$before_manual" = "$(sed -n '1,3p' "$WORK/repo/AGENTS.md")" ]
! grep -Fq '### OpenSearch' "$WORK/repo/AGENTS.md"

cat > "$WORK/repo/vulpora.config.json" <<'JSON'
{
  "schemaVersion": 1,
  "locale": "en",
  "vcs": {
    "provider": "github",
    "baseBranch": "main",
    "prepareBranch": true
  }
}
JSON
node "$UPDATER" --target "$WORK/repo" >/dev/null
grep -Fq 'Language: English.' "$WORK/repo/AGENTS.md"
grep -Fq 'VCS provider: GitHub. Base branch: `main`.' "$WORK/repo/AGENTS.md"
grep -Fq 'prepare a task branch from `main`' "$WORK/repo/AGENTS.md"

printf '{"schemaVersion":1,"vcs":{"provider":"gitlab"}}\n' \
  > "$WORK/repo/vulpora.config.json"
node "$UPDATER" --target "$WORK/repo" >/dev/null
grep -Fq 'Language: follow the user and repository conventions.' "$WORK/repo/AGENTS.md"
grep -Fq 'VCS provider: GitLab. Base branch: repository default.' "$WORK/repo/AGENTS.md"
grep -Fq 'Preserve the current branch and worktree by default' "$WORK/repo/AGENTS.md"

mkdir "$WORK/invalid-config"
printf '{"schemaVersion":1,"locale":"fr","vcs":{}}\n' > "$WORK/invalid-config/vulpora.config.json"
if node "$UPDATER" --target "$WORK/invalid-config" >/dev/null 2>&1; then
  echo 'invalid project config was accepted' >&2
  exit 1
fi

mkdir "$WORK/unsafe-branch-config"
printf '{"schemaVersion":1,"vcs":{"baseBranch":"feature//unsafe"}}\n' \
  > "$WORK/unsafe-branch-config/vulpora.config.json"
if node "$UPDATER" --target "$WORK/unsafe-branch-config" >/dev/null 2>&1; then
  echo 'unsafe project base branch was accepted' >&2
  exit 1
fi
node - "$CONFIG_SCHEMA" <<'NODE'
const fs = require('node:fs');
const schema = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const pattern = schema.properties.vcs.properties.baseBranch.oneOf[1].pattern;
const branch = new RegExp(pattern);
if (!branch.test('feature/safe-1') || branch.test('feature//unsafe') || branch.test('feature..unsafe')) {
  throw new Error('project config schema branch contract drift');
}
NODE

mkdir "$WORK/unknown-config-field"
printf '{"schemaVersion":1,"internalPolicy":true}\n' \
  > "$WORK/unknown-config-field/vulpora.config.json"
if node "$UPDATER" --target "$WORK/unknown-config-field" >/dev/null 2>&1; then
  echo 'unknown project config field was accepted' >&2
  exit 1
fi

mkdir "$WORK/symlink-config"
printf '{}\n' > "$WORK/outside-config.json"
ln -s "$WORK/outside-config.json" "$WORK/symlink-config/vulpora.config.json"
if node "$UPDATER" --target "$WORK/symlink-config" >/dev/null 2>&1; then
  echo 'symlinked project config was accepted' >&2
  exit 1
fi

mkdir "$WORK/symlink-repo"
ln -s "$WORK/repo/AGENTS.md" "$WORK/symlink-repo/AGENTS.md"
if node "$UPDATER" --target "$WORK/symlink-repo" >/dev/null 2>&1; then
  echo 'symlinked AGENTS.md was overwritten' >&2
  exit 1
fi

node - "$WORK" "$UPDATER" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const invalid = [{ locale: null }, { vcs: null }, { $schema: 1 },
  ...['provider', 'baseBranch', 'prepareBranch'].map(key => ({ vcs: { [key]: null } }))];
for (const [index, values] of invalid.entries()) {
  const target = path.join(process.argv[2], `invalid-null-${index}`);
  fs.mkdirSync(target);
  fs.writeFileSync(path.join(target, 'vulpora.config.json'), JSON.stringify({ schemaVersion: 1, ...values }));
  const result = spawnSync(process.execPath, [process.argv[3], '--target', target]);
  if (result.status === 0 || fs.existsSync(path.join(target, 'AGENTS.md'))) {
    throw new Error('invalid schema value accepted or wrote routing guidance');
  }
}
NODE

printf 'vulpora-init routing updater: PASS\n'
