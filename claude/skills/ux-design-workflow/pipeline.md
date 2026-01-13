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
Phase 1: PRD Generation     → What are we building?
Phase 2: UX Specification   → How should it work?
Phase 3: Build Prompts      → How do we build it?
Phase 4: Implementation     → Build it
```

**All four phases run in sequence. Do not skip phases.**

---

## Phase 1: PRD Generation

Generate a demo-grade Product Requirements Document.

**Output file:** `PRD.md`

**Sections:**

1. **One-Sentence Problem**
   > [User] struggles to [do X] because [reason], resulting in [impact].

2. **Demo Goal**
   - What must work for success
   - Non-goals (out of scope)

3. **Target User**
   - Role/context, skill level, key constraint

4. **Core Use Case (Happy Path)**
   - Start condition → Numbered steps → End condition

5. **Functional Decisions**
   | ID | Function | Notes |

6. **UX Decisions**
   - Entry point, inputs/outputs, feedback & states, error handling

7. **Data & Logic**
   - Input sources, processing flow, output destinations

---

## Phase 2: UX Specification (6 Passes)

Translate the PRD into UX foundations through 6 forced passes.

**Output file:** `UX-spec.md`

### The Iron Law

```
NO VISUAL SPECS UNTIL ALL 6 PASSES COMPLETE
```

### Execute All 6 Passes IN ORDER:

**Pass 1: Mental Model**
- What does the user think is happening?
- What misconceptions are likely?

**Pass 2: Information Architecture**
- Enumerate ALL concepts user will encounter
- Classify each: Primary / Secondary / Hidden

**Pass 3: Affordances**
- What is clickable / editable / read-only?
- What signals each action?

**Pass 4: Cognitive Load**
- Where will users hesitate?
- What defaults reduce decisions?

**Pass 5: State Design**
| State | User Sees | User Understands | User Can Do |
|-------|-----------|------------------|-------------|
| Empty | | | |
| Loading | | | |
| Success | | | |
| Error | | | |

**Pass 6: Flow Integrity**
- Where could users get lost?
- What must be visible vs implied?

---

## Phase 3: Build-Order Prompts

Transform the UX spec into sequenced, self-contained prompts.

**Output file:** `build-prompts.md`

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

Include:
- Full context (no "see previous prompt")
- All relevant specs (dimensions, colors, states)
- All interactions for that feature
- Clear constraints (what NOT to include)

---

## Phase 4: Visual Implementation

Execute the build prompts with distinctive aesthetics.

### Before Writing Code

See [aesthetics.md](./aesthetics.md) for:
- Choosing a bold tone (minimal, maximalist, retro-futuristic, etc.)
- Distinctive typography (no generic fonts)
- Intentional color (dominant colors with sharp accents)
- Motion with purpose

### Accessibility Standards

All implementations MUST achieve (see parent SKILL.md):
- WCAG 2.1 AA - 4.5:1 contrast for text
- Keyboard navigation - All elements focusable via Tab
- Focus states - Visible indicators on all interactive elements
- Reduced motion - Respect `prefers-reduced-motion`

### Build Execution Order

1. **Foundation** - Design tokens, CSS variables
2. **Layout shell** - Page structure, navigation
3. **Core components** - Each per its prompt
4. **Interactions** - Interactivity once components exist
5. **States & feedback** - Empty, loading, error states
6. **Polish** - Animations, responsive, edge cases

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
```

---

## Rules

1. **Never skip phases** - All four phases execute in order
2. **Always write to files** - Don't output to conversation only
3. **Complete the 6 UX passes** - No shortcuts in Phase 2
4. **Self-contained prompts** - Each build prompt works standalone
5. **Ask once, then proceed** - Max 1 clarifying question, then make assumptions
6. **Distinctive visuals** - No generic aesthetics
7. **Accessible by default** - WCAG compliance built into every component
