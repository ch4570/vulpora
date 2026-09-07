# Routing Policy

Choose the least complex artifact that communicates the requested information accurately.

| Need | Route | Source of truth |
| --- | --- | --- |
| Plain explanation or small comparison | prose or Markdown table | `.md` |
| Editable report, PRD, memo, or technical document | `document-designer` -> `markdown-publisher` | `.md` + design spec |
| PDF delivery | document route -> `pdf-qa` | `.md` + design spec |
| Flow, sequence, state, ER, class, simple architecture | `mermaid-diagrams` -> `diagram-styler` | `.mmd` |
| Whiteboard or hand-drawn explanation | installed `excalidraw-diagrams` | Excalidraw source |
| Strict branded or precisely positioned architecture | installed SVG architecture renderer | HTML/SVG source |

## Decision rules

- Use Mermaid when versionable semantics and automatic layout matter.
- Use a whiteboard renderer only when informal, hand-drawn style adds explanatory value.
- Use precise HTML/SVG only when brand control or exact placement is a real requirement.
- Do not make a diagram when a sentence or compact table is clearer.
- Append render inspection whenever the requested deliverable is rendered or fixed-layout.
- Treat PDF QA as mandatory for PDF delivery.
- Treat an unavailable optional route as `blocked`; do not degrade it silently.

Do not select a route based only on installed tools. First select the correct artifact class, then
check whether its renderer is available and report the dependency result.
