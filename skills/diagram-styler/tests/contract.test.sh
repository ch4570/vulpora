#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/scripts/render-mermaid.js"
FIXTURES="$ROOT/tests/fixtures"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

require() {
  local file="$1" text="$2"
  grep -Fq -- "$text" "$file" || { echo "missing '$text' in $file" >&2; exit 1; }
}

test -x "$SCRIPT"
test -x "$FIXTURES/fake-mmdc.sh"
require "$ROOT/SKILL.md" 'name: diagram-styler'
require "$ROOT/SKILL.md" 'Never invoke `npx`'
require "$ROOT/SKILL.md" 'run the `pdf-qa` skill'
require "$ROOT/agents/openai.yaml" 'default_prompt: "Use $diagram-styler'
require "$ROOT/references/rendering-contract.md" 'do not use `npx`'
if grep -Fq 'npx' "$SCRIPT"; then
  echo 'render script must never invoke npx' >&2
  exit 1
fi

MMDC_BIN='/definitely/missing/mmdc' node "$SCRIPT" --preflight > "$WORK/preflight.json"
node -e '
  const data = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
  if (data.available !== false || data.runtime_download_allowed !== false) process.exit(1);
' "$WORK/preflight.json"

cp "$FIXTURES/simple.mmd" "$WORK/simple.mmd"
source_hash_before="$(node -e 'process.stdout.write(require("node:crypto").createHash("sha256").update(require("node:fs").readFileSync(process.argv[1])).digest("hex"))' "$WORK/simple.mmd")"
MMDC_BIN="$FIXTURES/fake-mmdc.sh" node "$SCRIPT" \
  --input "$WORK/simple.mmd" \
  --output "$WORK/simple.svg" \
  --theme light \
  --target document \
  --title 'Request validation' \
  --description 'Flowchart showing accepted and rejected request paths.' > "$WORK/render.json"
source_hash_after="$(node -e 'process.stdout.write(require("node:crypto").createHash("sha256").update(require("node:fs").readFileSync(process.argv[1])).digest("hex"))' "$WORK/simple.mmd")"
[[ "$source_hash_before" == "$source_hash_after" ]]

require "$WORK/simple.svg" 'role="img"'
require "$WORK/simple.svg" 'aria-labelledby="simple-title simple-desc"'
require "$WORK/simple.svg" '<title id="simple-title">Request validation</title>'
require "$WORK/simple.svg" 'max-width: 960px'
require "$WORK/simple.svg" 'background-color: #FFFFFF'

node -e '
  const fs = require("node:fs");
  const crypto = require("node:crypto");
  const manifest = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const source = fs.readFileSync(process.argv[2]);
  const artifact = fs.readFileSync(process.argv[3]);
  const digest = (value) => crypto.createHash("sha256").update(value).digest("hex");
  if (manifest.schema_version !== "visual-artifact.manifest/v1") process.exit(1);
  if (manifest.source.sha256 !== digest(source)) process.exit(1);
  if (manifest.artifact.sha256 !== digest(artifact)) process.exit(1);
  if (manifest.render.theme !== "light" || manifest.render.target !== "document") process.exit(1);
  if (manifest.qa.visual_inspection_required !== true) process.exit(1);
' "$WORK/simple.svg.manifest.json" "$WORK/simple.mmd" "$WORK/simple.svg"

MMDC_BIN="$FIXTURES/fake-mmdc.sh" node "$SCRIPT" \
  --input "$WORK/simple.mmd" \
  --output "$WORK/simple-dark.svg" \
  --target dark-ui \
  --title 'Request validation' \
  --description 'Flowchart showing accepted and rejected request paths.' > "$WORK/render-dark.json"
require "$WORK/simple-dark.svg" 'max-width: 1200px'
require "$WORK/simple-dark.svg" 'background-color: #111827'
node -e '
  const manifest = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
  if (manifest.render.theme !== "dark" || manifest.render.target !== "dark-ui") process.exit(1);
' "$WORK/simple-dark.svg.manifest.json"

if MMDC_BIN="$FIXTURES/fake-mmdc.sh" node "$SCRIPT" \
  --input "$FIXTURES/forbidden.mmd" \
  --output "$WORK/forbidden.svg" \
  --title 'Forbidden' \
  --description 'Must not render.' > "$WORK/forbidden.out" 2> "$WORK/forbidden.err"; then
  echo 'unsafe Mermaid source unexpectedly rendered' >&2
  exit 1
fi
require "$WORK/forbidden.err" 'click directives are not allowed'
test ! -e "$WORK/forbidden.svg"

if grep -Fq '[TODO' "$ROOT/SKILL.md"; then
  echo 'unfinished template marker found' >&2
  exit 1
fi

echo 'diagram-styler contract: PASS'
