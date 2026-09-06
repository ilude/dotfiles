# Frontend Aesthetics Guidelines

Create distinctive, production-grade frontend interfaces that avoid generic aesthetics.

## Design Thinking

Before coding, commit to a BOLD aesthetic direction:

- **Purpose**: What problem does this interface solve? Who uses it?
- **Tone**: Pick an extreme: brutally minimal, maximalist chaos, retro-futuristic, organic/natural, luxury/refined, playful/toy-like, editorial/magazine, brutalist/raw, art deco/geometric, soft/pastel, industrial/utilitarian
- **Differentiation**: What makes this UNFORGETTABLE? What's the one thing someone will remember?

**Choose a clear conceptual direction and execute it with precision. Bold maximalism and refined minimalism both work - the key is intentionality, not intensity.**

---

## Typography

Choose fonts that are beautiful, unique, and interesting:

- **NEVER use**: Arial, Inter, Roboto, system fonts
- **DO use**: Distinctive choices that elevate the frontend
- **Pair fonts**: A distinctive display font with a refined body font

---

## Color & Theme

Commit to a cohesive aesthetic:

- Use CSS variables for consistency
- Dominant colors with sharp accents outperform timid, evenly-distributed palettes
- **AVOID**: Purple gradients on white backgrounds

---

## Motion

Use animations for effects and micro-interactions:

- Prioritize CSS-only solutions for HTML
- Use Motion library for React when available
- Focus on high-impact moments: one well-orchestrated page load with staggered reveals (`animation-delay`) creates more delight than scattered micro-interactions
- Use scroll-triggering and hover states that surprise

---

## Spatial Composition

- Unexpected layouts
- Asymmetry
- Overlap
- Diagonal flow
- Grid-breaking elements
- Generous negative space OR controlled density

---

## Anti-Patterns

NEVER use these generic patterns:

| Category | What to Avoid |
|----------|--------------|
| Fonts | Inter, Roboto, Arial, system fonts |
| Colors | Purple gradients on white, gray/blue enterprise palettes |
| Layout | Predictable component patterns, cookie-cutter design |
| Motion | No animation or only basic fades |

---

## Implementation Notes

Match implementation complexity to the aesthetic vision. Vary themes, fonts, and aesthetic directions across designs.
