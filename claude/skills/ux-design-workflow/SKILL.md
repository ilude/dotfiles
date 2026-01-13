---
name: ux-design-workflow
description: |
  Comprehensive UX/UI design workflow - from idea to working code. Covers accessibility (WCAG), design tokens, distinctive aesthetics, and implementation pipelines. Activate when working with design systems, UI components, "build a UI", "design this", or user interface patterns.
location: user
---

# UX Design Workflow

End-to-end workflow for designing and building user interfaces with accessibility, distinctive aesthetics, and production-quality code.

## Sub-Files (Load When Needed)

| Topic | When to Load |
|-------|--------------|
| [aesthetics.md](./aesthetics.md) | Bold visual design, anti-AI-slop, typography, motion |
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

```typescript
// Focus trap for modals
const useFocusTrap = (containerRef: RefObject<HTMLElement>) => {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const focusables = container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusables[0] as HTMLElement;
    const last = focusables[focusables.length - 1] as HTMLElement;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    };
    container.addEventListener('keydown', handleKeyDown);
    first?.focus();
    return () => container.removeEventListener('keydown', handleKeyDown);
  }, [containerRef]);
};
```

### Focus Management

- Opening modal MUST move focus to modal; closing MUST return focus to trigger
- Route changes SHOULD move focus to main content
- Error states MUST announce to screen readers

### Reduced Motion (MUST Respect)

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

### Lighthouse Score: MUST be >95

---

## Design Tokens

```css
:root {
  /* Colors - Semantic */
  --color-primary: #2563eb;
  --color-primary-hover: #1d4ed8;
  --color-success: #16a34a;
  --color-warning: #ca8a04;
  --color-error: #dc2626;

  /* Colors - Neutral */
  --color-neutral-50: #fafafa;
  --color-neutral-100: #f4f4f5;
  --color-neutral-700: #3f3f46;
  --color-neutral-900: #18181b;

  /* Spacing - 4px base */
  --space-1: 0.25rem; --space-2: 0.5rem; --space-4: 1rem;
  --space-6: 1.5rem; --space-8: 2rem; --space-16: 4rem;

  /* Typography */
  --font-sans: system-ui, -apple-system, sans-serif;
  --font-mono: ui-monospace, 'Cascadia Code', monospace;
  --text-sm: 0.875rem; --text-base: 1rem; --text-xl: 1.25rem;
}
```

---

## Dark Mode

```css
:root {
  --bg-primary: #ffffff;
  --text-primary: #18181b;
  --border-color: #e4e4e7;
}
:root.dark {
  --bg-primary: #18181b;
  --text-primary: #fafafa;
  --border-color: #3f3f46;
}
```

- MUST persist user preference (localStorage)
- MUST respect `prefers-color-scheme` as default
- MUST NOT flash wrong theme on load

---

## Component Patterns

### Buttons

```css
.btn {
  display: inline-flex; align-items: center; gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  font-weight: 500; border-radius: 0.375rem;
  transition: background-color 150ms;
}
.btn:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
```

- MUST have visible focus state
- MUST be minimum 44x44px touch target on mobile

### Forms

```html
<div class="form-field">
  <label for="email">Email</label>
  <input type="email" id="email" aria-describedby="email-error" aria-invalid="true" />
  <span id="email-error" role="alert">Please enter a valid email</span>
</div>
```

- Labels MUST be visible (no placeholder-only labels)
- Error messages MUST be associated via `aria-describedby`

### Modals

- MUST trap focus within modal
- MUST close on Escape key
- MUST return focus to trigger on close
- SHOULD use `<dialog>` element when possible

---

## Loading and Error States

```tsx
// Loading
<button disabled={isLoading}>
  {isLoading ? <><Spinner aria-hidden="true" /> Saving...</> : 'Save'}
</button>

// Error
<div role="alert" class="error-banner">
  <p>Failed to save changes</p>
  <button onClick={retry}>Retry</button>
</div>
```

- Loading MUST be indicated within 100ms
- Errors MUST explain what went wrong
- MUST NOT show raw error messages to users

---

## Responsive Design

Mobile-first approach is REQUIRED.

```css
:root { --bp-sm: 640px; --bp-md: 768px; --bp-lg: 1024px; }
.container { padding: var(--space-4); }
@media (min-width: 768px) { .container { padding: var(--space-6); } }
```

- Touch targets MUST be minimum 44x44px on mobile
- Text MUST be readable without horizontal scrolling
- Images MUST be responsive (`max-width: 100%`)
