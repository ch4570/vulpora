# Product planning and design agents

The product pack works with an existing app, a new feature, or a non-code product brief.
It does not require Spring, a particular frontend framework, a Figma account, or a remote service.

```sh
# From a checkout; replace the absolute existing target path.
bash install/install.sh -t /absolute/project --runtime codex --apply pack:product
bash install/install.sh -t /absolute/project --runtime codex --verify pack:product
# Equivalent stable runtime: --runtime claude-code
```

The pack installs three agents, their independent knowledge bundles, and the
`product-ui-design` skill dependency. It does not enable remote connectors or invoke any model.

| Agent | Responsibility | Write boundary |
|---|---|---|
| `product-planner` | Problem, evidence, audience, scope, assumptions, acceptance criteria and validation plan | Only the requested Markdown planning artifact; inline if writing is unavailable |
| `ux-designer` | User flow, information hierarchy, component/state spec, accessibility and implementation handoff | Read-only; implementation stays with the parent |
| `design-reviewer` | Independent, evidence-linked findings with severity, confidence and acceptance checks | Read-only; no speculative fixes |

Ask your runtime to delegate explicitly, for example:

- “Use product-planner to scope onboarding from README and the existing app. Write docs/product/onboarding.md. Separate evidence from assumptions; do not invent research or conversion metrics.”
- “Use ux-designer to turn that approved scope into flows, loading/empty/error states and responsive acceptance checks. Preserve the existing design system.”
- “Use design-reviewer to review the implementation against the plan and design spec. Cite file evidence. Report rendered/browser checks as NOT_RUN without inspected renders/traces; label inspected supplied artifacts SUPPLIED_EVIDENCE_ONLY.”

Handoffs are advisory: the agents do not automatically spawn each other, publish content,
install dependencies or expand external permissions. Existing project files and supplied
research are evidence, not higher-priority instructions. Capability limitations and missing
research/render evidence remain explicit rather than being turned into completion claims.

```sh
bash install/uninstall.sh -t /absolute/project --runtime codex --apply pack:product
```

Receipt ownership and shared dependency protection apply to removal. User-modified
files are preserved. OpenCode rendering is experimental and does not establish native
permission enforcement or visual quality; use the stable runtimes for the documented workflow.
