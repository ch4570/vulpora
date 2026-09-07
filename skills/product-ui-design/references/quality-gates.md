# UI delivery gates

Apply the gates that fit the requested surface. Record unperformed checks as `NOT_RUN`; do not turn
tool availability into a passing result.

## Structure and content

- The primary user task, critical action, and information order are apparent without decorative
  effects.
- Real content and representative extremes fit without clipping, accidental truncation, or layout
  collapse.
- Loading, empty, error, partial, success, disabled, and permission states exist when applicable.
- Destructive and irreversible actions communicate their consequence and require proportional
  confirmation.
- No copy, metric, identity, social proof, or capability was fabricated.

## System fit

- Existing components, tokens, icons, and conventions were reused where they already solve the
  problem.
- New tokens represent reusable roles rather than one-off color or spacing values.
- One component does not encode unrelated semantic variants merely to reduce file count.
- Light/dark and locale behavior follows the repository's supported modes; unsupported modes are not
  invented as scope expansion.

## Interaction and accessibility

- Controls use semantic roles and accessible names; icon-only controls expose their purpose.
- Keyboard order follows visual order, focus is visible and not obscured, and overlays restore focus.
- Validation errors are specific, associated with their fields, and announced when appropriate.
- Meaning does not depend on color, hover, dragging, animation, or pointer precision alone.
- Text contrast meets the product's required standard; ordinary body text targets WCAG AA 4.5:1.
- Content remains usable at text zoom, reduced motion is respected, and animations are interruptible.
- Touch controls and gestures follow the target platform and provide alternatives for essential
  gesture-only actions.

## Responsive and visual inspection

Choose viewports from actual product support. If none are documented, inspect at least one narrow
mobile-sized viewport and one wide desktop-sized viewport, then state the assumed sizes.

At each viewport inspect:

- overflow, clipping, overlap, wrapping, sticky regions, and scroll traps
- hierarchy, alignment, density, readable line length, and whitespace rhythm
- menus, dialogs, forms, tables, and long or empty content
- hover, focus, active, selected, disabled, loading, and error presentation
- image aspect ratio, icon consistency, contrast, and motion behavior

Use screenshots or an interactive browser when available. Inspect the rendered pixels, not only the
DOM or source. After a correction, render the affected viewport and state again.

## Delivery record

Return a concise record with:

- design basis and visual thesis
- changed paths and affected user flows
- reused and introduced system primitives
- states and viewports actually inspected
- accessibility checks actually performed
- `visual verification: PASS | REVISE | NOT_RUN`
- remaining assumptions, defects, and follow-up conditions

`PASS` requires an inspected final render with no known blocking visual or interaction defect.
