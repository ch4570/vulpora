# Mermaid Rendering Contract

## Inputs and outputs

- Input: one trusted local `.mmd` source created or reviewed under the `mermaid-diagrams` skill.
- Output: one `.svg` plus `<output>.manifest.json`.
- Renderer: a preinstalled `mmdc` executable only. `MMDC_BIN` can select an explicit local executable.
- Network and install policy: do not use `npx`, package installers, hosted renderers, remote fonts, or remote images.

The renderer rejects Mermaid initialization directives, click actions, JavaScript URLs, and active or remote HTML elements. Mermaid runs with `securityLevel: strict` and `htmlLabels: false`.

## Theme and target selection

| Theme | Use |
|---|---|
| `light` | light documents and default reports |
| `dark` | dark interfaces and dark presentations |

| Target | Responsive maximum width | Use |
|---|---:|---|
| `document` | 960 px | reports, PRDs, technical documents |
| `presentation` | 1600 px | slides and large displays |
| `dark-ui` | 1200 px | dark product surfaces; defaults to the dark theme |

Themes live under `assets/themes/`; semantic `.mmd` files must not contain palette or renderer initialization.

## Inspection checklist

After rendering, open or rasterize the SVG and inspect it at the selected target width.

- Every label is fully visible and legible.
- Edges do not obscure labels or unrelated nodes.
- Korean and Latin glyphs render with a declared local fallback.
- Text and connectors have sufficient contrast against the background.
- The diagram is not denser than its semantic type budget.
- The SVG scales down without fixed-width overflow.
- `<title>` and `<desc>` describe meaning, not geometry.

Revise the semantic source for topology and wording problems. Revise theme assets or target settings for palette, font, and sizing problems. Re-render after every fix.

For PDF use, inspect the final composed PDF through the `pdf-qa` skill; inspecting the standalone SVG does not prove correct pagination or print scaling.
