---
name: diagram-styler
description: Render an existing Mermaid `.mmd` semantic source into a themed, responsive, accessible SVG while preserving the source and recording renderer provenance in a manifest. Use for light or dark Mermaid styling, document-width SVG output, presentation output, and pre-rendering diagrams for HTML or PDF documents. Do not use to change diagram meaning or to download renderers at runtime.
---

# Diagram Styler

Apply a visual layer to Mermaid source without changing its semantic model.

## Workflow

1. Confirm that the input `.mmd` is the preserved source of truth. If meaning must change, return to the `mermaid-diagrams` skill.
2. Read [references/rendering-contract.md](references/rendering-contract.md). Select `light` or `dark` and a `document`, `presentation`, or `dark-ui` target.
3. Run the renderer preflight. Never invoke `npx`, install packages, or use a network renderer.
4. Render with [scripts/render-mermaid.js](scripts/render-mermaid.js), providing a meaningful title and one-sentence description.
5. Inspect the SVG at its target width for clipped labels, overlapping edges, unreadable contrast, broken glyphs, and excessive density.
6. Fix semantic layout problems in the `.mmd`; fix palette or sizing problems in the theme/target layer. Re-render and inspect again.
7. Keep the generated manifest beside the SVG. When the destination is PDF, compose the SVG first and run the `pdf-qa` skill on every final PDF page.

## Commands

```bash
node scripts/render-mermaid.js --preflight
node scripts/render-mermaid.js \
  --input path/to/diagram.mmd \
  --output path/to/diagram.svg \
  --theme light \
  --target document \
  --title "Order processing" \
  --description "Sequence showing checkout, payment authorization, and fulfillment."
```

The preflight returns JSON even when unavailable. A render fails closed when `mmdc` is absent. `MMDC_BIN` may point to a preinstalled executable; it must never point to a download wrapper.

## Completion Gate

Complete only when:

- the `.mmd`, `.svg`, and `.svg.manifest.json` all exist and the manifest hashes match;
- the SVG has `role="img"`, a file-scoped `aria-labelledby`, `<title>`, and `<desc>`;
- source meaning is unchanged and theme instructions are absent from the `.mmd`;
- the SVG is responsive within the selected target width;
- visual inspection finds no clipping, overlap, broken glyph, contrast, or readability defect;
- a PDF destination has also passed the `pdf-qa` skill after document composition.

If rendering cannot run, return the preserved `.mmd`, the preflight result, and the missing dependency. Do not claim a rendered artifact or visual inspection.
