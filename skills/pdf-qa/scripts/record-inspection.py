#!/usr/bin/env python3
"""Validate page-level visual evidence and issue a final PDF QA manifest."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import sys
from typing import Any

REQUIRED_CHECKS = {
    "clipping",
    "overlap",
    "glyph_integrity",
    "page_balance",
    "table_spacing",
}
VISUAL_METHODS = {"visual_image_review", "vision_model_review", "human_visual_review"}
SHA256 = re.compile(r"^[a-f0-9]{64}$")
UTC_TIMESTAMP = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$")


def fail(message: str) -> None:
    raise RuntimeError(message)


def read_json(path: Path) -> Any:
    if not path.is_file() or path.is_symlink():
        fail(f"expected a regular, non-symlink JSON file: {path}")
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        fail(f"invalid JSON in {path}: {error}")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def require_keys(value: Any, expected: set[str], label: str) -> None:
    if not isinstance(value, dict) or set(value) != expected:
        fail(f"{label} must contain exactly: {', '.join(sorted(expected))}")


def validate_manifest(manifest: Any) -> list[dict[str, Any]]:
    if not isinstance(manifest, dict) or manifest.get("schema_version") != "pdf-qa.manifest/v1":
        fail("unsupported render manifest")
    if manifest.get("status") != "revise" or manifest.get("inspection", {}).get("complete") is not False:
        fail("input must be an uninspected render manifest")
    render = manifest.get("render")
    if not isinstance(render, dict) or not isinstance(render.get("pages"), list):
        fail("render manifest pages are missing")
    pages = render["pages"]
    if render.get("page_count") != len(pages) or render.get("rendered_page_count") != len(pages) or not pages:
        fail("render manifest does not cover every PDF page")
    if manifest.get("structural_checks", {}).get("page_count_matches") is not True:
        fail("page count structural check failed")
    if manifest.get("structural_checks", {}).get("all_png_dimensions_positive") is not True:
        fail("PNG dimension structural check failed")
    return pages


def main() -> int:
    parser = argparse.ArgumentParser(description="Record explicit visual inspection for a PDF render manifest")
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--inspection", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    manifest_path = args.manifest.expanduser().resolve()
    inspection_path = args.inspection.expanduser().resolve()
    output_path = args.output.expanduser().resolve()
    if output_path.exists():
        fail(f"refusing to overwrite existing output: {output_path}")
    if output_path in {manifest_path, inspection_path}:
        fail("--output must preserve the render manifest and inspection record")

    manifest = read_json(manifest_path)
    pages = validate_manifest(manifest)
    inspection = read_json(inspection_path)
    require_keys(inspection, {"schema_version", "method", "inspector", "inspected_at", "pages"}, "inspection")
    if inspection["schema_version"] != "pdf-qa.inspection/v1":
        fail("unsupported inspection schema")
    if inspection["method"] not in VISUAL_METHODS:
        fail("inspection method must be an approved visual review method")
    if not isinstance(inspection["inspector"], str) or not inspection["inspector"].strip():
        fail("inspector must not be blank")
    if not isinstance(inspection["inspected_at"], str) or not UTC_TIMESTAMP.fullmatch(inspection["inspected_at"]):
        fail("inspected_at must be a UTC timestamp ending in Z")
    if not isinstance(inspection["pages"], list):
        fail("inspection pages must be an array")

    rendered_by_number = {page.get("page_number"): page for page in pages}
    if set(rendered_by_number) != set(range(1, len(pages) + 1)):
        fail("rendered pages must be numbered consecutively")
    inspected_by_number: dict[int, dict[str, Any]] = {}
    issues = []

    for page in inspection["pages"]:
        require_keys(page, {"page_number", "image_sha256", "checks"}, "inspection page")
        number = page["page_number"]
        if not isinstance(number, int) or number in inspected_by_number or number not in rendered_by_number:
            fail("inspection page numbers must uniquely match rendered pages")
        if not isinstance(page["image_sha256"], str) or not SHA256.fullmatch(page["image_sha256"]):
            fail(f"page {number} has an invalid image digest")
        if page["image_sha256"] != rendered_by_number[number].get("image_sha256"):
            fail(f"page {number} inspection refers to stale render evidence")
        checks = page["checks"]
        require_keys(checks, REQUIRED_CHECKS, f"page {number} checks")
        for check_name, result in checks.items():
            require_keys(result, {"result", "detail"}, f"page {number} {check_name}")
            if result["result"] not in {"pass", "fail"}:
                fail(f"page {number} {check_name} result must be pass or fail")
            if not isinstance(result["detail"], str) or not result["detail"].strip():
                fail(f"page {number} {check_name} requires page-specific detail")
            if result["result"] == "fail":
                issues.append({
                    "page_number": number,
                    "check": check_name,
                    "detail": result["detail"],
                })
        inspected_by_number[number] = page

    if set(inspected_by_number) != set(rendered_by_number):
        fail("inspection must cover every rendered page")

    final_manifest = dict(manifest)
    final_manifest["status"] = "pass" if not issues else "revise"
    final_manifest["inspection"] = {
        "complete": True,
        "required_checks": sorted(REQUIRED_CHECKS),
        "method": inspection["method"],
        "inspector": inspection["inspector"],
        "inspected_at": inspection["inspected_at"],
        "record_ref": os.path.relpath(inspection_path, output_path.parent),
        "record_sha256": sha256_file(inspection_path),
        "render_manifest_ref": os.path.relpath(manifest_path, output_path.parent),
        "render_manifest_sha256": sha256_file(manifest_path),
        "pages": [inspected_by_number[number] for number in sorted(inspected_by_number)],
    }
    final_manifest["issues"] = issues

    output_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = output_path.with_name(f".{output_path.name}.tmp")
    with temporary.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(final_manifest, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")
    os.replace(temporary, output_path)
    print(str(output_path))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, RuntimeError, ValueError) as error:
        print(f"pdf-qa inspection failed: {error}", file=sys.stderr)
        raise SystemExit(1)
