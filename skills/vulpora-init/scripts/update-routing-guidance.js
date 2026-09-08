#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const START = '<!-- VULPORA:ROUTING:START -->';
const END = '<!-- VULPORA:ROUTING:END -->';
const CONFIG_FILE = 'vulpora.config.json';
const MAX_FILES = 50000;
const MAX_READ_BYTES = 512 * 1024;
const MAX_CONFIG_BYTES = 64 * 1024;
const IGNORED_DIRS = new Set([
  '.vulpora', '.agents', '.claude', '.codex', '.git', '.gradle', '.idea', '.next', '.omx', '.opencode',
  'build', 'coverage', 'dist', 'node_modules', 'out', 'target', 'vendor',
]);
// Build logic and embedded sample repositories are not application evidence.
// Ordinary source/test directories remain eligible.
const NON_APPLICATION_DIRS = new Set(['buildSrc', 'build-logic', 'gradle', 'evals', 'evaluations', 'fixtures']);
const JVM_BUILD = /^(?:build\.gradle(?:\.kts)?|pom\.xml)$/;

function fail(message) {
  process.stderr.write(`vulpora-init: ${message}\n`);
  process.exit(2);
}

function parseArgs(argv) {
  let target = process.cwd();
  let mode = 'write';
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--target') {
      if (!argv[index + 1]) fail('--target requires a directory');
      target = argv[index + 1];
      index += 1;
    } else if (value.startsWith('--target=')) {
      target = value.slice('--target='.length);
    } else if (value === '--dry-run') {
      if (mode !== 'write') fail('choose only one of --dry-run and --check');
      mode = 'dry-run';
    } else if (value === '--check') {
      if (mode !== 'write') fail('choose only one of --dry-run and --check');
      mode = 'check';
    } else if (value === '-h' || value === '--help') {
      process.stdout.write('Usage: update-routing-guidance.js [--target <repository>] [--dry-run|--check]\n');
      process.exit(0);
    } else {
      fail(`unknown argument: ${value}`);
    }
  }
  return { target, mode };
}

function walk(root) {
  const files = [];
  const pending = [root];
  while (pending.length > 0) {
    const directory = pending.pop();
    const entries = fs.readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    const relativeDirectory = path.relative(root, directory).split(path.sep).join('/');
    if (/(?:^|\/)(?:skills|agents)\/[^/]+$/.test(relativeDirectory)
        && entries.some(entry => entry.isFile() && ['SKILL.md', 'SOUL.md'].includes(entry.name))) continue;
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && !IGNORED_DIRS.has(entry.name) && !NON_APPLICATION_DIRS.has(entry.name)) pending.push(absolute);
      } else if (entry.isFile()) {
        const relative = path.relative(root, absolute).split(path.sep).join('/');
        if (relative !== 'AGENTS.md') files.push({ absolute, relative });
        if (files.length > MAX_FILES) fail(`repository exceeds ${MAX_FILES} scannable files`);
      }
    }
  }
  return files.sort((left, right) => left.relative.localeCompare(right.relative));
}

function readCandidate(file) {
  const stat = fs.statSync(file.absolute);
  if (stat.size > MAX_READ_BYTES) return '';
  return fs.readFileSync(file.absolute, 'utf8');
}

function withoutComments(text) {
  // Preserve quoted dependency coordinates/URLs while excluding code/XML comments.
  return text.replace(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|\/\*[\s\S]*?\*\/|\/\/[^\n]*|<!--[\s\S]*?-->/g,
    (match, quoted) => quoted || '');
}

function loadProjectConfig(root) {
  const defaults = {
    schemaVersion: 1,
    locale: 'auto',
    vcs: { provider: 'auto', baseBranch: 'auto', prepareBranch: false },
  };
  const configPath = path.join(root, CONFIG_FILE);
  const stat = fs.lstatSync(configPath, { throwIfNoEntry: false });
  if (!stat) return defaults;
  if (stat.isSymbolicLink()) fail(`refusing symlinked ${CONFIG_FILE}`);
  if (!stat.isFile()) fail(`${CONFIG_FILE} must be a regular file`);
  if (stat.size > MAX_CONFIG_BYTES) fail(`${CONFIG_FILE} exceeds ${MAX_CONFIG_BYTES} bytes`);

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (error) {
    fail(`${CONFIG_FILE} is not valid JSON: ${error.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    fail(`${CONFIG_FILE} must contain a JSON object`);
  }
  const rootKeys = new Set(['$schema', 'schemaVersion', 'locale', 'vcs']);
  for (const key of Object.keys(parsed)) {
    if (!rootKeys.has(key)) fail(`${CONFIG_FILE} contains unsupported field: ${key}`);
  }
  if (parsed.schemaVersion !== 1) fail(`${CONFIG_FILE}.schemaVersion must be 1`);
  if (parsed.$schema !== undefined && typeof parsed.$schema !== 'string') fail(`${CONFIG_FILE}.$schema must be a string`);
  const locale = parsed.locale === undefined ? defaults.locale : parsed.locale;
  if (!['auto', 'ko', 'en'].includes(locale)) {
    fail(`${CONFIG_FILE}.locale must be auto, ko, or en`);
  }
  const vcs = parsed.vcs === undefined ? {} : parsed.vcs;
  if (!vcs || typeof vcs !== 'object' || Array.isArray(vcs)) {
    fail(`${CONFIG_FILE}.vcs must be an object`);
  }
  const vcsKeys = new Set(['provider', 'baseBranch', 'prepareBranch']);
  for (const key of Object.keys(vcs)) {
    if (!vcsKeys.has(key)) fail(`${CONFIG_FILE}.vcs contains unsupported field: ${key}`);
  }
  const provider = vcs.provider === undefined ? defaults.vcs.provider : vcs.provider;
  if (!['auto', 'github', 'gitlab', 'none'].includes(provider)) {
    fail(`${CONFIG_FILE}.vcs.provider must be auto, github, gitlab, or none`);
  }
  const baseBranch = vcs.baseBranch === undefined ? defaults.vcs.baseBranch : vcs.baseBranch;
  if (baseBranch !== 'auto'
      && (typeof baseBranch !== 'string'
        || baseBranch.length > 128
        || !/^[A-Za-z0-9](?:[A-Za-z0-9._/-]*[A-Za-z0-9])?$/.test(baseBranch)
        || baseBranch.includes('..')
        || baseBranch.includes('//'))) {
    fail(`${CONFIG_FILE}.vcs.baseBranch must be auto or a safe branch name`);
  }
  const prepareBranch = vcs.prepareBranch === undefined ? defaults.vcs.prepareBranch : vcs.prepareBranch;
  if (typeof prepareBranch !== 'boolean') {
    fail(`${CONFIG_FILE}.vcs.prepareBranch must be true or false`);
  }
  return {
    schemaVersion: 1,
    locale,
    vcs: {
      provider,
      baseBranch,
      prepareBranch,
    },
  };
}

function addEvidence(collection, relative) {
  if (!collection.includes(relative) && collection.length < 5) collection.push(relative);
}

function inspect(root) {
  const evidence = { modules: [], postgres: [], mssql: [], opensearch: [] };
  const files = walk(root);
  const builds = new Map();
  for (const file of files.filter(file => JVM_BUILD.test(path.posix.basename(file.relative)))) {
    const directory = path.posix.dirname(file.relative);
    if (!builds.has(directory)) builds.set(directory, []);
    builds.get(directory).push({ ...file, text: withoutComments(readCandidate(file)) });
  }
  const modules = new Map();
  function sourceModule(relative) {
    // A source root identifies its module even when its build is inherited.
    const sourceRoot = relative.match(/^(?:(.*?)\/)?src\//);
    let directory = sourceRoot ? sourceRoot[1] || '.' : path.posix.dirname(relative);
    if (!sourceRoot) {
      while (directory !== '.' && !builds.has(directory)) directory = path.posix.dirname(directory);
    }
    if (!modules.has(directory)) {
      const moduleBuilds = builds.get(directory) || [];
      modules.set(directory, { root: directory, java: [], kotlin: [], spring: [], builds: moduleBuilds });
    }
    return modules.get(directory);
  }
  for (const file of files) {
    const rel = file.relative;
    const base = path.posix.basename(rel);
    const isKotlin = rel.endsWith('.kt');
    const isJava = rel.endsWith('.java');
    const isBuild = /^(build\.gradle(?:\.kts)?|settings\.gradle(?:\.kts)?|gradle\.properties|pom\.xml|libs\.versions\.toml|package\.json|packages\.lock\.json|.+\.csproj)$/.test(base);
    const isRuntimeConfig = /^(application(?:-[^.]+)?\.(?:ya?ml|properties)|appsettings(?:\.[^.]+)?\.json|docker-compose[^/]*\.ya?ml|compose[^/]*\.ya?ml)$/.test(base);
    const isSql = rel.endsWith('.sql');
    const isSearchArtifact = /(?:opensearch|index[-_.]?template|mapping|search[-_.]?query)/i.test(base)
      && /\.(?:json|ya?ml)$/.test(base);

    if (!(isBuild || isRuntimeConfig || isKotlin || isJava || isSql || isSearchArtifact)) continue;

    const raw = readCandidate(file);
    const text = isBuild || isKotlin || isJava ? withoutComments(raw) : raw;
    if (!text) continue;
    if (isKotlin || isJava) {
      const module = sourceModule(rel);
      // Convention plugins can live outside the usual Gradle directories.
      if (/\bimport\s+org\.gradle\./.test(text)
          || module.builds.some(build => /(?:\bid\s*\(?\s*["'](?:org\.gradle\.)?(?:kotlin\.kotlin-dsl|kotlin-dsl|java-gradle-plugin)["']|`kotlin-dsl`)/.test(build.text))) continue;
      addEvidence(module[isKotlin ? 'kotlin' : 'java'], rel);
      if (/\borg\.springframework\b/.test(text)) addEvidence(module.spring, rel);
    }
    if ((isBuild || isRuntimeConfig) && /org\.postgresql|jdbc:postgresql|postgres(?:ql)?[:/\s"']|r2dbc:postgresql/i.test(text)) {
      addEvidence(evidence.postgres, rel);
    } else if (isSql && /\b(?:jsonb|timestamptz|gin|gist|pg_trgm|uuid_generate|generated\s+always\s+as\s+identity)\b|::[a-z_]+/i.test(text)) {
      addEvidence(evidence.postgres, rel);
    }
    if ((isBuild || isRuntimeConfig) && /com\.microsoft\.sqlserver|jdbc:sqlserver|mssql-jdbc|Microsoft\.Data\.SqlClient|System\.Data\.SqlClient|["'](?:mssql|tedious)["']|Server=[^;]+;[^\n]*Database=/i.test(text)) {
      addEvidence(evidence.mssql, rel);
    } else if (isSql && /\b(?:nvarchar|datetime2|rowversion|uniqueidentifier|sp_executesql|TRY_CONVERT|SYSUTCDATETIME)\b|\bIDENTITY\s*\(|\bTOP\s*\(|\bWITH\s*\(\s*NOLOCK\s*\)/i.test(text)) {
      addEvidence(evidence.mssql, rel);
    }
    if (/org\.opensearch|opensearch-java|opensearch-rest|@opensearch-project|OPENSEARCH_URL/i.test(text)) {
      addEvidence(evidence.opensearch, rel);
    } else if (isSearchArtifact && /"(?:mappings|properties|dynamic_templates|analysis)"\s*:/i.test(text)) {
      addEvidence(evidence.opensearch, rel);
    }
  }
  for (const module of modules.values()) {
    if (module.java.length === 0 && module.kotlin.length === 0) continue;
    for (const build of module.builds) {
      // A plugin declaration with apply false does not apply Spring to this module.
      const applied = build.text.replace(/id\s*(?:\(\s*["']org\.springframework[^"']*["']\s*\)|["']org\.springframework[^"']*["'])[^\n{};]*\bapply\s+false\b/g, '');
      const usesSpring = path.posix.basename(build.relative) === 'pom.xml'
        ? /<dependency\b[^>]*>[\s\S]*?<groupId>\s*org\.springframework(?:\.[^<]*)?\s*<\/groupId>[\s\S]*?<\/dependency>/.test(
          applied.replace(/<(dependencyManagement|build|reporting)\b[^>]*>[\s\S]*?<\/\1>/g, ''))
        : /\borg\.springframework\b/.test(applied);
      if (usesSpring) addEvidence(module.spring, build.relative);
    }
    evidence.modules.push(module);
  }
  return evidence;
}

function renderEvidence(paths) {
  return paths.map((value) => `\`${value.replace(/[\u0000-\u001f\u007f`]/g, '?')}\``).join(', ');
}

function renderBlock(evidence, config) {
  const sections = [];
  for (const language of ['java', 'kotlin']) {
    for (const spring of [true, false]) {
      const modules = evidence.modules.filter(module => module[language].length > 0 && (module.spring.length > 0) === spring);
      if (modules.length === 0) continue;
      const label = language === 'java' ? 'Java' : 'Kotlin';
      const title = `${label}${spring ? ' / Spring' : ''}`;
      const moduleEvidence = modules.map(module => {
        const paths = [...new Set([...module[language], ...module.spring, ...module.builds.map(build => build.relative)])];
        return `- Module: ${renderEvidence([module.root])}. Evidence: ${renderEvidence(paths)}${module.builds.length === 0 ? '. No local build file found; verify inherited or custom build configuration before implementation.' : ''}`;
      }).join('\n');
      const scope = `- Scope: only changed ${label} source and ${label} tests in these modules. In mixed modules, select the route for each changed file; never apply one language route to the whole repository.`;
      const implementation = language === 'java'
        ? '- Implementation: follow repository-local Java authoring conventions and the affected module build settings.'
        : '- Implementation: if installed, load `kotlin-code-authoring` for affected Kotlin code; otherwise recommend `pack:jvm-spring` and follow repository-local guidance.';
      const tests = language === 'java'
        ? '- Tests: follow the affected module’s existing Java test framework, dependencies, and nearby tests; do not apply Kotlin-only test skills to Java work.'
        : '- Tests: only for affected Kotlin tests, when installed, use `test-authoring` for new behavior or tests. Existing Kotlin test quality work may use `test-quality-review`, `test-refactoring`, or `test-quality-refactoring-workflow` when installed and supported by the module’s test framework. Kotlin persistence tests follow the installed `test-authoring` repository round-trip profile.';
      const review = spring
        ? `- Review: if installed, use \`${language}-spring-review-workflow\` for this module and language; otherwise recommend \`pack:jvm-spring\`.`
        : '- Review: follow repository-local review guidance; Spring usage is not established for these modules.';
      sections.push(`### ${title}\n\n${scope}\n${moduleEvidence}\n${implementation}\n${tests}\n${review}`);
    }
  }
  if (evidence.postgres.length > 0) {
    sections.push(`### PostgreSQL\n\n- Evidence: ${renderEvidence(evidence.postgres)}\n- Implementation: if installed, load \`postgres-code-authoring\` for affected SQL, repository-query, schema, or migration lanes; otherwise recommend \`pack:postgres\`.\n- Review: if installed, use \`postgres-review-workflow\`; otherwise recommend \`pack:postgres\`.`);
  }
  if (evidence.mssql.length > 0) {
    sections.push(`### Microsoft SQL Server\n\n- Evidence: ${renderEvidence(evidence.mssql)}\n- Implementation: if installed, load \`mssql-code-authoring\` for affected T-SQL, stored-procedure, schema, index, or migration lanes; otherwise recommend \`pack:mssql\`.\n- Compatibility: prove engine version, edition, database compatibility level, and migration-runner semantics before version-gated syntax.`);
  }
  if (evidence.opensearch.length > 0) {
    sections.push(`### OpenSearch\n\n- Evidence: ${renderEvidence(evidence.opensearch)}\n- Implementation: if installed, load \`opensearch-code-authoring\` for affected mapping, Query DSL, pipeline, index-setting, or reindex lanes; otherwise recommend \`pack:opensearch\`.\n- Review: if installed, use \`opensearch-review-workflow\`; otherwise recommend \`pack:opensearch\`.`);
  }
  if (sections.length === 0) {
    sections.push('### Detected stack profiles\n\nNo supported Java/Kotlin, Spring, PostgreSQL, Microsoft SQL Server, or OpenSearch profile was detected. Follow repository-local conventions and do not invent a stack route.');
  }

  const providerLabel = {
    auto: 'auto-detect from repository remotes',
    github: 'GitHub',
    gitlab: 'GitLab',
    none: 'no hosted VCS provider',
  }[config.vcs.provider];
  const localeLabel = {
    auto: 'follow the user and repository conventions',
    ko: 'Korean',
    en: 'English',
  }[config.locale];
  const branchPolicy = config.vcs.prepareBranch
    ? `Before implementation edits, prepare a task branch from ${config.vcs.baseBranch === 'auto' ? 'the repository default branch' : `\`${config.vcs.baseBranch}\``}. Use ${providerLabel}; preserve dirty or diverged work and never force-push, rebase, reset, or auto-stash.`
    : 'Preserve the current branch and worktree by default. Do not create, switch, update, or publish a branch unless the user or repository policy explicitly requests it.';

  return `${START}\n## Vulpora routing (generated)\n\nGenerated by \`vulpora-init\`. Re-run the skill after build dependencies, routing configuration, or persistence/search infrastructure changes. Project configuration: \`${CONFIG_FILE}\` (optional).\n\n### Project policy\n\n- Language: ${localeLabel}.\n- VCS provider: ${providerLabel}. Base branch: ${config.vcs.baseBranch === 'auto' ? 'repository default' : `\`${config.vcs.baseBranch}\``}.\n- ${branchPolicy}\n\n### Required routing\n\n- For every feature, bug fix, refactor, or implementation request, load \`code-authoring-router\` before editing even when the prompt names only business behavior.\n- Select technology guidance only when repository evidence, the affected task lane, and installed capabilities support it. Treat missing specialist IDs as pack recommendations, not executed skills.\n- Put \`base_branch\`, \`work_branch\`, \`required_authoring_skills\`, and evidence paths in implementation handoffs.\n\n${sections.join('\n\n')}\n\n### Verification\n\n- Run repository-provided formatter, lint, compile, focused tests, and static analysis that apply to the changed lanes.\n- Treat this generated block as routing metadata, not proof that every task touches every detected technology.\n${END}`;
}

function updateDocument(existing, block) {
  const starts = existing.split(START).length - 1;
  const ends = existing.split(END).length - 1;
  if (starts !== ends || starts > 1) fail('AGENTS.md has malformed or duplicate Vulpora routing markers');
  if (starts === 1) {
    const startIndex = existing.indexOf(START);
    const rawEndIndex = existing.indexOf(END, startIndex);
    if (rawEndIndex < startIndex) fail('AGENTS.md has out-of-order Vulpora routing markers');
    const endIndex = rawEndIndex + END.length;
    return existing.slice(0, startIndex) + block + existing.slice(endIndex);
  }
  const prefix = existing.length === 0 ? '# AGENTS.md\n\n' : existing;
  const separator = prefix.endsWith('\n\n') ? '' : prefix.endsWith('\n') ? '\n' : '\n\n';
  return `${prefix}${separator}${block}\n`;
}

function main() {
  const { target, mode } = parseArgs(process.argv.slice(2));
  let root;
  try {
    root = fs.realpathSync(target);
  } catch {
    fail(`target does not exist: ${target}`);
  }
  if (!fs.statSync(root).isDirectory()) fail(`target is not a directory: ${target}`);

  const agentsPath = path.join(root, 'AGENTS.md');
  if (fs.lstatSync(agentsPath, { throwIfNoEntry: false })?.isSymbolicLink()) fail('refusing symlinked AGENTS.md');
  const existing = fs.existsSync(agentsPath) ? fs.readFileSync(agentsPath, 'utf8') : '';
  const config = loadProjectConfig(root);
  const evidence = inspect(root);
  const block = renderBlock(evidence, config);
  const updated = updateDocument(existing, block);

  if (mode === 'dry-run') {
    process.stdout.write(`${block}\n`);
    return;
  }
  if (mode === 'check') {
    if (existing !== updated) {
      process.stderr.write('routing_guidance_stale: AGENTS.md\n');
      process.exit(1);
    }
    process.stdout.write('routing_guidance_current: AGENTS.md\n');
    return;
  }
  if (existing === updated) {
    process.stdout.write('routing_guidance_unchanged: AGENTS.md\n');
    return;
  }

  const temporary = `${agentsPath}.vulpora-${process.pid}.tmp`;
  const fileMode = fs.existsSync(agentsPath) ? fs.statSync(agentsPath).mode & 0o777 : 0o644;
  try {
    fs.writeFileSync(temporary, updated, { encoding: 'utf8', flag: 'wx', mode: fileMode });
    fs.renameSync(temporary, agentsPath);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
  const detected = ['java', 'kotlin', 'spring'].filter(name => evidence.modules.some(module => module[name].length > 0));
  detected.push(...['postgres', 'mssql', 'opensearch'].filter(name => evidence[name].length > 0));
  process.stdout.write(`routing_guidance_updated: AGENTS.md\ndetected_profiles: ${detected.join(',') || 'none'}\nproject_config: ${fs.existsSync(path.join(root, CONFIG_FILE)) ? CONFIG_FILE : 'defaults'}\n`);
}

main();
