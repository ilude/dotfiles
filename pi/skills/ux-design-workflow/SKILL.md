---
name: ux-design-workflow
description: "Web or graphical UX/UI: accessibility, design tokens, aesthetics, responsive behavior, or design pipelines. Not for terminal interfaces; use tui-ux."
---

# UX Design Workflow

## References

Load only what the request needs:

- [Aesthetics](aesthetics.md)
- [Design pipeline](pipeline.md)
- [PRD generation](1-prd-generator.md)
- [PRD to UX specification](2-prd-to-ux.md)
- [UX specification to build prompts](3-ux-to-build-prompts.md)

## Process

1. Inspect the existing component library, tokens, layouts, interaction patterns, and accessibility behavior.
2. State the user task and affected interaction states.
3. Reuse existing primitives before adding components or tokens.
4. Define loading, empty, success, error, disabled, and responsive behavior where the change needs them.
5. Validate keyboard use, focus, contrast, motion preferences, and the affected viewport sizes.

## Accessibility

- Meet the project's accessibility target; use WCAG 2.1 AA when none is defined.
- Keep keyboard order logical and provide visible focus.
- Give custom controls appropriate names, roles, and states.
- Move focus into opened dialogs and return it to the trigger on close. Support Escape.
- Associate labels and errors with form controls.
- Do not use color as the only state indicator.
- Respect reduced-motion preferences.

References: [WAI dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) and [WCAG quick reference](https://www.w3.org/WAI/WCAG22/quickref/).

## Visual and responsive behavior

- Use semantic design tokens and the project's existing theme system.
- For themes, define foreground, background, and border relationships and avoid wrong-theme flashes.
- Keep text readable without horizontal scrolling.
- Make media responsive and touch targets usable on supported mobile layouts.
- Add decoration, motion, or a new visual primitive only when it serves the requested interaction.
