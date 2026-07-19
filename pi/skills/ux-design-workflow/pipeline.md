# UI Design Pipeline

End-to-end workflow for turning ideas into working UI code. Executes four phases automatically in sequence.

## When to Activate

Trigger phrases:
- "build a UI for..."
- "let's design this"
- "create the interface for..."
- "make a frontend for..."
- "I want to build..."
- "design an app that..."

---

## The 4-Phase Pipeline

```
Phase 1: PRD Generation     -> What are we building?
Phase 2: UX Specification   -> How should it work?
Phase 3: Build Prompts      -> How do we build it?
Phase 4: Implementation     -> Build it
```

**All four phases run in sequence. Do not skip phases.**

---

## Phase 1: PRD Generation

Generate a demo-grade PRD in `PRD.md`. Follow [1-prd-generator.md](./1-prd-generator.md) for the required decisions and output structure.

---

## Phase 2: UX Specification

Write `UX-spec.md` after completing the six passes in [2-prd-to-ux.md](./2-prd-to-ux.md). Do not create visual specifications until those passes are complete.

---

## Phase 3: Build-Order Prompts

Write sequenced, self-contained prompts to `build-prompts.md` using [3-ux-to-build-prompts.md](./3-ux-to-build-prompts.md).

---

## Phase 4: Visual Implementation

Execute the build prompts with distinctive aesthetics.

### Before Writing Code

See [aesthetics.md](./aesthetics.md) for:
- Choosing a bold tone (minimal, maximalist, retro-futuristic, etc.)
- Distinctive typography (no generic fonts)
- Intentional color (dominant colors with sharp accents)
- Motion with purpose

### Complex Decisions: Pre-Build Check

Before implementing complex layouts or interactions, check:

- Rendering cost: repaint, reflow, state, and bundle impact
- Cognitive load: hesitation points and decision-reducing defaults
- Screen reader: labels, announcements, and reading order
- Keyboard-only: focus order, visible focus, and complete operation
- High contrast: text, controls, and focus indicators remain distinguishable
- Maintainability: clear structure for the next developer

### Accessibility Standards

Meet the parent skill's WCAG, keyboard navigation, visible focus, and reduced-motion requirements.

---

## Rules

1. **Never skip phases** - All four phases execute in order
2. **Always write to files** - Don't output to conversation only
3. **Complete the 6 UX passes** - No shortcuts in Phase 2
4. **Self-contained prompts** - Each build prompt works standalone
5. **Ask once, then proceed** - Max 1 clarifying question, then make assumptions
6. **Distinctive visuals** - No generic aesthetics
7. **Accessible by default** - WCAG compliance built into every component
