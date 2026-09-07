# Design Tokens

Define presentation choices as reusable semantic tokens rather than inline style instructions.

```yaml
color:
  text: "..."
  muted: "..."
  surface: "..."
  border: "..."
  accent: "..."
spacing:
  xs: "..."
  sm: "..."
  md: "..."
  lg: "..."
  xl: "..."
type:
  body: "..."
  small: "..."
  h3: "..."
  h2: "..."
  h1: "..."
layout:
  content_width: "..."
  page_margin: "..."
  radius: "..."
```

Use roles such as `text`, `muted`, and `accent`, not component-specific color names. Maintain a
small monotonic spacing and type scale. The publisher maps these semantic tokens to CSS or
another renderer; `source.md` must not contain that mapping.

Choose an existing theme when it satisfies the request. Create new tokens only for a supplied
brand constraint or a recurring document class. Verify contrast, font coverage, and print
behavior after rendering.
