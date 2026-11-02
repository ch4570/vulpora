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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vulpora-type-use-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  fs.writeFileSync(path.join(root, 'build.gradle.kts'), 'plugins { id("org.springframework.boot") }\n');
  return root;
}

function write(root, relative, content) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, content);
}

function run(root) {
  return spawnSync(process.execPath, [discover, root, contract], {encoding: 'utf8'});
}

function surfaces(root) {
  const result = run(root);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout).surfaces;
}

const javaController = `package app;
@RestController
class ApplyController {
  @PostMapping("/apply")
  public String apply(@Valid @RequestBody ApplyReq req) { return "ok"; }
}
`;

test('Java record element validation keeps top-level constraints on their own component', t => {
  const root = fixture(t);
  write(root, 'src/main/java/app/ApplyReq.java', `package app;
public record ApplyReq(
    @NotBlank String title,
    @NotNull @Size(max = 50) List<@Valid @NotNull Target> targets,
    Map<String, @NotBlank String> labels,
    Long parentId
) {}
`);
  write(root, 'src/main/java/app/ApplyController.java', javaController);
  assert.deepEqual(surfaces(root)[0].required_behaviors, [
    'HAPPY', 'VALIDATION-FAIL-TARGETS-NOT-NULL', 'VALIDATION-FAIL-TARGETS-SIZE', 'VALIDATION-FAIL-TITLE-NOT-BLANK',
  ]);
});

test('Kotlin element validation does not attach to the next property', t => {
  const root = fixture(t);
  write(root, 'src/main/kotlin/app/ApplyReq.kt', `package app
data class ApplyReq(
    @field:Size(max = 50) val targets: List<@Valid @NotNull Target>,
    val parentId: Long?,
)
`);
  write(root, 'src/main/kotlin/app/ApplyController.kt', `package app
@RestController
class ApplyController {
  @PostMapping("/apply")
  fun apply(@Valid @RequestBody req: ApplyReq): String = "ok"
}
`);
  assert.deepEqual(surfaces(root)[0].required_behaviors, ['HAPPY', 'VALIDATION-FAIL-TARGETS-SIZE']);
});

test('Component-level nested @Valid still requires unsupported type resolution', t => {
  const root = fixture(t);
  write(root, 'src/main/java/app/ApplyReq.java',
    'package app;\npublic record ApplyReq(@NotBlank String title, @Valid Target target) {}\n');
  write(root, 'src/main/java/app/ApplyController.java', javaController);
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /SCA-5\.2: .*request type ApplyReq: inherited, generic, or nested validation/);
});

test('Spring Boot error controllers are excluded while method-less mappings elsewhere still fail', t => {
  const root = fixture(t);
  write(root, 'src/main/java/app/CustomErrorController.java', `package app;
@Controller
public class CustomErrorController implements ErrorController {
  @RequestMapping("\${server.error.path:\${error.path:/error}}")
  public ResponseEntity<Object> handle(HttpServletRequest request) { return null; }
}
`);
  write(root, 'src/main/java/app/ApplyReq.java', 'package app;\npublic record ApplyReq(@NotBlank String title) {}\n');
  write(root, 'src/main/java/app/ApplyController.java', javaController);
  assert.deepEqual(surfaces(root).map(surface => surface.target), ['POST /apply (:)']);

  write(root, 'src/main/java/app/OtherController.java', `package app;
@RestController
class OtherController {
  @RequestMapping("/any")
  public String any() { return "ok"; }
}
`);
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /method-level @RequestMapping requires explicit HTTP method resolution/);
});
