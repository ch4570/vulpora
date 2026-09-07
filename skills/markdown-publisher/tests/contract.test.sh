#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
TMP=$(mktemp -d "${TMPDIR:-/tmp}/markdown-publisher.XXXXXX")
trap 'rm -rf "$TMP"' EXIT

pass=0
fail=0

ok() {
  pass=$((pass + 1))
  printf 'PASS: %s\n' "$1"
}

not_ok() {
  fail=$((fail + 1))
  printf 'FAIL: %s\n' "$1" >&2
}

expect() {
  local name=$1
  shift
  if "$@"; then ok "$name"; else not_ok "$name"; fi
}

SOURCE="$TMP/input.md"
printf '%s\n' \
  '# 한글 기술 보고서' \
  '' \
  '안전한 **문서**와 `코드`를 발행한다. <script>alert(1)</script>' \
  '' \
  '> [!NOTE]' \
  '> PDF는 시각 검수를 통과해야 한다.' \
  '' \
  '| 항목 | 상태 |' \
  '| --- | --- |' \
  '| 원본 | 보존 |' \
  '' \
  '```kotlin' \
  'val message = "안녕하세요"' \
  '```' > "$SOURCE"

for theme in executive technical minimal; do
  node "$ROOT/scripts/publish.mjs" \
    --input "$SOURCE" \
    --output-dir "$TMP/$theme" \
    --theme "$theme" >/dev/null
done

expect 'three themes emit artifacts' test -f "$TMP/executive/report.html"
expect 'source copy is byte-identical' cmp -s "$SOURCE" "$TMP/technical/source.md"
expect 'Korean content survives HTML render' grep -q '한글 기술 보고서' "$TMP/minimal/report.html"
expect 'raw HTML is escaped' grep -q '&lt;script&gt;alert(1)&lt;/script&gt;' "$TMP/minimal/report.html"
expect 'table styling is emitted' grep -q '<table>' "$TMP/minimal/report.html"
expect 'callout styling is emitted' grep -q 'callout-note' "$TMP/minimal/report.html"
expect 'theme is embedded' grep -q 'data-theme="executive"' "$TMP/executive/report.html"
expect 'no external stylesheet or script tag' sh -c "! grep -Eq '<link|<script[[:space:]][^>]*src=' '$TMP/technical/report.html'"

expect 'HTML-only manifest validates' node -e '
  const fs = require("fs");
  const data = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  if (data.schema !== "markdown-publisher.artifact/v1") process.exit(1);
  if (data.source.path !== "source.md" || data.html.path !== "report.html") process.exit(1);
  if (data.pdf !== null || data.qa.required || data.qa.status !== "not_applicable") process.exit(1);
  if (!/^[a-f0-9]{64}$/.test(data.source.sha256)) process.exit(1);
' "$TMP/minimal/artifact-manifest.json"

if node "$ROOT/scripts/publish.mjs" --input "$SOURCE" --output-dir "$TMP/minimal" --theme minimal >/dev/null 2>&1; then
  not_ok 'existing artifacts fail closed'
else
  ok 'existing artifacts fail closed'
fi

printf '%s\n' '# bad' '![remote](https://example.com/a.png)' > "$TMP/image.md"
if node "$ROOT/scripts/publish.mjs" --input "$TMP/image.md" --output-dir "$TMP/image-out" >/dev/null 2>&1; then
  not_ok 'image syntax fails self-contained contract'
else
  ok 'image syntax fails self-contained contract'
fi

if node "$ROOT/scripts/render-pdf.mjs" --preflight --browser "$TMP/not-a-browser" >/dev/null 2>&1; then
  not_ok 'invalid browser preflight fails closed'
else
  ok 'invalid browser preflight fails closed'
fi

if BROWSER=$(node "$ROOT/scripts/render-pdf.mjs" --preflight 2>/dev/null); then
  node "$ROOT/scripts/publish.mjs" \
    --input "$SOURCE" \
    --output-dir "$TMP/pdf" \
    --theme technical \
    --browser "$BROWSER" \
    --pdf >/dev/null
  expect 'PDF has a valid signature' sh -c "test \"\$(head -c 5 '$TMP/pdf/report.pdf')\" = '%PDF-'"
  expect 'PDF manifest requires pdf-qa' node -e '
    const fs = require("fs");
    const data = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    if (!data.pdf || data.qa.required !== true || data.qa.status !== "pending") process.exit(1);
    if (data.qa.next_skill !== "pdf-qa" || data.renderer.kind !== "local-chromium") process.exit(1);
    if (!["normal", "bounded-termination-after-complete-pdf"].includes(data.renderer.exit_mode)) process.exit(1);
  ' "$TMP/pdf/artifact-manifest.json"
else
  printf 'SKIP: local Chromium-family browser unavailable; PDF integration not run\n'
fi

printf 'RESULT: PASS=%d FAIL=%d\n' "$pass" "$fail"
test "$fail" -eq 0
