#!/usr/bin/env python3
"""Render every PDF page and emit a non-self-certifying QA manifest."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import struct
import subprocess
import sys
from typing import Any

REQUIRED_CHECKS = [
    "clipping",
    "overlap",
    "glyph_integrity",
    "page_balance",
    "table_spacing",
]


def fail(message: str) -> None:
    raise RuntimeError(message)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def png_size(path: Path) -> tuple[int, int]:
    with path.open("rb") as handle:
        header = handle.read(24)
    if len(header) != 24 or header[:8] != b"\x89PNG\r\n\x1a\n" or header[12:16] != b"IHDR":
        fail(f"renderer did not create a valid PNG: {path}")
    return struct.unpack(">II", header[16:24])


def run(command: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, check=False, capture_output=True, text=True)


def page_count(pdfinfo: str, input_pdf: Path) -> int:
    result = run([pdfinfo, str(input_pdf)])
    if result.returncode != 0:
        fail(f"pdfinfo failed: {(result.stderr or result.stdout).strip()}")
    match = re.search(r"^Pages:\s+(\d+)\s*$", result.stdout, re.MULTILINE)
    if not match or int(match.group(1)) < 1:
        fail("pdfinfo did not report a positive page count")
    return int(match.group(1))


def render_command(renderer: str, input_pdf: Path, page_number: int, dpi: int, prefix: Path) -> list[str]:
    if Path(renderer).name == "pdftocairo":
        return [renderer, "-png", "-r", str(dpi), "-f", str(page_number), "-l", str(page_number), "-singlefile", str(input_pdf), str(prefix)]
    return [renderer, "-png", "-r", str(dpi), "-f", str(page_number), "-l", str(page_number), "-singlefile", str(input_pdf), str(prefix)]


def write_json(path: Path, value: dict[str, Any]) -> None:
    temporary = path.with_name(f".{path.name}.tmp")
    with temporary.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")
    os.replace(temporary, path)


def main() -> int:
    parser = argparse.ArgumentParser(description="Render all PDF pages for visual QA")
    parser.add_argument("--input", required=True, type=Path, help="input PDF")
    parser.add_argument("--output-dir", required=True, type=Path, help="directory for page PNGs and manifest")
    parser.add_argument("--source-ref", required=True, help="editable source path or stable source identifier")
    parser.add_argument("--dpi", type=int, default=180, help="render resolution (default: 180)")
    parser.add_argument("--manifest", type=Path, help="manifest path (default: <output-dir>/qa-manifest.json)")
    args = parser.parse_args()

    if args.dpi < 72 or args.dpi > 600:
        fail("--dpi must be between 72 and 600")
    input_candidate = args.input.expanduser()
    if not input_candidate.is_file() or input_candidate.is_symlink():
        fail("--input must be a regular, non-symlink PDF file")
    input_pdf = input_candidate.resolve()
    if input_pdf.suffix.lower() != ".pdf":
        fail("--input must have a .pdf extension")
    if not args.source_ref.strip():
        fail("--source-ref must not be blank")

    pdfinfo = shutil.which("pdfinfo")
    renderer = shutil.which("pdftocairo") or shutil.which("pdftoppm")
    if not pdfinfo or not renderer:
        fail("Poppler preflight failed: require pdfinfo and pdftocairo or pdftoppm")

    output_dir = args.output_dir.expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = (args.manifest.expanduser().resolve() if args.manifest else output_dir / "qa-manifest.json")
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    if manifest_path.exists():
        fail(f"refusing to overwrite existing manifest: {manifest_path}")

    count = page_count(pdfinfo, input_pdf)
    pages = []
    created: list[Path] = []
    try:
        for number in range(1, count + 1):
            prefix = output_dir / f"page-{number:03d}"
            image_path = prefix.with_suffix(".png")
            if image_path.exists():
                fail(f"refusing to overwrite existing rendered page: {image_path}")
            result = run(render_command(renderer, input_pdf, number, args.dpi, prefix))
            if result.returncode != 0:
                fail(f"renderer failed on page {number}: {(result.stderr or result.stdout).strip()}")
            if not image_path.is_file() or image_path.stat().st_size == 0:
                fail(f"renderer did not create page {number}")
            created.append(image_path)
            width, height = png_size(image_path)
            pages.append({
                "page_number": number,
                "image_path": os.path.relpath(image_path, manifest_path.parent),
                "image_sha256": sha256_file(image_path),
                "width_px": width,
                "height_px": height,
            })
    except Exception:
        for created_path in created:
            created_path.unlink(missing_ok=True)
        raise

    manifest = {
        "schema_version": "pdf-qa.manifest/v1",
        "status": "revise",
        "source": {
            "source_ref": args.source_ref,
            "pdf_path": os.path.relpath(input_pdf, manifest_path.parent),
            "pdf_sha256": sha256_file(input_pdf),
        },
        "render": {
            "dpi": args.dpi,
            "renderer": Path(renderer).name,
            "page_count": count,
            "rendered_page_count": len(pages),
            "pages": pages,
        },
        "structural_checks": {
            "page_count_matches": count == len(pages),
            "all_png_dimensions_positive": all(page["width_px"] > 0 and page["height_px"] > 0 for page in pages),
        },
        "inspection": {
            "complete": False,
            "required_checks": REQUIRED_CHECKS,
            "record_ref": None,
            "record_sha256": None,
        },
        "issues": [{
            "page_number": None,
            "check": "visual_inspection",
            "detail": "Every rendered page requires explicit visual inspection before pass.",
        }],
    }
    write_json(manifest_path, manifest)
    print(str(manifest_path))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, RuntimeError, ValueError) as error:
        print(f"pdf-qa render failed: {error}", file=sys.stderr)
        raise SystemExit(1)
