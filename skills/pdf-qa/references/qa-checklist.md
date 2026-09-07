# PDF visual QA checklist

Inspect the rendered PNG for every page at readable zoom. Record each item separately.

| Check | Pass condition | Typical failure evidence |
| --- | --- | --- |
| `clipping` | All visible text, images, rules, and labels remain inside their intended bounds. | Cut-off line endings, cropped diagram labels, content outside the page. |
| `overlap` | Text and visual elements do not unintentionally cover one another. | Labels over connectors, footer over body text, stacked table content. |
| `glyph_integrity` | Korean, Latin, symbols, code, and punctuation render as intended. | Tofu boxes, missing characters, replacement glyphs, inconsistent fallback. |
| `page_balance` | Page breaks and whitespace preserve hierarchy and readability. | Orphaned headings, stranded captions, near-empty pages, crowded page bottoms. |
| `table_spacing` | Tables, code blocks, and diagrams fit the page and remain readable. | Crushed padding, wrapped headers, split rows, tiny diagrams, overflow. |

Use a concise but page-specific `detail` for both pass and fail results. A pass detail should state what was visually checked; a fail detail should identify the visible defect and location. Successful `pdfinfo`, text extraction, OCR, or rasterization is not evidence that these checks pass.

## Inspection record

Record every rendered page exactly once. Copy `image_sha256` from the render manifest.

```json
{
  "schema_version": "pdf-qa.inspection/v1",
  "method": "visual_image_review",
  "inspector": "agent-or-person-identifier",
  "inspected_at": "2026-08-20T09:00:00Z",
  "pages": [
    {
      "page_number": 1,
      "image_sha256": "<64 lowercase hex characters>",
      "checks": {
        "clipping": {"result": "pass", "detail": "All edge content is visible."},
        "overlap": {"result": "pass", "detail": "No elements visibly overlap."},
        "glyph_integrity": {"result": "pass", "detail": "Korean and Latin glyphs render correctly."},
        "page_balance": {"result": "pass", "detail": "Breaks and whitespace are visually balanced."},
        "table_spacing": {"result": "pass", "detail": "Table and code spacing remains readable."}
      }
    }
  ]
}
```

Allowed methods are `visual_image_review`, `vision_model_review`, and `human_visual_review`. Use `fail` plus a concrete detail for a visible defect.
