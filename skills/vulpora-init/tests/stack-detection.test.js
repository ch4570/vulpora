'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '../scripts/update-routing-guidance.js');
const START = '<!-- VULPORA:ROUTING:START -->';
const END = '<!-- VULPORA:ROUTING:END -->';

function fixture(t, files, config) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vulpora-init-stack-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.writeFileSync(target, content);
  }
  if (config !== undefined) fs.writeFileSync(path.join(root, 'vulpora.config.json'), JSON.stringify(config));
  return root;
}

function run(root, ...args) {
  return spawnSync(process.execPath, [SCRIPT, '--target', root, ...args], {encoding: 'utf8'});
}

function block(root) {
  const text = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
  const start = text.indexOf(START), end = text.indexOf(END);
  assert.ok(start >= 0 && end > start, 'generated routing block is present');
  return text.slice(start, end + END.length);
}

function section(text, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(`### ${escaped}\\n\\n([\\s\\S]*?)(?=\\n\\n### |${END})`));
  return match && match[1];
}

test('routes Java source with Kotlin Gradle DSL to Java/Spring and records both module evidence', t => {
  const root = fixture(t, {
    'settings.gradle.kts': 'rootProject.name = "demo"\n',
    'build.gradle.kts': 'plugins { id("org.springframework.boot") version "3.4.0" }\n',
    'java-app/build.gradle.kts': 'plugins { id("java") }\n',
    'java-app/src/main/java/App.java': 'import org.springframework.boot.autoconfigure.SpringBootApplication;\n@SpringBootApplication class App {}\n',
  });
  const result = run(root);
  assert.equal(result.status, 0, result.stderr);
  const generated = block(root);
  assert.ok(section(generated, 'Java / Spring'));
  assert.match(section(generated, 'Java / Spring'), /java-app\/src\/main\/java\/App\.java/);
  assert.match(section(generated, 'Java / Spring'), /java-app\/build\.gradle\.kts/);
  assert.doesNotMatch(generated, /test-authoring|test-refactoring|kotlin-code-authoring|kotlin-spring-review-workflow/);
  assert.doesNotMatch(section(generated, 'Java / Spring'), /kotlin-code-authoring/);
});

test('does not mistake buildSrc or convention Kotlin for a Kotlin application lane', t => {
  const root = fixture(t, {
    'settings.gradle': 'rootProject.name = "java"\n',
    'buildSrc/src/main/kotlin/Conventions.kt': 'class Conventions\n',
    'gradle/convention/src/main/kotlin/Conventions.kt': 'class Conventions\n',
    'build.gradle': 'plugins { id "java" }\n',
    'src/main/java/App.java': 'import org.springframework.stereotype.Service;\n@Service class App {}\n',
  });
  assert.equal(run(root).status, 0);
  const generated = block(root);
  assert.ok(section(generated, 'Java / Spring'));
  assert.doesNotMatch(generated, /### Kotlin \/ Spring/);
});

test('routes a real Kotlin Spring module and keeps plain Java and Kotlin modules conditional', t => {
  const root = fixture(t, {
    'settings.gradle.kts': 'rootProject.name = "mixed"\n',
    'kotlin-app/build.gradle.kts': 'plugins { kotlin("jvm"); id("org.springframework.boot") }\n',
    'kotlin-app/src/main/kotlin/App.kt': 'import org.springframework.stereotype.Service\n@Service class App\n',
    'kotlin-app/pom.xml': '<project><dependency>org.springframework.boot</dependency></project>\n',
    'java-app/build.gradle': 'plugins { id "java" }\n',
    'java-app/src/main/java/App.java': 'import org.springframework.stereotype.Service;\n@Service class App {}\n',
    'java-app/src/main/java/JavaOnly.java': 'class JavaOnly {}\n',
    'plain-kotlin/src/main/kotlin/Utility.kt': 'class Utility\n',
  });
  assert.equal(run(root).status, 0);
  const generated = block(root);
  assert.ok(section(generated, 'Kotlin / Spring'));
  assert.ok(section(generated, 'Java / Spring'));
  assert.match(section(generated, 'Kotlin / Spring'), /kotlin-app/);
  assert.match(section(generated, 'Kotlin / Spring'), /kotlin-app\/(?:build\.gradle\.kts|pom\.xml)/);
  assert.match(section(generated, 'Java / Spring'), /java-app\/(?:build\.gradle|src\/main\/java\/App\.java)/);
  assert.doesNotMatch(section(generated, 'Kotlin / Spring'), /java-app\/|plain-kotlin\/src/);
  assert.doesNotMatch(generated.match(/### Java \/ Spring[\s\S]*?(?=\n\n### |<!-- VULPORA)/)[0], /plain-kotlin\/src/);
});

test('ignores installed-agent and skill false positives while retaining src and test evidence', t => {
  const root = fixture(t, {
    'evals/fixtures/repos/sample/src/main/kotlin/Fake.kt': 'import org.springframework.stereotype.Service\n@Service class Fake\n',
    'evals/fixtures/repos/sample/build.gradle.kts': 'plugins { kotlin("jvm"); id("org.springframework.boot") }\n',
    'evals/fixtures/repos/sample/schema.sql': 'create table x (id uuid);\n',
    'evals/fixtures/repos/sample/mapping.json': '{"mappings":{"properties":{"id":{"type":"keyword"}}}}\n',
    '.agents/skills/fake/SKILL.md': 'org.springframework.boot kotlin("jvm")\n',
    '.codex/agents/fake.md': 'org.springframework.stereotype.Service\n',
    'skills/fake/tests/fixtures/Fake.kt': 'org.springframework.stereotype.Service\n',
    'agents/fake/reference/fixtures/Fake.kt': 'org.springframework.stereotype.Service\n',
    'src/main/java/App.java': 'import org.springframework.stereotype.Service;\n@Service class App {}\n',
    'src/test/java/AppTest.java': 'import org.springframework.boot.SpringApplication;\nclass AppTest {}\n',
  });
  assert.equal(run(root).status, 0);
  const generated = block(root);
  assert.ok(section(generated, 'Java / Spring'));
  assert.doesNotMatch(generated, /### Kotlin \/ Spring/);
  assert.doesNotMatch(generated, /installedagents|\.agents\/skills|\.codex|skills\/fake|agents\/fake|evals\/fixtures/);
  assert.match(generated, /src\/test\/java\/AppTest\.java/);
});

test('preserves manual content, is idempotent, supports dry-run/check, rejects malformed markers and symlink targets', t => {
  const root = fixture(t, {'src/main/java/App.java': 'class App {}\n'});
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Keep me\n\nmanual note\n');
  assert.equal(run(root).status, 0);
  const first = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
  assert.match(first, /^# Keep me[\s\S]*manual note/);
  assert.equal(run(root).status, 0);
  assert.equal(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8'), first);
  const dry = run(root, '--dry-run');
  assert.equal(dry.status, 0, dry.stderr);
  assert.equal(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8'), first);
  assert.equal(run(root, '--check').status, 0);
  fs.writeFileSync(path.join(root, 'AGENTS.md'), `${START}\n${START}\n${END}\n`);
  assert.notEqual(run(root).status, 0);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'vulpora-init-outside-'));
  t.after(() => fs.rmSync(outside, {recursive: true, force: true}));
  fs.unlinkSync(path.join(root, 'AGENTS.md'));
  fs.symlinkSync(outside, path.join(root, 'AGENTS.md'));
  assert.notEqual(run(root).status, 0);
});

test('rejects malformed project configuration', t => {
  const root = fixture(t, {'src/App.java': 'class App {}\n'}, {schemaVersion: 2});
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /schemaVersion/);
});

test('plugin declarations without JVM source do not create language routes', t => {
  const root = fixture(t, {
    'build.gradle.kts': 'plugins { id("org.springframework.boot") apply false; kotlin("jvm") apply false }\n',
    'settings.gradle.kts': 'rootProject.name = "catalog"\n',
  });
  assert.equal(run(root).status, 0);
  const generated = block(root);
  assert.doesNotMatch(generated, /### Java \/ Spring|### Kotlin(?: \/ Spring)?/);
});

test('Spring evidence is module-owned and same-module Java plus Kotlin emits both routes', t => {
  const root = fixture(t, {
    'service/build.gradle': 'plugins { id "org.springframework.boot" }\n',
    'service/src/main/java/App.java': 'import org.springframework.stereotype.Service;\n@Service class App {}\n',
    'service/src/main/kotlin/Extra.kt': 'import org.springframework.stereotype.Component\n@Component class Extra\n',
    'plain/build.gradle': 'plugins { id "java" }\n',
    'plain/src/main/java/Plain.java': 'class Plain {}\n',
    'root.gradle': 'plugins { id "org.springframework.boot" apply false }\n',
    'pom.xml': '<project><pluginManagement><plugin>org.springframework.boot</plugin></pluginManagement></project>\n',
  });
  assert.equal(run(root).status, 0);
  const generated = block(root);
  assert.match(section(generated, 'Java / Spring'), /service\/(?:build\.gradle|src\/main\/java\/App\.java)/);
  assert.match(section(generated, 'Kotlin / Spring'), /service\/(?:build\.gradle|src\/main\/kotlin\/Extra\.kt)/);
  assert.doesNotMatch(section(generated, 'Java / Spring'), /plain\/src|root\.gradle|pom\.xml/);
  assert.doesNotMatch(section(generated, 'Kotlin / Spring'), /plain\/src|root\.gradle|pom\.xml/);
});

test('fixture-only technology signatures are ignored and ordinary src/test files remain eligible evidence', t => {
  const root = fixture(t, {
    'evals/fixtures/repos/sample/src/main/kotlin/Fake.kt': 'import org.springframework.stereotype.Service\n@Service class Fake\n',
    'evals/fixtures/repos/sample/build.gradle.kts': 'plugins { kotlin("jvm"); id("org.springframework.boot") }\n',
    'evals/fixtures/repos/sample/db.sql': 'select payload::jsonb from records;\n',
    'evals/fixtures/repos/sample/search.json': '{"mappings":{"properties":{"x":{"type":"keyword"}}}}\n',
    'evals/fixtures/repos/sample/mssql.sql': 'select top (1) * from x with (nolock);\n',
    '.agents/skills/fake/SKILL.md': 'org.springframework.boot jdbc:postgresql mssql opensearch\n',
    'skills/fake/tests/fixtures/Fake.kt': 'org.springframework.stereotype.Service\n',
    'src/main/java/App.java': 'class App {}\n',
    'src/test/java/AppTest.java': 'class AppTest {}\n',
  });
  assert.equal(run(root).status, 0);
  const generated = block(root);
  assert.doesNotMatch(generated, /### Java \/ Spring|### Kotlin|### PostgreSQL|### Microsoft SQL Server|### OpenSearch/);
  assert.doesNotMatch(generated, /evals\/fixtures|\.agents\/skills|skills\/fake/);
});

test('uses applied module build settings without confusing comments or management declarations for application plugins', t => {
  const root = fixture(t, {
    'service/build.gradle.kts': 'plugins { id("java") }\n// No java-gradle-plugin is applied here\ndependencies { implementation("org.springframework:spring-context:6.2.0") }\n',
    'service/src/main/java/Service.java': 'class Service {}\n',
    'managed/pom.xml': '<project><build><pluginManagement><plugins><plugin><groupId>org.springframework.boot</groupId><artifactId>spring-boot-maven-plugin</artifactId></plugin></plugins></pluginManagement></build></project>\n',
    'managed/src/main/java/Plain.java': 'class Plain {}\n',
    'declared/build.gradle.kts': 'plugins { id("org.springframework.boot") version "3.4.0" apply false }\n',
    'declared/src/main/java/Plain.java': 'class Plain {}\n',
    'maven/pom.xml': '<project><dependencies><dependency><groupId>org.springframework</groupId><artifactId>spring-context</artifactId></dependency></dependencies></project>\n',
    'maven/src/main/java/Service.java': 'class Service {}\n',
  });
  assert.equal(run(root).status, 0);
  const generated = block(root);
  const spring = section(generated, 'Java / Spring');
  assert.match(spring, /service\/build\.gradle\.kts/);
  assert.match(spring, /maven\/pom\.xml/);
  assert.doesNotMatch(spring, /managed\/|declared\//);
  assert.match(section(generated, 'Java'), /managed\/src\/main\/java\/Plain\.java/);
  assert.match(section(generated, 'Java'), /declared\/src\/main\/java\/Plain\.java/);
  for (const line of generated.split('\n').filter(line => line.includes('Evidence:'))) {
    const paths = [...line.split('Evidence:')[1].matchAll(/`([^`]+)`/g)].map(match => match[1]);
    assert.ok(paths.length > 0);
    for (const relative of paths) assert.ok(fs.statSync(path.join(root, relative)).isFile(), relative);
  }
});

test('excludes custom convention plugins and installed bundles but retains ordinary Kotlin tests', t => {
  const root = fixture(t, {
    'tools/conventions/build.gradle.kts': 'plugins { `kotlin-dsl` }\n',
    'tools/conventions/src/main/kotlin/Plugin.kt': 'class Plugin\n',
    'skills/installed/SKILL.md': 'An installed skill\n',
    'skills/installed/src/main/kotlin/Fake.kt': 'import org.springframework.stereotype.Service\nclass Fake\n',
    'agents/installed/SOUL.md': 'An installed agent\n',
    'agents/installed/src/main/kotlin/Fake.kt': 'import org.springframework.stereotype.Service\nclass Fake\n',
    '.agents/skills/installed/src/main/kotlin/Fake.kt': 'class Fake\n',
    '.codex/agents/installed/src/main/kotlin/Fake.kt': 'class Fake\n',
    '.local-work/releases/src/main/kotlin/Fake.kt': 'import org.springframework.stereotype.Service\nclass Fake\n',
    'build.gradle.kts': 'plugins { id("java"); kotlin("jvm") }\n',
    'src/main/java/App.java': 'class App {}\n',
    'src/test/kotlin/AppTest.kt': 'class AppTest\n',
  });
  assert.equal(run(root).status, 0);
  const generated = block(root);
  assert.match(section(generated, 'Java'), /src\/main\/java\/App\.java/);
  assert.match(section(generated, 'Kotlin'), /src\/test\/kotlin\/AppTest\.kt/);
  assert.doesNotMatch(generated, /### (?:Java|Kotlin) \/ Spring|tools\/conventions|(?:skills|agents)\/installed|\.local-work/);
  assert.match(section(generated, 'Kotlin'), /only changed Kotlin source and Kotlin tests/);
  assert.doesNotMatch(section(generated, 'Java'), /`(?:test-authoring|test-refactoring|kotlin-code-authoring)`/);
});

test('refreshes stale routing while preserving both manual sides and refusing dangling instruction/config links', t => {
  const prefix = '# Manual policy\nKeep exact spacing.  \n';
  const suffix = '\n\nManual ending without a final newline';
  const initial = `${prefix}${START}\nstale\n${END}${suffix}`;
  const root = fixture(t, {
    'AGENTS.md': initial,
    'src/main/java/App.java': 'import org.springframework.stereotype.Service; class App {}\n',
  });
  assert.equal(run(root, '--check').status, 1);
  const dry = run(root, '--dry-run');
  assert.equal(dry.status, 0);
  assert.match(dry.stdout, /### Java \/ Spring/);
  assert.equal(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8'), initial);
  assert.equal(run(root).status, 0);
  const updated = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
  assert.ok(updated.startsWith(prefix));
  assert.ok(updated.endsWith(suffix));
  assert.equal(run(root).status, 0);
  assert.equal(run(root, '--check').status, 0);
  assert.equal(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8'), updated);
  fs.unlinkSync(path.join(root, 'AGENTS.md'));
  const missing = path.join(root, 'missing-instructions');
  fs.symlinkSync(missing, path.join(root, 'AGENTS.md'));
  assert.match(run(root).stderr, /refusing symlinked AGENTS\.md/);
  assert.ok(fs.lstatSync(path.join(root, 'AGENTS.md')).isSymbolicLink());
  assert.equal(fs.existsSync(missing), false);
  fs.unlinkSync(path.join(root, 'AGENTS.md'));
  fs.symlinkSync(missing, path.join(root, 'vulpora.config.json'));
  assert.match(run(root).stderr, /refusing symlinked vulpora\.config\.json/);
  assert.equal(fs.existsSync(path.join(root, 'AGENTS.md')), false);
});
