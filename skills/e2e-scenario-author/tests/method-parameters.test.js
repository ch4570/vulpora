'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const discover = path.resolve(__dirname, '../scripts/discover-surfaces.js');
const contract = path.resolve(__dirname, '../reference/e2e-scenario-contract.md');

function run(t, language, content) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vulpora-method-parameters-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const file = path.join(root, `src/main/${language}/sample/AppController.${language === 'java' ? 'java' : 'kt'}`);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, content);
  fs.writeFileSync(path.join(root, 'build.gradle.kts'), 'plugins { id("org.springframework.boot") }\n');
  return spawnSync(process.execPath, [discover, root, contract], {encoding: 'utf8'});
}

function source(language, methods, before = '', after = '') {
  const java = language === 'java';
  return `package sample${java ? ';' : ''}\n${before}@RestController\n@Validated\nclass AppController {\n${methods}\n}\n${after}`;
}

function dto(language, name = 'CreateRequest', field = 'title') {
  return language === 'java'
    ? `class ${name} { @NotBlank String ${field}; }\n`
    : `data class ${name}(@field:NotBlank val ${field}: String)\n`;
}

function endpoint(language, parameters = '', body = '', name = 'endpoint', route = '/items') {
  return `@PostMapping("${route}")\n` + (language === 'java'
    ? `public String ${name}(${parameters}) { ${body} return "ok"; }`
    : `fun ${name}(${parameters}): String { ${body}\nreturn "ok" }`);
}

function inventory(result) {
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout).surfaces;
}

for (const language of ['java', 'kotlin']) {
  for (const scenario of ['plain', 'unused-before', 'unused-after', 'scalar', 'scalar-and-unused-after', 'local-class', 'referenced-before', 'referenced-after', 'referenced-and-unused-after']) {
    test(`${language} validation belongs to formal parameters: ${scenario}`, t => {
      const java = language === 'java';
      const scalar = scenario.startsWith('scalar');
      const referenced = scenario.startsWith('referenced');
      const unused = dto(language, 'Unused', 'unrelatedName');
      const before = scenario === 'unused-before' ? unused : scenario === 'referenced-before' ? dto(language) : '';
      const after = (referenced && scenario !== 'referenced-before' ? dto(language) : '')
        + (scenario.includes('unused-after') ? unused : '');
      const parameters = scalar ? (java ? '@Min(1) @RequestParam int page' : '@Min(1) @RequestParam page: Int')
        : referenced ? (java ? '@Valid @RequestBody CreateRequest request' : '@Valid @RequestBody request: CreateRequest') : '';
      const local = scenario === 'local-class' ? dto(language, 'Local', 'internalName') : '';
      const expected = ['HAPPY'];
      if (scalar) expected.push('VALIDATION-FAIL-PAGE-MIN');
      if (referenced) expected.push('VALIDATION-FAIL-TITLE-NOT-BLANK');
      const content = source(language, endpoint(language, parameters, local), before, after);
      const actual = inventory(run(t, language, content));
      assert.deepEqual(actual[0].required_behaviors, expected);
      assert.equal(actual[0].source.split(':').at(-1), String(content.slice(0, content.indexOf('@PostMapping')).split('\n').length));
    });
  }

  test(`${language} balances annotation arguments, literals and comments before parsing parameters`, t => {
    const java = language === 'java';
    const annotations = java
      ? '@Audit(nested = @Nested(value = ")"), labels = {"(", ")"})'
      : '@Audit(nested = Nested(")"), labels = ["(", ")"])';
    const parameters = java
      ? '@Min(value = 1) @RequestParam(name = "page)", defaultValue = "f(x)") int page, /* ) */ @Valid @RequestBody CreateRequest request'
      : '@Min(1) @RequestParam(name = "page)", defaultValue = "f(x)") page: Int, /* ) */ @Valid @RequestBody request: CreateRequest';
    const method = endpoint(language, parameters).replace('@PostMapping("/items")', `@PostMapping("/items")\n${annotations}\n// not a signature: fake(\n`);
    assert.deepEqual(inventory(run(t, language, source(language, method, dto(language))))[0].required_behaviors,
      ['HAPPY', 'VALIDATION-FAIL-PAGE-MIN', 'VALIDATION-FAIL-TITLE-NOT-BLANK']);
  });

  test(`${language} multiple endpoints keep their own parameters and mapping source lines`, t => {
    const java = language === 'java';
    const first = endpoint(language, java ? '@Min(1) int page' : '@Min(1) page: Int', '', 'first', '/first');
    const second = endpoint(language, java ? '@Valid CreateRequest request' : '@Valid request: CreateRequest', '', 'second', '/second');
    const content = source(language, `${first}\n${second}`, dto(language), dto(language, 'Unused', 'unrelatedName'));
    const actual = inventory(run(t, language, content));
    assert.deepEqual(actual.map(surface => surface.required_behaviors), [
      ['HAPPY', 'VALIDATION-FAIL-PAGE-MIN'], ['HAPPY', 'VALIDATION-FAIL-TITLE-NOT-BLANK'],
    ]);
    for (const surface of actual) {
      const mapping = `@PostMapping("${surface.path}")`;
      assert.equal(surface.source.split(':').at(-1), String(content.slice(0, content.indexOf(mapping)).split('\n').length));
    }
  });

  test(`${language} rejects an ambiguous mapped field without searching into a later handler`, t => {
    const field = language === 'java' ? 'String notAHandler = "value";' : 'val notAHandler = "value"';
    const content = source(language, `@PostMapping("/ambiguous")\n${field}\n${endpoint(language, '', '', 'realHandler', '/real')}`);
    const result = run(t, language, content);
    assert.notEqual(result.status, 0, 'an unproven signature must not produce an inventory');
    assert.match(result.stderr, /SCA-5\.2: .*:\d+: .*handler parameter/);
    assert.equal(result.stdout, '');
  });
}

for (const ending of [': String = "ok"', ':\n  java.util.List<String> { return listOf("ok") }']) {
  test(`Kotlin multiline suspend handler accepts an explicit return type: ${ending}`, t => {
    const method = `@PostMapping("/items")\nsuspend fun endpoint(\n @Min(1) page: Int,\n @Valid @RequestBody request: CreateRequest\n)${ending}`;
    const content = source('kotlin', method, dto('kotlin'), dto('kotlin', 'Unused', 'unrelatedName'));
    assert.deepEqual(inventory(run(t, 'kotlin', content))[0].required_behaviors,
      ['HAPPY', 'VALIDATION-FAIL-PAGE-MIN', 'VALIDATION-FAIL-TITLE-NOT-BLANK']);
  });
}

test('Java keeps its final annotated parameter with a generic return type and throws clause', t => {
  const method = '@PostMapping("/items")\npublic java.util.List<String> endpoint(@Valid CreateRequest request, @Min(1) int page) throws IllegalStateException { return null; }';
  assert.deepEqual(inventory(run(t, 'java', source('java', method, dto('java'))))[0].required_behaviors,
    ['HAPPY', 'VALIDATION-FAIL-PAGE-MIN', 'VALIDATION-FAIL-TITLE-NOT-BLANK']);
});

test('Java annotation-array braces remain inside the parameter annotation', t => {
  const method = endpoint('java', '@Marker(values = {"(", ")"}) @Min(1) int page');
  assert.deepEqual(inventory(run(t, 'java', source('java', method)))[0].required_behaviors,
    ['HAPPY', 'VALIDATION-FAIL-PAGE-MIN']);
});

test('Kotlin executable default arguments fail closed instead of contributing local constraints', t => {
  const method = '@PostMapping("/items")\nfun endpoint(callback: () -> Unit = { class Local { @field:NotBlank val internalName: String = "" } }): String = "ok"';
  const result = run(t, 'kotlin', source('kotlin', method));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /SCA-5\.2: .*:\d+: .*handler parameter/);
  assert.equal(result.stdout, '');
});
