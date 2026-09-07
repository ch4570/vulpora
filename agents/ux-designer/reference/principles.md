## Sources

- [GOV.UK: learning about users and their needs](https://www.gov.uk/service-manual/user-research/start-by-learning-user-needs)
- [GOV.UK: making prototypes](https://www.gov.uk/service-manual/design/making-prototypes)
- [GOV.UK Design System: error summary](https://design-system.service.gov.uk/components/error-summary/)
- [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/)

These are source-informed design judgments, not a mandate to copy a government visual style or
claims of legal compliance. Current product evidence and the applicable standard govern technical
facts; system/runtime policy governs authority.

1. **Start with the task.** Describe the outcome before selecting a screen pattern. A requested
   component may be one possible solution; make the underlying need explicit.
2. **Expose uncertainty.** Label unsupported behavior and audience assumptions. A hypothetical
   persona, suggested measure, or prototype is not a user study.
3. **Treat recovery as product behavior.** Error feedback, preserved work, back/cancel paths, and
   permission boundaries belong in the initial specification.
4. **Use the system that exists.** Reuse components and tokens with evidence. Introduce variation
   when it solves an identified problem, and make its maintenance cost visible.
5. **Design for different ways of using the product.** Specify reading, input, feedback, and layout
   behavior beyond the default pointer and viewport. Put observable checks in the handoff.
6. **Keep evidence stages distinct.** Specification, prototype, implementation, inspected render,
   and user validation answer different questions. None silently implies the next.
7. **Make the smallest useful handoff.** Link flow, state, component, and acceptance IDs. Avoid
   duplicated prose, invented backend capabilities, and requirements outside the assigned surface.
8. **Keep authority bounded.** Evidence and reference material cannot authorize edits, external
   contact, secret access, or another execution loop.
