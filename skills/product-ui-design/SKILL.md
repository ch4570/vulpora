---
name: product-ui-design
description: Design, implement, or review web, mobile, and desktop product interfaces from real product context and the repository's existing design language. Use for pages, flows, components, responsive behavior, interaction states, accessibility, and visual refinement. Reject generic template aesthetics and unverified visual-completion claims. Do not use for document, slide, or technical-diagram styling.
---

# Product UI Design

Create interfaces that feel native to the product rather than generated from a fashionable prompt.
Preserve the user's chosen stack, product direction, and existing design system.

## Establish the design basis

Before choosing a style, inspect the relevant product and repository evidence: user task, content,
navigation, nearby screens, tokens, components, assets, typography, supported themes, and target
devices. Reuse established primitives and conventions unless the request is explicitly a redesign.

For a new product with no visual language, state a short design basis containing:

- primary user and task
- information-density and usage context
- content hierarchy and critical action
- one visual thesis tied to the product's subject or behavior
- accessibility, platform, brand, and performance constraints
- assumptions that remain reversible

Do not infer a visual identity from the words `AI`, `SaaS`, `modern`, or from the implementation
framework. A style catalog or generated design-system suggestion is input to evaluate, not a design
decision.

## Work by mode

- **Design:** define the user flow and content hierarchy, then layout, components, tokens, and
  interaction behavior. Use realistic content shapes; label unknown copy and data as placeholders.
- **Implement:** detect the existing stack, extend its components and tokens, preserve working
  behavior, and keep the change inside the requested surface.
- **Review:** inspect the rendered interface and code. Report issues by user impact, evidence,
  location, and a concrete correction. Do not replace the product's taste with personal preference.

For visual direction and anti-pattern decisions, read [anti-slop.md](references/anti-slop.md).
Before claiming an implementation complete, apply [quality-gates.md](references/quality-gates.md).

## Design the complete experience

Model the normal path and every applicable state: loading, empty, partial, error, success, disabled,
permission denied, offline or stale data, long content, localization, and destructive confirmation.
Make the primary task obvious without turning every action into a prominent button or every content
group into a card.

Use semantic controls, visible keyboard focus, meaningful labels, logical focus order, sufficient
contrast, zoom-safe layouts, reduced-motion behavior, and non-color status cues. On touch surfaces,
respect platform navigation, safe areas, and adequately sized targets. Prefer motion that explains a
state or spatial change; omit motion that merely advertises polish.

## Preserve authorship

- Use hierarchy, proportion, rhythm, type, and content before decoration.
- Give a screen one dominant visual idea. Supporting elements should not compete with it.
- Derive distinctive details from product content, interaction, or brand assets—not arbitrary blobs,
  gradients, glows, mascots, or geometric ornaments.
- Use icons from the repository's existing icon system. Do not substitute emoji or mix icon families.
- Do not invent metrics, testimonials, activity, users, certifications, or product capabilities to
  make a screen look complete.
- Keep microcopy specific to the action and consequence. Remove promotional filler from operational
  interfaces.
- Treat consistency as a system property, not identical cards, pills, spacing, and animation on
  every surface.

## Completion

When implementation is requested, render the actual interface at representative narrow and wide
viewports and inspect it. Exercise keyboard navigation and the important interaction states when the
environment permits. Fix visible defects, then re-render. A successful build or screenshot command
does not prove visual quality.

Report changed paths, the design basis, reused and introduced tokens/components, states verified,
viewport and accessibility checks, and unresolved assumptions. If the interface could not be
rendered or inspected, say `visual verification: NOT_RUN` and do not claim the UI is finished.
