'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const discover = path.resolve(__dirname, '../scripts/discover-surfaces.js');
const contract = path.resolve(__dirname, '../reference/e2e-scenario-contract.md');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vulpora-dto-resolution-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  return root;
}

function write(root, relative, content) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, content);
  return file;
}

function run(root) {
  return spawnSync(process.execPath, [discover, root, contract], {encoding: 'utf8'});
}

function surfaces(root) {
  const result = run(root);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout).surfaces;
}

function rejects(root) {
  const result = run(root);
  assert.notEqual(result.status, 0, 'unproven DTO resolution must not succeed');
  assert.match(result.stderr, /SCA-5\.2: .*:\d+:/);
}

function spring(root, module, namespace, {java = false, constrained = true, samePackage = false} = {}) {
  const prefix = module ? `${module}/` : '';
  const language = java ? 'java' : 'kotlin';
  const extension = java ? 'java' : 'kt';
  const dtoPackage = `${namespace}.dto`;
  const controllerPackage = samePackage ? dtoPackage : `${namespace}.web`;
  write(root, `${prefix}build.gradle.kts`, 'plugins { id("org.springframework.boot") }\n');
  const dto = write(root, `${prefix}src/main/${language}/${dtoPackage.replaceAll('.', '/')}/CreateRequest.${extension}`,
    java
      ? `package ${dtoPackage};\nimport jakarta.validation.constraints.NotBlank;\npublic class CreateRequest {\n ${constrained ? '@NotBlank ' : ''}public String title;\n}\n`
      : `package ${dtoPackage}\nimport jakarta.validation.constraints.Min\ndata class CreateRequest(${constrained ? '@field:Min(1) ' : ''}val quantity: Int)\n`);
  const imports = samePackage ? '' : `import ${dtoPackage}.CreateRequest${java ? ';' : ''}\n`;
  const controller = write(root, `${prefix}src/main/${language}/${controllerPackage.replaceAll('.', '/')}/AppController.${extension}`,
    `package ${controllerPackage}${java ? ';' : ''}\n${imports}@RestController\nclass AppController {\n @PostMapping("/${namespace}")\n `
      + (java ? 'public String create(@Valid @RequestBody CreateRequest request) { return "ok"; }'
        : 'fun create(@Valid @RequestBody request: CreateRequest): String = "ok"') + '\n}\n');
  return {dto, controller};
}

test('Spring resolves independent Java/Kotlin modules both alone and together', t => {
  const root = fixture(t);
  spring(root, 'alpha', 'alpha', {java: true});
  spring(root, 'beta', 'beta');
  assert.deepEqual(surfaces(path.join(root, 'alpha'))[0].required_behaviors, ['HAPPY', 'VALIDATION-FAIL-TITLE-NOT-BLANK']);
  assert.deepEqual(surfaces(path.join(root, 'beta'))[0].required_behaviors, ['HAPPY', 'VALIDATION-FAIL-QUANTITY-MIN']);
  const combined = surfaces(root);
  assert.deepEqual(combined.map(s => s.required_behaviors), [
    ['HAPPY', 'VALIDATION-FAIL-TITLE-NOT-BLANK'], ['HAPPY', 'VALIDATION-FAIL-QUANTITY-MIN'],
  ]);
});

test('Spring distinguishes same-module packages and known unconstrained DTOs', t => {
  const root = fixture(t);
  spring(root, '', 'alpha', {java: true});
  spring(root, '', 'beta', {constrained: false});
  assert.deepEqual(surfaces(root).map(s => s.required_behaviors), [
    ['HAPPY', 'VALIDATION-FAIL-TITLE-NOT-BLANK'], ['HAPPY'],
  ]);
});

test('Spring resolves same-package DTOs without importing them', t => {
  const root = fixture(t);
  spring(root, 'alpha', 'alpha', {java: true, samePackage: true});
  spring(root, 'beta', 'beta', {samePackage: true});
  assert.equal(surfaces(root).length, 2);
});

test('Spring combines scalar constraints with validated DTO constraints', t => {
  const root = fixture(t);
  const {controller} = spring(root, '', 'alpha');
  fs.writeFileSync(controller, fs.readFileSync(controller, 'utf8')
    .replace('request: CreateRequest)', 'request: CreateRequest, @Min(1) page: Int)'));
  assert.deepEqual(surfaces(root)[0].required_behaviors, [
    'HAPPY', 'VALIDATION-FAIL-PAGE-MIN', 'VALIDATION-FAIL-QUANTITY-MIN',
  ]);
});

for (const suffix of ['', ' // trailing comment', ' /* trailing comment */']) {
  test(`Spring aliases cannot fall through to a local shadow or scalar validation: ${suffix}`, t => {
    const root = fixture(t);
    const {controller} = spring(root, '', 'alpha');
    write(root, 'src/main/kotlin/alpha/web/Input.kt', 'package alpha.web\nclass Input {}\n');
    fs.writeFileSync(controller, fs.readFileSync(controller, 'utf8')
      .replace('import alpha.dto.CreateRequest', `import alpha.dto.CreateRequest as Input${suffix}`)
      .replace('request: CreateRequest)', `request: Input${suffix ? '' : ', @Min(1) page: Int'})`));
    rejects(root);
  });
}

test('A bodyless Kotlin DTO does not adopt the next declaration constraints', t => {
  const root = fixture(t);
  const {dto} = spring(root, '', 'alpha');
  fs.writeFileSync(dto, 'package alpha.dto\nclass CreateRequest\nclass Foreign { @field:NotBlank val foreignName: String = "" }\n');
  assert.deepEqual(surfaces(root)[0].required_behaviors, ['HAPPY']);
});

test('Nested declarations do not shadow a top-level DTO qualified name', t => {
  const root = fixture(t);
  spring(root, '', 'alpha');
  write(root, 'src/main/kotlin/alpha/dto/Holder.kt', 'package alpha.dto\nclass Holder { class CreateRequest {} }\n');
  assert.deepEqual(surfaces(root)[0].required_behaviors, ['HAPPY', 'VALIDATION-FAIL-QUANTITY-MIN']);
});

test('Spring annotation examples inside comments and strings are not request metadata', t => {
  const root = fixture(t);
  const {controller} = spring(root, '', 'alpha');
  fs.writeFileSync(controller, fs.readFileSync(controller, 'utf8')
    .replace('"ok"', '"@Valid @Min(1) ghost: Int"') + '\n// @Valid ignored: MissingRequest\n');
  assert.deepEqual(surfaces(root)[0].required_behaviors, ['HAPPY', 'VALIDATION-FAIL-QUANTITY-MIN']);
});

for (const token of ['import', 'package']) {
  test(`Kotlin multiline-string ${token} examples cannot select a foreign DTO`, t => {
    const root = fixture(t);
    const {controller, dto} = spring(root, '', 'alpha', {samePackage: true});
    spring(root, '', 'foreign', {constrained: false});
    let source = fs.readFileSync(controller, 'utf8');
    if (token === 'package') {
      source = source.replace('package alpha.dto\n', '');
      fs.writeFileSync(dto, fs.readFileSync(dto, 'utf8').replace('package alpha.dto\n', ''));
    }
    source = source.replace('"ok"', `"""\n${token} foreign.dto${token === 'import' ? '.CreateRequest' : ''}\n"""`);
    fs.writeFileSync(controller, source);
    assert.deepEqual(surfaces(root).find(s => s.path === '/alpha').required_behaviors,
      ['HAPPY', 'VALIDATION-FAIL-QUANTITY-MIN']);
  });
}

for (const kind of ['missing-import', 'alias', 'qualified', 'cross-module-fqn', 'inheritance']) {
  test(`Spring refuses ${kind} instead of guessing a global simple name`, t => {
    const root = fixture(t);
    const {controller, dto} = spring(root, 'alpha', 'alpha');
    if (kind === 'cross-module-fqn') spring(root, 'beta', 'alpha');
    else if (kind === 'inheritance') fs.writeFileSync(dto, 'package alpha.dto\nclass CreateRequest : BaseRequest() {}\n');
    else {
      let source = fs.readFileSync(controller, 'utf8');
      if (kind === 'missing-import') source = source.replace('import alpha.dto.CreateRequest', 'import missing.dto.CreateRequest');
      if (kind === 'alias') source = source.replace('import alpha.dto.CreateRequest', 'import alpha.dto.CreateRequest as Input').replace('request: CreateRequest', 'request: Input');
      if (kind === 'qualified') source = source.replace('request: CreateRequest', 'request: alpha.dto.CreateRequest');
      fs.writeFileSync(controller, source);
    }
    rejects(root);
  });
}

for (const fields of ['@NotBlank String title', '@NotBlank String title, @NotBlank String name']) {
  test(`Java record preserves its final constrained component: ${fields}`, t => {
    const root = fixture(t);
    const {dto} = spring(root, '', 'alpha', {java: true});
    fs.writeFileSync(dto, `package alpha.dto;\nimport jakarta.validation.constraints.NotBlank;\npublic record CreateRequest(${fields}) {}\n`);
    const expected = ['HAPPY', 'VALIDATION-FAIL-TITLE-NOT-BLANK'];
    if (fields.includes('name')) expected.push('VALIDATION-FAIL-NAME-NOT-BLANK');
    assert.deepEqual(surfaces(root)[0].required_behaviors, expected.sort());
  });
}

function nest(root, module, name, {constrained = true, localPipe = false, directory = ''} = {}) {
  const prefix = module ? `${module}/` : '';
  write(root, `${prefix}package.json`, JSON.stringify({name: module || 'api', dependencies: {'@nestjs/common': '*', '@nestjs/core': '*'}}));
  const sourcePrefix = `${prefix}src/${directory ? `${directory}/` : ''}`;
  const dto = write(root, `${sourcePrefix}create-request.dto.ts`,
    `import { IsNotEmpty } from 'class-validator';\nexport class CreateRequest {\n ${constrained ? '@IsNotEmpty()\n ' : ''}${name}!: string;\n}\n`);
  const controller = write(root, `${sourcePrefix}app.controller.ts`,
    `import { Body, Controller, Post, UsePipes, ValidationPipe } from '@nestjs/common';\nimport { CreateRequest } from './create-request.dto';\n@Controller('${name}')\nexport class AppController {\n @Post()\n${localPipe ? ' @UsePipes(new ValidationPipe())\n' : ''} create(@Body() request: CreateRequest) { return request; }\n}\n`);
  if (!localPipe) write(root, `${prefix}src/main.ts`, 'app.useGlobalPipes(new ValidationPipe());\n');
  return {dto, controller};
}

for (const localPipe of [false, true]) {
  test(`Nest uses direct relative DTO imports with ${localPipe ? 'handler' : 'global'} validation`, t => {
    const root = fixture(t);
    nest(root, 'alpha', 'alpha', {localPipe});
    nest(root, 'beta', 'beta', {localPipe});
    assert.deepEqual(surfaces(root).map(s => s.required_behaviors), [
      ['HAPPY', 'VALIDATION-FAIL-ALPHA-NOT-EMPTY'], ['HAPPY', 'VALIDATION-FAIL-BETA-NOT-EMPTY'],
    ]);
  });
}

test('Nest distinguishes same-package DTO paths including an unconstrained DTO', t => {
  const root = fixture(t);
  nest(root, '', 'alpha', {directory: 'alpha'});
  nest(root, '', 'beta', {directory: 'beta', constrained: false});
  assert.deepEqual(surfaces(root).map(s => s.required_behaviors), [
    ['HAPPY', 'VALIDATION-FAIL-ALPHA-NOT-EMPTY'], ['HAPPY'],
  ]);
});

for (const constrained of [false, true]) for (const exported of [false, true]) {
  test(`Nest preserves a proven same-file DTO (constrained=${constrained}, exported=${exported})`, t => {
    const root = fixture(t);
    const {controller, dto} = nest(root, '', 'alpha', {constrained});
    const declaration = fs.readFileSync(dto, 'utf8').replace('export class', exported ? 'export class' : 'class');
    fs.writeFileSync(controller, fs.readFileSync(controller, 'utf8')
      .replace("import { CreateRequest } from './create-request.dto';\n", '') + '\n' + declaration);
    fs.unlinkSync(dto);
    assert.deepEqual(surfaces(root)[0].required_behaviors,
      constrained ? ['HAPPY', 'VALIDATION-FAIL-ALPHA-NOT-EMPTY'] : ['HAPPY']);
  });
}

test('Nest refuses a same-file declaration conflicting with an import', t => {
  const root = fixture(t);
  const {controller} = nest(root, '', 'alpha');
  fs.appendFileSync(controller, '\nclass CreateRequest {}\n');
  rejects(root);
});

test('Nest annotation examples inside comments and strings are not request metadata', t => {
  const root = fixture(t);
  const {controller} = nest(root, '', 'alpha');
  fs.writeFileSync(controller, fs.readFileSync(controller, 'utf8')
    .replace('return request', 'return "@Body() ignored: MissingRequest"') + '\n// @Body() ignored: MissingRequest\n');
  assert.deepEqual(surfaces(root)[0].required_behaviors, ['HAPPY', 'VALIDATION-FAIL-ALPHA-NOT-EMPTY']);
});

test('A Nest template-string import example is not an actual DTO import', t => {
  const root = fixture(t);
  const {controller} = nest(root, '', 'alpha');
  fs.writeFileSync(controller, fs.readFileSync(controller, 'utf8')
    .replace("import { CreateRequest } from './create-request.dto';\n", '')
    .replace('return request', "return `\nimport { CreateRequest } from './create-request.dto';\n`"));
  rejects(root);
});

for (const kind of ['missing-import', 'alias', 'qualified', 'package-import', 're-export', 'inheritance']) {
  test(`Nest refuses ${kind} instead of guessing a global simple name`, t => {
    const root = fixture(t);
    const {controller, dto} = nest(root, '', 'alpha');
    let source = fs.readFileSync(controller, 'utf8');
    if (kind === 'missing-import') source = source.replace("'./create-request.dto'", "'./missing.dto'");
    if (kind === 'alias') source = source.replace('{ CreateRequest }', '{ CreateRequest as Input }').replace('request: CreateRequest', 'request: Input');
    if (kind === 'qualified') source = source.replace('request: CreateRequest', 'request: types.CreateRequest');
    if (kind === 'package-import') source = source.replace("'./create-request.dto'", "'@shared/dto'");
    if (kind === 're-export') {
      write(root, 'src/index.ts', "export { CreateRequest } from './create-request.dto';\n");
      source = source.replace("'./create-request.dto'", "'./index'");
    }
    if (kind === 'inheritance') fs.writeFileSync(dto, 'export class CreateRequest extends BaseRequest {}\n');
    fs.writeFileSync(controller, source);
    rejects(root);
  });
}
