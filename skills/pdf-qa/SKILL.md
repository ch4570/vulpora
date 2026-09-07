---
name: pdf-qa
description: Render every page of an existing PDF to PNG and gate delivery on recorded visual inspection. Use after generating or changing a PDF, before claiming a PDF report, document, diagram, or slide deck is complete, or when diagnosing clipping, overlap, broken glyphs, pagination, page-balance, or table-spacing defects. This skill validates PDFs; it does not author or repair their source.
---

# PDF QA

Act as a gatekeeper. Never certify visual quality from PDF metadata, text extraction, OCR, or successful rendering alone.

Enforce the visual loop: Generate -> Render -> Inspect -> Fix -> Re-render.

## Workflow

1. Preserve the editable source and identify its relationship to the PDF. If the source is unavailable, record that limitation instead of inventing one.
2. Run `scripts/preflight.py` to verify that Poppler provides `pdfinfo` and at least one of `pdftocairo` or `pdftoppm`.
3. Run `scripts/render-pages.py --input <file.pdf> --output-dir <qa-dir> --source-ref <editable-source>`; use 180 DPI unless the artifact needs closer inspection.
4. Inspect every emitted page PNG visually. Use `view_image` when available. Read [references/qa-checklist.md](references/qa-checklist.md) for the checks and inspection record shape.
5. Create one `pdf-qa.inspection/v1` JSON record covering every rendered page and every required check. Record the rendered image SHA-256 so stale evidence cannot pass.
6. Run `scripts/record-inspection.py --manifest <qa-manifest.json> --inspection <inspection.json> --output <qa-final.json>`.
7. If the final status is `revise`, return the issues to the source-producing skill, regenerate the PDF, and repeat from step 2. Never patch the rendered PNG as the fix.

## Gate Rules

- Treat the initial render manifest as `revise`; rendering is evidence preparation, not inspection.
- Require visual evidence for `clipping`, `overlap`, `glyph_integrity`, `page_balance`, and `table_spacing` on every page.
- Accept only `visual_image_review`, `vision_model_review`, or `human_visual_review` as inspection methods. Do not treat text-only or OCR-only methods as visual evidence.
- Set `pass` only when every required check on every rendered page is explicitly recorded as `pass` against the current image digest.
- Set `revise` when any check fails. Include a concrete page-level detail for every result.
- Keep the PDF, editable source reference, rendered pages, render manifest, inspection record, and final QA manifest linked and available for reproduction.

## Completion

Report PDF QA complete only when `qa-final.json` has `status: pass`, all pages were rendered at the recorded DPI, all image digests match the inspection, and no required check is missing. Otherwise report `revise` and the issue list.
