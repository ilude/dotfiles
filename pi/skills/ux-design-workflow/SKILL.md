---
name: ux-design-workflow
description: "Web/graphical UX/UI: accessibility, design tokens, aesthetics, or pipelines. Not for terminal interfaces; use tui-ux."
location: user
---

# UX Design Workflow

Guidance for designing and building web or graphical interfaces when the requested contract needs UX design work. Use `tui-ux` for terminal interfaces.

## Sub-Files (Load When Needed)

| Topic | When to Load |
|-------|--------------|
| [aesthetics.md](./aesthetics.md) | Bold visual design, distinctive typography, motion |
| [pipeline.md](./pipeline.md) | Full 4-phase pipeline overview |
| [1-prd-generator.md](./1-prd-generator.md) | Detailed PRD generation instructions |
| [2-prd-to-ux.md](./2-prd-to-ux.md) | 6-pass UX specification process |
| [3-ux-to-build-prompts.md](./3-ux-to-build-prompts.md) | Building sequenced implementation prompts |

---

## Core Principles

Apply these principles when they affect the requested UI contract.

1. **Clarity over decoration** - Function before form
2. **Consistency over novelty** - Reuse patterns
3. **Accessibility over convenience** - WCAG 2.1 AA minimum
4. **Performance over polish** - Fast > pretty
5. **Feedback over silence** - Always show state
6. **Progressive disclosure** - Show what's needed when needed
7. **Use existing libraries** - If a UI library (Shadcn, Radix, MUI, etc.) is active in the project, use its primitives. Wrap and style them for the aesthetic vision, but never rebuild what the library already provides
8. **Justify every element** - Before placing any component, confirm its purpose. If it has no clear function, remove it. If a layout looks like a template, redesign it

---

## Accessibility Requirements

Apply the relevant requirements when the requested UI contract affects the corresponding interaction.

### Color Contrast

- **Normal text**: 4.5:1 contrast ratio minimum
- **Large text** (18px+ or 14px+ bold): 3:1 contrast ratio minimum
- **UI components/focus indicators**: 3:1 contrast ratio

### Keyboard Navigation

- All interactive elements MUST be focusable via Tab key
- Focus order MUST follow logical reading order
- Custom components MUST implement appropriate ARIA roles
- Escape key MUST close modals and dropdowns

Reference: [WAI modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) defines the required focus behavior.

### Focus Management

- Opening modal MUST move focus to modal; closing MUST return focus to trigger
- Route changes SHOULD move focus to main content
- Error states MUST announce to screen readers

### Reduced Motion (MUST Respect)

Reference: [WCAG 2.2 quick reference](https://www.w3.org/WAI/WCAG22/quickref/) covers contrast, motion, and keyboard criteria.

### Lighthouse Score

Set and verify a Lighthouse target only when the requested contract includes it.

---

## Design Tokens

When adding or changing a design system, use semantic color, spacing, typography, and breakpoint tokens. Match the project's existing design system before adding tokens.

Reference: [W3C Design Tokens Community Group](https://www.w3.org/community/design-tokens/) maintains the design-token standardization work.

---

## Dark Mode

When the requested UI contract includes themes, define semantic foreground, background, and border tokens for each theme. Persist user preference, respect `prefers-color-scheme` as the default, and avoid a wrong-theme flash on load.

---

## Component Patterns

Apply the relevant pattern when adding or changing that component.

### Buttons

- MUST have visible focus state
- MUST be minimum 44x44px touch target on mobile

### Forms

- Labels MUST be visible (no placeholder-only labels)
- Error messages MUST be associated via `aria-describedby`

### Modals

- MUST trap focus within modal
- MUST close on Escape key
- MUST return focus to trigger on close
- SHOULD use `<dialog>` element when possible

---

## Loading and Error States

For UI work that affects loading or error behavior:

- Indicate loading promptly.
- Explain errors without exposing raw error messages to users.

---

## Responsive Design

For UI work whose requested contract includes mobile or responsive behavior:

- Use a mobile-first approach.
- Keep touch targets at least 44x44px on mobile.
- Keep text readable without horizontal scrolling.
- Make images responsive (`max-width: 100%`).
