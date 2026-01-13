---
name: ui-design-workflow
description: Full UI design workflow - from idea to working code. Activate when user wants to "build a UI", "design this", "create the interface", "make a frontend", or describes an app/feature they want built. Chains PRD → UX Spec → Build Prompts → Implementation automatically.
location: user
source: Tech Snack University - 3-Step Claude Skill for Perfect UX Design
---

# UI Design Workflow

End-to-end workflow for turning ideas into working UI code. Executes four phases automatically in sequence.

## When to Activate

Trigger phrases:
- "build a UI for..."
- "let's design this"
- "create the interface for..."
- "make a frontend for..."
- "I want to build..."
- "design an app that..."
- Any description of an app/feature/interface the user wants built

## The 4-Phase Pipeline

```
Phase 1: PRD Generation     → What are we building?
Phase 2: UX Specification   → How should it work?
Phase 3: Build Prompts      → How do we build it?
Phase 4: Implementation     → Build it (frontend-design skill)
```

**All four phases run in sequence. Do not skip phases.**

---

## Phase 1: PRD Generation

Generate a demo-grade Product Requirements Document.

**Output file:** `PRD.md` or `{feature-name}-prd.md`

**Include these sections:**

### 1. One-Sentence Problem
> [User] struggles to [do X] because [reason], resulting in [impact].

### 2. Demo Goal
- What must work for success
- What outcome the demo communicates
- Non-goals (out of scope)

### 3. Target User
- Role/context
- Skill level
- Key constraint

### 4. Core Use Case (Happy Path)
- Start condition
- Numbered steps
- End condition

### 5. Functional Decisions
| ID | Function | Notes |
|----|----------|-------|

### 6. UX Decisions
- Entry point
- Inputs/Outputs
- Feedback & States
- Error handling

### 7. Data & Logic
- Input sources
- Processing flow
- Output destinations

**After writing PRD, immediately proceed to Phase 2.**

---

## Phase 2: UX Specification (6 Passes)

Translate the PRD into UX foundations through 6 forced passes.

**Output file:** `UX-spec.md` or `{prd-basename}-ux-spec.md`

### The Iron Law
```
NO VISUAL SPECS UNTIL ALL 6 PASSES COMPLETE
```

### Execute All 6 Passes IN ORDER:

**Pass 1: Mental Model**
- What does the user think is happening?
- What misconceptions are likely?
- What UX principle to reinforce?

**Pass 2: Information Architecture**
- Enumerate ALL concepts user will encounter
- Group into logical buckets
- Classify each: Primary / Secondary / Hidden

**Pass 3: Affordances**
- What is clickable / editable / read-only?
- What signals each action?

**Pass 4: Cognitive Load**
- Where will users hesitate?
- What defaults reduce decisions?
- Where to apply progressive disclosure?

**Pass 5: State Design**
For each major element, enumerate:
| State | User Sees | User Understands | User Can Do |
|-------|-----------|------------------|-------------|
| Empty | | | |
| Loading | | | |
| Success | | | |
| Partial | | | |
| Error | | | |

**Pass 6: Flow Integrity**
- Where could users get lost?
- What must be visible vs implied?
- What are the UX constraints?

**After completing all 6 passes, immediately proceed to Phase 3.**

---

## Phase 3: Build-Order Prompts

Transform the UX spec into sequenced, self-contained prompts.

**Output file:** `build-prompts.md` or `{feature-name}-build-prompts.md`

### Build Order Sequence

```
1. Foundation      → Design tokens, base styles
2. Layout Shell    → Page structure, navigation
3. Core Components → Primary UI elements
4. Interactions    → Drag-drop, connections, pickers
5. States & Feedback → Empty, loading, error states
6. Polish          → Animations, responsive, edge cases
```

### Each Prompt Must Be Self-Contained

Include in every prompt:
- Full context (no "see previous prompt")
- All relevant specs (dimensions, colors, states)
- All interactions for that feature
- Clear constraints (what NOT to include)

### Prompt Template
```markdown
## [Feature Name]

### Context
[What this is and where it fits]

### Requirements
- [Specific requirements with measurements]

### States
- Default: [description]
- Hover: [description]
- [Other states]

### Interactions
- [User interactions]

### Constraints
- [What to exclude]
```

**After generating build prompts, immediately proceed to Phase 4.**

---

## Phase 4: Visual Implementation

Execute the build prompts using `frontend-design` + `design-workflow` skill principles.

### Aesthetic Direction (frontend-design)

Before writing code, commit to a BOLD aesthetic:
- **Choose a tone:** Brutally minimal, maximalist, retro-futuristic, luxury/refined, playful, editorial, industrial, art deco, soft/pastel, etc.
- **Distinctive typography:** NO generic fonts (Inter, Roboto, Arial). Choose characterful fonts.
- **Intentional color:** Dominant colors with sharp accents. No timid, evenly-distributed palettes.
- **Motion with purpose:** Staggered reveals, scroll-triggered effects, hover surprises.
- **Spatial composition:** Asymmetry, overlap, grid-breaking elements, generous negative space.

**NEVER produce "AI slop":** purple gradients on white, cookie-cutter layouts, predictable patterns.

### Accessibility Standards (design-workflow)

All implementations MUST achieve:
- **WCAG 2.1 AA** - 4.5:1 contrast for text, 3:1 for UI components
- **Keyboard navigation** - All interactive elements focusable via Tab
- **Focus states** - Visible focus indicators on all interactive elements
- **Reduced motion** - Respect `prefers-reduced-motion`
- **Screen reader support** - Proper ARIA labels, logical heading hierarchy

### Build Execution Order

Execute prompts from `build-prompts.md` in sequence:

1. **Foundation** - Design tokens, CSS variables, base styles
2. **Layout shell** - Page structure, navigation, panels
3. **Core components** - Each component per its prompt
4. **Interactions** - Interactivity once components exist
5. **States & feedback** - Empty, loading, error states
6. **Polish** - Animations, responsive, edge cases

### For Each Prompt

1. Read the self-contained prompt from `build-prompts.md`
2. Apply distinctive aesthetic (frontend-design principles)
3. Ensure accessibility compliance (design-workflow standards)
4. Write working, production-grade code
5. Move to next prompt

---

## Output Summary

After completing all phases:

```markdown
## UI Design Workflow Complete

### Files Generated:
1. `PRD.md` - Product requirements
2. `UX-spec.md` - UX specification (6 passes)
3. `build-prompts.md` - Sequenced build prompts
4. [Implementation files] - Working UI code

### Aesthetic Direction:
[Chosen tone and key visual decisions]

### Components Built:
1. [Component 1] - [status]
2. [Component 2] - [status]
...
```

---

## Rules

1. **Never skip phases** - All four phases execute in order
2. **Always write to files** - Don't output to conversation only
3. **Complete the 6 UX passes** - No shortcuts in Phase 2
4. **Self-contained prompts** - Each build prompt works standalone
5. **Ask once, then proceed** - Max 1 clarifying question, then make assumptions
6. **Distinctive visuals** - No generic "AI slop" aesthetics
7. **Accessible by default** - WCAG compliance built into every component

## Skill Integration

This workflow automatically applies:
- `frontend-design` - Distinctive, memorable visual execution
- `design-workflow` - Accessibility, design tokens, component patterns
