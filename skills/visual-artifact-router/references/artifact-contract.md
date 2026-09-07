# Artifact Contract

## Provenance

Record each editable source and each derived output. A consumer must be able to tell which source
and theme produced an artifact and which command or skill can regenerate it.

Recommended layout:

```text
artifact/
├── source.md
├── document-design.yaml
├── diagram.mmd
├── diagram.svg
├── report.html
├── report.pdf
└── qa/
    ├── page-01.png
    └── report.json
```

Only create files needed by the chosen route. Do not create empty placeholders for unused
formats.

## Status

- `pass`: final requested formats exist and every required validation and visual inspection
  passed.
- `revise`: a generated artifact exists, but inspection found a correctable defect.
- `blocked`: a required renderer, font, permission, source, or QA capability is unavailable.

## Required evidence

Record source and output paths, tool versions or runtime identity, render command or equivalent
operation, inspection targets, issue list, and final status. A zero exit code proves generation,
not visual quality.

For rendered outputs inspect all pages or the complete diagram at a readable scale. Reject
clipping, unintended overlap, broken glyphs, unreadable labels, weak contrast, inconsistent
spacing, awkward page breaks, excessive blank regions, and low-resolution figures.
