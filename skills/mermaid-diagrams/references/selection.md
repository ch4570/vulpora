# Mermaid Type Selection

Choose one primary question and one type. If a paragraph or three-column table is equally clear, do not create a diagram.

| Question | Type | Reference | Default budget |
|---|---|---|---|
| What happens next or which branch wins? | Flowchart | [flowchart.md](flowchart.md) | 9 nodes, 12 edges |
| Who sends what, in what order? | Sequence | [sequence.md](sequence.md) | 5 participants, 12 messages |
| Which lifecycle state changes under which event? | State | [state.md](state.md) | 9 states, 12 transitions |
| Which business entities relate? | ER | [er.md](er.md) | 8 entities, 12 relationships |
| Which software types own operations and relationships? | Class | [class.md](class.md) | 7 classes, 8 relationships |
| How do a few system components connect? | Simple architecture | [architecture.md](architecture.md) | 9 nodes, 12 edges |

Split over-budget work into `<slug>-overview.mmd` and one or more `<slug>-detail-*.mmd` files. Do not combine diagram types in one source merely to avoid splitting.

Across all types:

- Prefer left-to-right reading for pipelines and top-to-bottom reading for hierarchies.
- Keep human labels concise; put details in the surrounding document.
- Use stable ASCII identifiers so label edits do not churn relationships.
- Never add theme initialization, `click`, raw HTML, scripts, remote images, or external links.
