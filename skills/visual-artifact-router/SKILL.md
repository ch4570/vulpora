---
name: visual-artifact-router
description: Route requests for polished Markdown, HTML, PDF, Mermaid, SVG, PNG, and technical diagrams to the smallest suitable visual-artifact workflow. Use when the agent must choose a document or diagram format, preserve editable sources, attach render-based QA, or decide whether a diagram adds value. Do not use for ordinary prose where visual publishing is not requested or useful.
---

# Visual Artifact Router

Choose the artifact pipeline and enforce its completion gate. Do not author document content,
style a diagram, or implement a renderer in this skill.

## Route

1. Read [routing-policy.md](references/routing-policy.md) and classify the requested outcome,
   style intent, editability needs, and final formats.
2. Prefer plain text or a table when either communicates the relationship more clearly than a
   diagram. Record `diagram: none` instead of generating decorative visuals.
3. Select the smallest sufficient pipeline:
   - Editable document: `document-designer` -> `markdown-publisher`
   - PDF document: `document-designer` -> `markdown-publisher` -> `pdf-qa`
   - Structural or process diagram: `mermaid-diagrams` -> `diagram-styler`
   - Rendered diagram: append the relevant rendered-output inspection gate.
   - Whiteboard or hand-drawn intent: route only to an installed `excalidraw-diagrams` skill.
   - Precise branded architecture: route only to an installed SVG architecture renderer.
4. If an optional renderer is unavailable, preserve an editable semantic brief and report the
   missing capability. Do not silently substitute a visually different format or install a
   dependency.
5. Give every selected skill explicit input paths, output paths, target format, theme intent, and
   completion evidence. Keep semantic generation separate from styling and rendering.
6. Apply [artifact-contract.md](references/artifact-contract.md) to the assembled result.

## Completion gate

For source-only Markdown or Mermaid, validate structure and syntax before delivery. For PDF,
SVG, PNG, or other rendered output, require this loop:

`Generate -> Render -> Inspect -> Fix -> Re-render`

Do not mark a rendered artifact complete from source generation or a successful renderer exit
alone. Completion requires inspected final output with no obvious clipping, overlap, broken
glyph, unreadable scale, inconsistent spacing, or pagination defect. A failed or unavailable QA
stage is a blocker, not a warning.

## Output

Return a route record containing:

- requested outputs and selected skills in execution order
- editable source-of-truth paths and derived artifact paths
- chosen format and theme, with the routing reason
- renderer and runtime dependencies actually used
- inspection evidence, unresolved issues, and `pass`, `revise`, or `blocked`

Never claim that a deferred optional skill ran. Never discard editable sources after rendering.
