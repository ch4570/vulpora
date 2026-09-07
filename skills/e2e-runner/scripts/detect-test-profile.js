#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = process.argv[2];
if (!root) {
  console.error('usage: detect-test-profile.js <repository-root>');
  process.exit(64);
}

const absoluteRoot = path.resolve(root);
const ignored = new Set(['.git', '.gradle', '.idea', 'build', 'node_modules', 'out', 'target']);
const filesRead = [];
const evidence = { kotest: [], junitJupiter: [], testcontainers: [] };
const sourceEvidence = { kotest: [], junitJupiter: [], testcontainers: [] };
const testFiles = [];
const integrationCandidates = [];
const composeFiles = [];
const configurationContent = new Map();
const testContent = new Map();

function relative(file) {
  return path.relative(absoluteRoot, file).split(path.sep).join('/');
}

function shellQuote(value) {
  return /^[A-Za-z0-9_./:=,@+-]+$/.test(value) ? value : `'${value.replace(/'/g, `'"'"'`)}'`;
}

function read(file) {
  const value = fs.readFileSync(file, 'utf8');
  filesRead.push(relative(file));
  return value;
}

function walk(directory, depth, visit) {
  if (depth < 0) return;
  let entries;
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return;
  }
  for (const entry of entries) {
    if (ignored.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(fullPath, depth - 1, visit);
    else if (entry.isFile()) visit(fullPath);
  }
}

const configurationFiles = [];
walk(absoluteRoot, 10, (file) => {
  const name = path.basename(file);
  const normalized = relative(file);
  if (/^(settings\.gradle(?:\.kts)?|build\.gradle(?:\.kts)?|pom\.xml|gradle\.properties|junit-platform\.properties|libs\.versions\.toml)$/.test(name)
      || /(^|\/)(src\/test\/resources\/|src\/testFixtures\/resources\/).+\.(properties|ya?ml)$/.test(normalized)) {
    configurationFiles.push(file);
  }
  if (/(^|\/)(src\/test|src\/integrationTest|src\/e2eTest|src\/testFixtures)\/.+\.(kt|java)$/.test(normalized)) {
    testFiles.push(file);
    if (/(?:Integration|Container|E2E|EndToEnd)Test\.(?:kt|java)$/.test(name)) integrationCandidates.push(file);
  }
  if (/(?:^|\/)(?:docker-)?compose[^/]*\.ya?ml$/.test(normalized)) composeFiles.push(file);
});

const testModulePaths = new Set(
  integrationCandidates
    .map((file) => relative(file).match(/^(.*)\/src\/(?:test|integrationTest|e2eTest|testFixtures)\//)?.[1])
    .filter(Boolean),
);
const selectedConfigurationFiles = configurationFiles.filter((file) => {
  const normalized = relative(file);
  if (!normalized.includes('/')) return true;
  if (normalized === 'module/testcontainers-support/build.gradle.kts') return true;
  return [...testModulePaths].some((modulePath) => normalized === `${modulePath}/build.gradle.kts`);
});

for (const file of selectedConfigurationFiles.sort()) {
  const content = read(file);
  configurationContent.set(file, content);
  const source = relative(file);
  if (/io\.kotest|kotest[-.]/i.test(content)) evidence.kotest.push(source);
  if (/org\.junit\.jupiter|junit-jupiter/i.test(content)) evidence.junitJupiter.push(source);
  if (/org\.testcontainers|testcontainers[-.]/i.test(content)) evidence.testcontainers.push(source);
}

const testsByStem = new Map(testFiles.map((file) => [path.basename(file).replace(/\.(?:kt|java)$/, ''), file]));
const testQueue = [...(integrationCandidates.length ? integrationCandidates.sort().slice(0, 6) : testFiles.sort())];
while (testQueue.length && testContent.size < 12) {
  const file = testQueue.shift();
  if (testContent.has(file)) continue;
  const content = read(file);
  testContent.set(file, content);
  const source = relative(file);
  if (/io\.kotest|\b(?:FunSpec|BehaviorSpec|StringSpec|WordSpec|ShouldSpec)\b/.test(content)) {
    evidence.kotest.push(source);
    sourceEvidence.kotest.push(source);
  }
  if (/org\.junit\.jupiter|@(Test|Nested|ParameterizedTest|ExtendWith)\b/.test(content)) {
    evidence.junitJupiter.push(source);
    sourceEvidence.junitJupiter.push(source);
  }
  if (/org\.testcontainers|@(Testcontainers|Container)\b|\b(?:GenericContainer|PostgreSQLContainer|KafkaContainer|RedisContainer)\b/.test(content)) {
    evidence.testcontainers.push(source);
    sourceEvidence.testcontainers.push(source);
  }
  const references = [
    ...content.matchAll(/:\s*(Abstract\w+Test)\s*\(/g),
    ...content.matchAll(/@Import\((\w+)::class\)/g),
  ].map((match) => match[1]);
  for (const reference of references) {
    const referencedFile = testsByStem.get(reference);
    if (referencedFile && !testContent.has(referencedFile)) testQueue.push(referencedFile);
  }
}

const suiteCandidates = [];
let remainingTestReads = 12 - testContent.size;
for (const file of integrationCandidates.sort()) {
  let content = testContent.get(file);
  if (!content) {
    if (remainingTestReads <= 0) continue;
    content = read(file);
    testContent.set(file, content);
    remainingTestReads -= 1;
  }
  const normalizedTestPath = relative(file);
  const sourceRoot = normalizedTestPath.match(/^(?:(.*)\/)?src\/(test|integrationTest|e2eTest|testFixtures)\//);
  const packageName = (content.match(/^package\s+([\w.]+)/m) || [])[1];
  const className = (content.match(/(?:class|object)\s+(\w+(?:Integration|Container|E2E|EndToEnd)Test)\b/) || [])[1];
  const modulePrefix = sourceRoot?.[1] || '';
  const sourceSet = sourceRoot?.[2] || 'test';
  if (!packageName || !className || !sourceRoot) continue;
  const moduleBuild = [...configurationContent.entries()].find(([configFile]) =>
    relative(configFile) === (modulePrefix ? `${modulePrefix}/build.gradle.kts` : 'build.gradle.kts')
      || relative(configFile) === (modulePrefix ? `${modulePrefix}/pom.xml` : 'pom.xml'));
  const moduleHasTestcontainers = Boolean(moduleBuild && /org\.testcontainers|testcontainers[-.]/i.test(moduleBuild[1]));
  const fixtureGraphFiles = [file];
  const fixtureGraphContent = [content];
  for (let depth = 0; depth < 2; depth += 1) {
    const references = fixtureGraphContent
      .flatMap((value) => [
        ...value.matchAll(/:\s*(Abstract\w+Test)\s*\(/g),
        ...value.matchAll(/@Import\((\w+)::class\)/g),
      ].map((match) => match[1]));
    for (const reference of references) {
      const referencedFile = testsByStem.get(reference);
      if (!referencedFile || fixtureGraphFiles.includes(referencedFile) || !testContent.has(referencedFile)) continue;
      fixtureGraphFiles.push(referencedFile);
      fixtureGraphContent.push(testContent.get(referencedFile));
    }
  }
  const combinedFixture = fixtureGraphContent.join('\n');
  const sourceHasFixture = /org\.testcontainers|(?:Generic|ConfluentKafka|Kafka|PostgreSQL|Redis)Container\b/.test(combinedFixture);
  const dynamicBindingProven = /DynamicProperty(?:Registrar|Source)|@ServiceConnection/.test(combinedFixture);
  const fixtureProven = moduleHasTestcontainers && sourceHasFixture && dynamicBindingProven;
  if (!fixtureProven) continue;
  const conditionalBypass = /if\s*\([^)]*(?:DockerAvailable|isDockerAvailable)[^)]*\)/.test(combinedFixture);
  const imageTags = [...combinedFixture.matchAll(/(?:DockerImageName\.parse|\w+Container)\(\s*["']([^"']+:[^"']+)["']/g)].map((match) => match[1]);
  const authoringFramework = /io\.kotest|\bBehaviorSpec\b|\bFunSpec\b/.test(combinedFixture)
    ? 'kotest'
    : /org\.junit\.jupiter|@Test\b/.test(combinedFixture) ? 'junit-jupiter' : 'unknown';
  const serviceEvidence = [];
  const combinedEvidence = `${relative(file)}\n${content}\n${moduleBuild ? moduleBuild[1] : ''}`;
  if (/kafka/i.test(combinedEvidence)) serviceEvidence.push('kafka');
  if (/redis/i.test(combinedEvidence)) serviceEvidence.push('redis');
  if (/postgres|jdbc|jpa/i.test(combinedEvidence)) serviceEvidence.push('postgresql');
  if (/opensearch|elasticsearch/i.test(combinedEvidence)) serviceEvidence.push('opensearch');
  const gradleTask = `${modulePrefix ? `:${modulePrefix.split('/').join(':')}` : ''}:${sourceSet === 'testFixtures' ? 'test' : sourceSet}`;
  const fullyQualifiedClass = `${packageName}.${className}`;
  const usesGradle = fs.existsSync(path.join(absoluteRoot, 'gradlew')) || configurationFiles.some((configFile) => /build\.gradle/.test(configFile));
  const execution = usesGradle
    ? {
        cwd: '.',
        executable: './gradlew',
        argv: authoringFramework === 'kotest'
          ? ['--no-daemon', gradleTask, `-Dkotest.filter.specs=*${className}`, '--rerun-tasks']
          : ['--no-daemon', gradleTask, '--tests', fullyQualifiedClass, '--rerun-tasks'],
        resultXmlGlob: `${modulePrefix ? `${modulePrefix}/` : ''}build/test-results/${sourceSet === 'testFixtures' ? 'test' : sourceSet}/TEST-${fullyQualifiedClass}.xml`,
      }
    : { cwd: '.', executable: './mvnw', argv: [...(modulePrefix ? ['-pl', modulePrefix] : []), `-Dtest=${fullyQualifiedClass}`, 'test'], resultXmlGlob: `${modulePrefix ? `${modulePrefix}/` : ''}target/surefire-reports/TEST-${fullyQualifiedClass}.xml` };
  suiteCandidates.push({
    path: normalizedTestPath,
    module: modulePrefix ? `:${modulePrefix.split('/').join(':')}` : ':',
    className: fullyQualifiedClass,
    execution,
    command: [execution.executable, ...execution.argv].map(shellQuote).join(' '),
    serviceEvidence,
    fixtureProven,
    fixtureGraph: fixtureGraphFiles.map(relative),
    imageTags: [...new Set(imageTags)],
    dynamicBindingProven,
    authoringFramework,
    conditionalInfrastructureBypass: conditionalBypass,
  });
}

for (const key of Object.keys(evidence)) {
  evidence[key] = [...new Set(evidence[key])];
  sourceEvidence[key] = [...new Set(sourceEvidence[key])];
}

const hasSourceFrameworkEvidence = sourceEvidence.kotest.length > 0 || sourceEvidence.junitJupiter.length > 0;
const hasKotest = (hasSourceFrameworkEvidence ? sourceEvidence.kotest : evidence.kotest).length > 0;
const hasJunit = (hasSourceFrameworkEvidence ? sourceEvidence.junitJupiter : evidence.junitJupiter).length > 0;
const primaryFramework = hasKotest && hasJunit ? 'mixed' : hasKotest ? 'kotest' : hasJunit ? 'junit-jupiter' : 'unknown';
const testcontainersDependency = [...configurationContent.values()].some((content) => /org\.testcontainers|testcontainers[-.]/i.test(content));
const testcontainersFixture = evidence.testcontainers.some((file) => /(^|\/)(src\/test|src\/integrationTest|src\/e2eTest|src\/testFixtures)\//.test(file)) || suiteCandidates.length > 0;
const dockerProbe = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'], { encoding: 'utf8', timeout: 5000 });
const dockerContextProbe = spawnSync('docker', ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'], { encoding: 'utf8', timeout: 5000 });
const dockerCli = {
  available: dockerProbe.status === 0,
  version: dockerProbe.status === 0 ? dockerProbe.stdout.trim() : null,
  host: dockerContextProbe.status === 0 ? dockerContextProbe.stdout.trim() : null,
  local: dockerContextProbe.status === 0 && /^unix:\/\//.test(dockerContextProbe.stdout.trim()),
};
const localDockerEnvironment = dockerCli.available && dockerCli.local
  ? {
      DOCKER_HOST: dockerCli.host,
      ...(dockerCli.host !== 'unix:///var/run/docker.sock' ? { TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE: '/var/run/docker.sock' } : {}),
    }
  : {};
for (const candidate of suiteCandidates) {
  candidate.execution.env = localDockerEnvironment;
}
const fullSuiteExecution = fs.existsSync(path.join(absoluteRoot, 'gradlew'))
  ? {
      cwd: '.',
      executable: './gradlew',
      argv: ['--no-daemon', 'test', '--rerun-tasks', '--continue'],
      resultXmlGlob: '**/build/test-results/*/TEST-*.xml',
      artifactMode: 'ephemeral',
      env: localDockerEnvironment,
    }
  : fs.existsSync(path.join(absoluteRoot, 'mvnw'))
    ? {
        cwd: '.',
        executable: './mvnw',
        argv: ['-fae', 'test'],
        resultXmlGlob: '**/target/{surefire,failsafe}-reports/TEST-*.xml',
        artifactMode: 'ephemeral',
        env: localDockerEnvironment,
      }
    : null;
const composeServices = [];
for (const file of composeFiles.sort()) {
  const content = read(file);
  const services = [];
  let inServices = false;
  let currentService = null;
  for (const line of content.split(/\r?\n/)) {
    if (/^services:\s*$/.test(line)) { inServices = true; continue; }
    if (inServices && /^\S/.test(line)) { inServices = false; currentService = null; }
    if (!inServices) continue;
    const serviceMatch = line.match(/^  ([\w.-]+):\s*$/);
    if (serviceMatch) {
      currentService = { name: serviceMatch[1], image: null };
      services.push(currentService);
      continue;
    }
    const imageMatch = line.match(/^    image:\s*["']?([^\s"']+)["']?\s*$/);
    if (currentService && imageMatch) currentService.image = imageMatch[1];
  }
  composeServices.push({ path: relative(file), services });
}
const recommendedExecution = !dockerCli.available || !dockerCli.local
  ? 'blocked-docker-runtime'
  : suiteCandidates.some((candidate) => !candidate.conditionalInfrastructureBypass)
    ? 'repository-suite'
    : suiteCandidates.length ? 'repair-conditional-bypass' : 'bootstrap-testcontainers-fixture';

process.stdout.write(`${JSON.stringify({
  schemaVersion: 1,
  detectorVersion: 3,
  repositoryRoot: absoluteRoot,
  primaryFramework,
  engines: {
    kotest: { detected: hasKotest, evidence: evidence.kotest, sourceEvidence: sourceEvidence.kotest },
    junitJupiter: { detected: hasJunit, evidence: evidence.junitJupiter, sourceEvidence: sourceEvidence.junitJupiter },
  },
  testcontainers: {
    dependencyDeclared: testcontainersDependency,
    declaredFixture: testcontainersDependency && testcontainersFixture,
    evidence: evidence.testcontainers,
  },
  infrastructure: {
    dockerCli,
    testcontainersRuntime: { status: 'unverified' },
    compose: composeServices,
    repositorySuiteCandidates: suiteCandidates,
    fullSuiteExecution,
    recommendedExecution,
  },
  inspectedFiles: filesRead,
  readBudget: {
    configurationFiles: selectedConfigurationFiles.length,
    testFilesRead: testContent.size,
    testFileLimit: 12,
    candidateScanTruncated: integrationCandidates.length > 6,
    discoveredIntegrationCandidates: integrationCandidates.length,
  },
  limitations: [
    'Docker CLI reachability is not Testcontainers runtime proof.',
    ...(integrationCandidates.length > 6 ? ['Only the first six deterministic integration candidates were expanded.'] : []),
  ],
}, null, 2)}\n`);
