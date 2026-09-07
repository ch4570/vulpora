---
name: document-designer
description: Turn supplied content into a polished, accessible, editable Markdown document with clear structure, typography roles, information hierarchy, tables, callouts, captions, and page-aware layout intent. Use for reports, PRDs, technical documents, memos, and other Markdown-first publications before HTML or PDF rendering. Do not use to render HTML/PDF or to invent missing content.
---

# Document Designer

Design the editable document source and its presentation intent. Preserve facts, uncertainty,
citations, code, and semantic meaning; do not fill content gaps with invented claims.

## Design

1. Identify audience, reading goal, document type, required sections, language, target medium,
   and provided brand constraints. Treat missing visual preferences as reversible design choices.
2. Read only the references needed for the document:
   - [typography.md](references/typography.md) for hierarchy, readable type roles, and multilingual
     fallback.
   - [page-layout.md](references/page-layout.md) for spacing, page flow, figures, and print intent.
   - [tables-and-callouts.md](references/tables-and-callouts.md) for dense data, warnings, notes,
     and code.
   - [design-tokens.md](references/design-tokens.md) when defining or selecting reusable tokens.
3. Establish the information hierarchy before styling. Keep one H1, use ordered heading levels,
   lead with the outcome, group related evidence, and remove decorative repetition.
4. Create or revise `source.md` as the semantic source of truth. Use Markdown structure rather
   than visual spacing characters, manual line wrapping, or embedded presentation hacks.
5. Create `document-design.yaml` beside the source when the publisher needs explicit choices.
   Include `document_type`, `audience`, `language`, `target`, `theme`, `density`, `toc`,
   `page_break_hints`, `font_fallback`, and `accessibility_notes`. Mark unprovided constraints as
   assumptions, not facts.
6. Hand both files to `markdown-publisher`. Do not render HTML or PDF here.

## Source contract

- Preserve a stable editable source; never make HTML or PDF the only copy.
- Keep headings, lists, tables, code fences, links, alt text, captions, and callout meaning
  machine-readable.
- Prefer a short table for repeated-field comparisons and a diagram only when relationships or
  sequence are materially clearer visually.
- Keep tables narrow enough for the target page. Split wide tables or move detail to an
  appendix; do not solve overflow by shrinking all text.
- Give every informative image or diagram alt text and a useful caption. Mark decorative images
  as decorative.
- Specify font fallback that covers every used script, including Korean when present. Do not
  bundle or fetch fonts without explicit authorization.
- Keep design tokens reusable and publisher-neutral. Avoid renderer-specific CSS in `source.md`.

## Validation and handoff

Before handoff, verify that heading order is valid, links and references are preserved, table
columns are bounded, code fences are balanced, and no fact was introduced without a source.
Report the source path, design-spec path, assumptions, publisher target, and any content or font
blocker. Rendering and visual inspection remain downstream completion gates.
