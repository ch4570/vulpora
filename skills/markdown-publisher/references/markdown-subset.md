# Supported Markdown Subset

The dependency-free renderer intentionally supports a bounded publishing subset:

- ATX headings (`#` through `######`)
- paragraphs and hard block separation
- fenced code blocks with an optional language label
- contiguous flat ordered and unordered lists
- blockquotes
- GitHub-style callouts such as `> [!NOTE]`, `TIP`, `IMPORTANT`, `WARNING`, and `CAUTION`
- pipe tables with a delimiter row
- horizontal rules
- inline code, emphasis, strong emphasis, strikethrough, and links

Raw HTML is escaped. Link destinations permit `https`, `http`, `mailto`, fragments, and relative
paths; dangerous schemes become plain text. External links do not load resources into the document.

Image syntax is rejected instead of producing a falsely self-contained document. Add images only
after a future asset-inlining contract defines allowed formats, size limits, and SVG sanitization.

The renderer is not a CommonMark replacement. Use another explicitly approved pipeline when exact
CommonMark compatibility, footnotes, equations, citations, or complex nested tables are required.
