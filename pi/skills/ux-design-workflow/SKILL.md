---
name: ux-design-workflow
description: "UX/UI design workflow from idea to code. Covers accessibility (WCAG), design tokens, aesthetics, pipelines. Triggers: design systems, UI components, build a UI, design this, user interface patterns, accessibility, WCAG."
location: user
---

# UX Design Workflow

End-to-end workflow for designing and building user interfaces with accessibility, distinctive aesthetics, and production-quality code.

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

1. **Clarity over decoration** - Function before form
2. **Consistency over novelty** - Reuse patterns
3. **Accessibility over convenience** - WCAG 2.1 AA minimum
4. **Performance over polish** - Fast > pretty
5. **Feedback over silence** - Always show state
6. **Progressive disclosure** - Show what's needed when needed
7. **Use existing libraries** - If a UI library (Shadcn, Radix, MUI, etc.) is active in the project, use its primitives. Wrap and style them for the aesthetic vision, but never rebuild what the library already provides
8. **Justify every element** - Before placing any component, confirm its purpose. If it has no clear function, remove it. If a layout looks like a template, redesign it

---

## Accessibility Requirements (MUST Achieve)

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

### Lighthouse Score: MUST be >95

---

## Design Tokens

Use semantic color, spacing, typography, and breakpoint tokens. Match the project's existing design system before adding tokens.

Reference: [W3C Design Tokens Community Group](https://www.w3.org/community/design-tokens/) maintains the design-token standardization work.

---

## Dark Mode

Define semantic foreground, background, and border tokens for each theme.

- MUST persist user preference (localStorage)
- MUST respect `prefers-color-scheme` as default
- MUST NOT flash wrong theme on load

---

## Component Patterns

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

- Loading MUST be indicated within 100ms
- Errors MUST explain what went wrong
- MUST NOT show raw error messages to users

---

## Responsive Design

Mobile-first approach is REQUIRED.

- Touch targets MUST be minimum 44x44px on mobile
- Text MUST be readable without horizontal scrolling
- Images MUST be responsive (`max-width: 100%`)
