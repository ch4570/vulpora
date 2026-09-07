#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/pdf-qa.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

require() {
  local file="$1" text="$2"
  grep -Fq -- "$text" "$file" || { echo "missing '$text' in $file" >&2; exit 1; }
}

test -s "$ROOT/SKILL.md"
test -s "$ROOT/agents/openai.yaml"
require "$ROOT/SKILL.md" 'name: pdf-qa'
require "$ROOT/SKILL.md" 'Never certify visual quality from PDF metadata, text extraction, OCR, or successful rendering alone.'
require "$ROOT/SKILL.md" 'Generate'
require "$ROOT/SKILL.md" 'view_image'
require "$ROOT/SKILL.md" 'status: pass'
require "$ROOT/agents/openai.yaml" 'default_prompt: "Use $pdf-qa'

"$ROOT/scripts/preflight.py" > "$TMP/preflight.json"

python3 - "$TMP/sample.pdf" <<'PY'
import sys

path = sys.argv[1]
objects = [
    b"<< /Type /Catalog /Pages 2 0 R >>",
    b"<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
    b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 7 0 R >> >> /Contents 5 0 R >>",
    b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>",
    b"<< /Length 53 >>\nstream\nBT /F1 18 Tf 36 120 Td (PDF QA sample one) Tj ET\nendstream",
    b"<< /Length 53 >>\nstream\nBT /F1 18 Tf 36 120 Td (PDF QA sample two) Tj ET\nendstream",
    b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
]
data = bytearray(b"%PDF-1.4\n")
offsets = [0]
for index, value in enumerate(objects, 1):
    offsets.append(len(data))
    data.extend(f"{index} 0 obj\n".encode())
    data.extend(value)
    data.extend(b"\nendobj\n")
xref = len(data)
data.extend(f"xref\n0 {len(objects) + 1}\n".encode())
data.extend(b"0000000000 65535 f \n")
for offset in offsets[1:]:
    data.extend(f"{offset:010d} 00000 n \n".encode())
data.extend(f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode())
open(path, "wb").write(data)
PY

"$ROOT/scripts/render-pages.py" \
  --input "$TMP/sample.pdf" \
  --output-dir "$TMP/qa" \
  --source-ref source.md > "$TMP/render.out"

python3 - "$TMP/qa/qa-manifest.json" "$TMP/inspection-pass.json" <<'PY'
import hashlib
import json
from pathlib import Path
import sys

manifest = json.load(open(sys.argv[1], encoding="utf-8"))
assert manifest["status"] == "revise"
assert manifest["inspection"]["complete"] is False
assert manifest["render"]["page_count"] == 2
assert manifest["render"]["rendered_page_count"] == 2
assert manifest["source"]["source_ref"] == "source.md"
manifest_dir = Path(sys.argv[1]).parent
pages = []
for rendered in manifest["render"]["pages"]:
    image = manifest_dir / rendered["image_path"]
    digest = hashlib.sha256(image.read_bytes()).hexdigest()
    number = rendered["page_number"]
    checks = {
        name: {"result": "pass", "detail": f"Page {number} visually checked for {name}."}
        for name in manifest["inspection"]["required_checks"]
    }
    pages.append({"page_number": number, "image_sha256": digest, "checks": checks})
inspection = {
    "schema_version": "pdf-qa.inspection/v1",
    "method": "visual_image_review",
    "inspector": "contract-test",
    "inspected_at": "2026-08-20T00:00:00Z",
    "pages": pages,
}
json.dump(inspection, open(sys.argv[2], "w", encoding="utf-8"), indent=2)
PY

"$ROOT/scripts/record-inspection.py" \
  --manifest "$TMP/qa/qa-manifest.json" \
  --inspection "$TMP/inspection-pass.json" \
  --output "$TMP/qa/qa-final-pass.json" > "$TMP/inspect.out"

python3 - "$TMP/qa/qa-final-pass.json" "$TMP/inspection-pass.json" "$TMP/inspection-fail.json" "$TMP/inspection-incomplete.json" <<'PY'
import json
import sys

final = json.load(open(sys.argv[1], encoding="utf-8"))
assert final["status"] == "pass"
assert final["inspection"]["complete"] is True
assert final["issues"] == []

inspection = json.load(open(sys.argv[2], encoding="utf-8"))
inspection["pages"][0]["checks"]["clipping"] = {
    "result": "fail",
    "detail": "Bottom line is visibly clipped.",
}
json.dump(inspection, open(sys.argv[3], "w", encoding="utf-8"), indent=2)

del inspection["pages"][0]["checks"]["table_spacing"]
json.dump(inspection, open(sys.argv[4], "w", encoding="utf-8"), indent=2)
PY

"$ROOT/scripts/record-inspection.py" \
  --manifest "$TMP/qa/qa-manifest.json" \
  --inspection "$TMP/inspection-fail.json" \
  --output "$TMP/qa/qa-final-revise.json" > "$TMP/revise.out"

python3 - "$TMP/qa/qa-final-revise.json" <<'PY'
import json
import sys
result = json.load(open(sys.argv[1], encoding="utf-8"))
assert result["status"] == "revise"
assert result["issues"] == [{
    "check": "clipping",
    "detail": "Bottom line is visibly clipped.",
    "page_number": 1,
}]
PY

if "$ROOT/scripts/record-inspection.py" \
  --manifest "$TMP/qa/qa-manifest.json" \
  --inspection "$TMP/inspection-incomplete.json" \
  --output "$TMP/qa/should-not-exist.json" > /dev/null 2>&1; then
  echo 'incomplete inspection unexpectedly passed' >&2
  exit 1
fi
test ! -e "$TMP/qa/should-not-exist.json"

echo 'pdf-qa contract: PASS'
